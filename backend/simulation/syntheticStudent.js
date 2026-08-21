'use strict';

const Groq = require('groq-sdk');
const { wrapWithReasoningDefaults } = require('../lib/llmClient');
const { compose } = require('./personas');
const { GROQ_API_KEY, GROQ_MODEL } = require('./config');
const { make } = require('./logger');
const { sleep, jitter } = require('./apiClient');

let groqClient = null;
function getGroq() {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set — cannot run LLM-backed sim.');
  if (!groqClient) groqClient = wrapWithReasoningDefaults(new Groq({ apiKey: GROQ_API_KEY }));
  return groqClient;
}

function pickDistractor(correctIndex, optionCount) {
  const candidates = [];
  for (let i = 0; i < optionCount; i++) if (i !== correctIndex) candidates.push(i);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0.5;
  if (x < 0.02) return 0.02;
  if (x > 0.98) return 0.98;
  return x;
}

/**
 * A SyntheticStudent composes a background + position into a stateful agent
 * that (a) generates free-text replies through Groq for chat/reflection turns
 * and (b) answers quiz MCQs via a gated correct/distractor pick driven by its
 * position-in-class ability. It has no knowledge of the server's internals —
 * everything reaches the backend over HTTP through a paired StudentApiClient.
 */
class SyntheticStudent {
  constructor({ backgroundId, positionId, username, name }) {
    this.persona = compose(backgroundId, positionId);
    this.username = username;
    this.name = name;
    this.log = make(`student:${username}`);
    this.turnCount = 0;
  }

  profileUpdatePayload() {
    const { profileFields } = this.persona;
    return {
      ...profileFields,
      onboardingCompleted: true,
    };
  }

  priorKnowledgePayload() {
    const { profileFields } = this.persona;
    // Enrollment.priorKnowledge.selfRating is the lowercase enum
    // ['none', 'beginner', 'intermediate', 'advanced']; personas store the
    // UI-facing capitalized form ('Beginner', 'Intermediate', ...) for the
    // user-profile side. Normalize here so /courses/join validates.
    const rawRating = (profileFields.selfRating || '').toString().toLowerCase();
    const ratingMap = {
      '': 'none',
      none: 'none',
      basic: 'beginner',
      beginner: 'beginner',
      intermediate: 'intermediate',
      advanced: 'advanced',
    };
    const selfRating = ratingMap[rawRating] || 'none';
    return {
      programmingExposure: profileFields.programmingExposure,
      motivationType: profileFields.motivationType,
      selfConfidence: profileFields.selfConfidence,
      selfRating,
    };
  }

  async generateReply({ tutorMessage, history = [], hint = null }) {
    this.turnCount += 1;
    const groq = getGroq();

    const systemPrompt = [
      this.persona.systemPrompt,
      '',
      'Respond as the student. Do not narrate. Do not wrap in quotes.',
      'Never break character. Never say you are an AI. Never use emoji.',
      `Keep it under ${this.persona.background.answerStyle.preferredLengthChars} chars.`,
      hint ? `Hint for this turn: ${hint}` : '',
    ].filter(Boolean).join('\n');

    const msgs = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 600) })),
      { role: 'user', content: `Tutor said: ${String(tutorMessage || '').slice(0, 1200)}` },
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: msgs,
          temperature: 0.85,
          // Sized for gpt-oss: reasoning eats 60-90 tokens before content
          // (180 was a Llama-era budget and truncated replies mid-word).
          max_tokens: 600,
          reasoning_effort: 'low',
        });
        const text = res.choices?.[0]?.message?.content?.trim();
        if (text) return this._cleanReply(text);
      } catch (e) {
        const backoff = jitter(1200 * attempt);
        this.log.warn(`groq reply error "${e.message}", retry in ${backoff}ms (${attempt}/3)`);
        await sleep(backoff);
      }
    }
    return this._fallbackReply(tutorMessage);
  }

  _cleanReply(text) {
    const t = text
      .replace(/^"|"$/g, '')
      .replace(/^Student:\s*/i, '')
      .replace(/^Me:\s*/i, '')
      .trim();
    if (t.length <= 500) return t;
    // Never cut mid-word or mid-code: finish an open ``` block, else the last
    // sentence end within budget, else a word boundary.
    if (((t.slice(0, 500).match(/```/g) || []).length % 2) === 1) {
      const lastOpen = t.slice(0, 500).lastIndexOf('```');
      const close = t.indexOf('```', lastOpen + 3);
      if (close !== -1) return t.slice(0, close + 3).trim();
      return `${t.trim()}\n\`\`\``;
    }
    const window = t.slice(0, 500);
    const lastSentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
    if (lastSentence > 250) return window.slice(0, lastSentence + 1).trim();
    const lastSpace = window.lastIndexOf(' ');
    return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
  }

  _fallbackReply() {
    const { position } = this.persona;
    if (position.id === 'aboutToFail') return "I'm a little lost honestly, can you say that again?";
    if (position.id === 'excellent') return 'Got it, makes sense.';
    return "I think I follow, let me try. Is it about the main idea you mentioned?";
  }

  /**
   * Gated quiz answer. If the question comes with `correctIndex`, the
   * student flips a biased coin (position.quiz.baseCorrectProb + noise) and
   * either picks correct or a random distractor. If no correctIndex (e.g.
   * an open prompt), returns 0.
   */
  answerQuizQuestion(question) {
    const { quiz } = this.persona.position;
    const noise = (Math.random() - 0.5) * 2 * (quiz.noiseStddev || 0);
    const p = clamp01(quiz.baseCorrectProb + noise);
    const willBeCorrect = Math.random() < p;

    const correctIndex = Number.isInteger(question?.correctIndex) ? question.correctIndex : 0;
    const optionCount = Array.isArray(question?.options) ? question.options.length : 4;

    if (willBeCorrect) return { id: question.id, userIndex: correctIndex, intendedCorrect: true };
    return { id: question.id, userIndex: pickDistractor(correctIndex, optionCount), intendedCorrect: false };
  }

  /**
   * Reflection-phase gating. When the chat route asks a milestone-check
   * question, position.abilityFn decides whether this student should answer
   * correctly. The runner uses the returned hint to nudge generateReply.
   */
  reflectionIntent() {
    const p = clamp01(this.persona.position.abilityFn());
    const willBeCorrect = Math.random() < p;
    const confusion = Math.random() < this.persona.position.reflection.confusionRate;
    return {
      shouldBeCorrect: willBeCorrect,
      shouldExpressConfusion: confusion && !willBeCorrect,
      hint: willBeCorrect
        ? 'Answer confidently and correctly. Give a concise, accurate explanation in your own words.'
        : (confusion
          ? 'Say you are confused and ask for a rephrase or a small example.'
          : 'Give a partial or slightly off answer — close but missing the key idea.'),
    };
  }

  shouldGiveUp() {
    return Math.random() < this.persona.position.retryPolicy.giveUpProbability;
  }
}

module.exports = { SyntheticStudent };
