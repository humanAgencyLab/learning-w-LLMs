/**
 * Turn composer (multi-agent path) — builds ONE coherent, student-adaptive
 * tutor message from decisions the pipeline already made.
 *
 * This module owns NO flow logic: `deriveFlowAction` is a pure label over
 * upstream decisions (grading, milestone-index change, module completion,
 * refusal), and `composeTutorTurn` generates + deterministically cleans one
 * message. Grading/advancement stay in chatRoutes and are unchanged.
 */
const { callTeacherAPI, callTeacherAPIStream } = require('../services/teacherService');
const { buildTurnPrompt } = require('../prompts/tutor_turn_prompt');

/** The eight flow labels, persisted next to {messageType, verdict}. */
const FLOW_ACTIONS = [
  'first_teach', 'continue', 'clarify', 'correct_retry',
  'advance_milestone', 'complete_module', 'start_quiz', 'refuse',
];

/**
 * Flows that emit STRUCTURED parts so the renderer cards the question
 * consistently. Full teaching shape {intro, developed body, question}:
 * first_teach and advance_milestone (complete_module = short summary + quiz
 * CTA). LIGHT shape {body, question} — no intro, no teaching body: clarify
 * (direct answer) and correct_retry (targeted correction). Only `continue`
 * stays prose.
 */
const STRUCTURED_FLOWS = ['first_teach', 'clarify', 'correct_retry', 'advance_milestone', 'complete_module'];
const LIGHT_FLOWS = ['clarify', 'correct_retry'];

/** Full-teach body ceiling; a stricter instructor cap wins. */
const TEACH_BODY_CAP = 400;
const TEACH_BODY_TARGET = 250;
const RETRY_BODY_CAP = 160;
const CLARIFY_BODY_CAP = 140;

/**
 * Label over existing decisions — NOT new flow logic. Every input is a value
 * the route already computed.
 */
function deriveFlowAction({
  refused,
  startQuiz,
  moduleJustCompleted,
  advancedToNextMilestone,
  assessment,
  wasMilestoneStart,
}) {
  if (refused) return 'refuse';
  if (startQuiz) return 'start_quiz';
  if (moduleJustCompleted) return 'complete_module';
  if (advancedToNextMilestone) return 'advance_milestone';
  if (assessment) {
    if (assessment.responseType === 'clarification_request') return 'clarify';
    if (assessment.understood && assessment.recommendation !== 'clarify_again') return 'advance_milestone';
    if (assessment.understood) return 'clarify'; // understood-but-clarify-again
    return 'correct_retry'; // graded wrong, staying on this milestone
  }
  if (wasMilestoneStart) return 'first_teach';
  return 'continue';
}

/**
 * Deterministic trailing-question extraction — the backstop for a hybrid
 * answer+question when the classifier's embeddedQuestion comes back empty
 * (it's LLM output and populates inconsistently). Returns the last
 * question-shaped clause of a message that ALSO contains non-question content,
 * or null. Only meaningful on a graded-answer turn (the caller gates on that),
 * so a pure clarification is never mistaken for a hybrid.
 */
function extractTrailingQuestion(message) {
  const text = String(message || '').trim();
  if (!text.includes('?')) return null;
  // Split on sentence enders and em/en dashes; keep the segment before each '?'.
  const segments = text.split(/(?<=[.?!])\s+|\s+[—–-]\s+/).map((s) => s.trim()).filter(Boolean);
  const questions = segments.filter((s) => s.endsWith('?') || /^(can|could|would|should|does|do|is|are|what|why|how|when|where|which|will|won't|isn't|doesn't)\b/i.test(s));
  if (!questions.length) return null;
  // Require some non-question content too, else it's a pure question (clarify).
  const nonQ = segments.filter((s) => !questions.includes(s)).join(' ').trim();
  if (nonQ.length < 8) return null;
  return questions[questions.length - 1].replace(/\s+/g, ' ').slice(0, 300);
}

/** Instructor word cap from free-text guidelines, or null. */
function extractWordCap(globalInstructions) {
  const t = String(globalInstructions || '').toLowerCase();
  // "under 150 words", "at most 150 words", "150 words or fewer", "max 150 words",
  // "keep ... to 150 words", "no more than 150 words".
  const m = t.match(/\b(?:under|below|at most|no more than|max(?:imum)?(?:\s+of)?|up to|within|fewer than|less than)\s+(\d{2,4})\s+words?\b/)
    || t.match(/\b(\d{2,4})\s+words?\s+(?:or fewer|or less|max(?:imum)?|cap|limit)\b/)
    || t.match(/\bkeep\b[^.]{0,40}?\b(\d{2,4})\s+words?\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 20 && n <= 2000 ? n : null;
}

/**
 * Student-quality signals for adaptation, from data already on the session:
 * enrollment priors (session.profile) + this turn's grade + retry state +
 * the verdict history stamped on prior assistant messages this module.
 */
function computeAdaptation({ session, assessment, retryCount, userMessage }) {
  const profile = session?.profile || {};
  const priorBits = [];
  if (profile.skillLevel) priorBits.push(`skill ${profile.skillLevel}`);
  if (profile.programmingExposure && profile.programmingExposure !== 'unknown') priorBits.push(`programming exposure ${profile.programmingExposure}`);
  if (typeof profile.selfConfidence === 'number') priorBits.push(`self-confidence ${profile.selfConfidence}/5`);
  if (profile.background) priorBits.push(String(profile.background).slice(0, 80));

  // Verdict history this session (metadata stamped by the route).
  const verdicts = (session?.messages || [])
    .filter((m) => m.role === 'assistant' && m.metadata?.verdict)
    .slice(-8)
    .map((m) => m.metadata.verdict);
  const corrects = verdicts.filter((v) => v === 'correct').length;
  const wrongs = verdicts.filter((v) => v === 'incorrect').length;

  const answerLen = String(userMessage || '').trim().split(/\s+/).filter(Boolean).length;
  let answerQuality = 'n/a';
  if (assessment) {
    if (assessment.responseType === 'clarification_request') answerQuality = 'asked a question rather than answering';
    else if (assessment.understood && assessment.confidence === 'high' && answerLen >= 8) answerQuality = 'full, precise answer';
    else if (assessment.understood) answerQuality = 'correct but brief';
    else answerQuality = 'incorrect or incomplete';
  }

  // Level: prior + demonstrated. Retrying now, or repeated wrongs → struggling.
  let level = 'onTrack';
  const priorStrong = profile.skillLevel === 'Advanced' || profile.programmingExposure === 'lots';
  const priorWeak = profile.skillLevel === 'Beginner' || (profile.programmingExposure === 'none' && profile.selfConfidence != null && profile.selfConfidence <= 2);
  if ((retryCount || 0) >= 1 || wrongs > corrects) level = 'struggling';
  else if ((assessment?.understood && assessment?.confidence === 'high' && answerLen >= 8) || (priorStrong && corrects >= 1)) level = 'strong';
  else if (priorWeak && corrects === 0) level = 'struggling';

  return {
    level,
    retried: (retryCount || 0) >= 1,
    priorSummary: priorBits.join(', ') || 'not specified',
    answerQuality,
  };
}

// --- deterministic backstops ------------------------------------------------

const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

/** Drop paragraphs/sentences that duplicate each other or prior-shown content. */
function dedup(message, priorNormalizedParagraphs = []) {
  const seen = new Set(priorNormalizedParagraphs);
  const outParas = [];
  for (const para of String(message || '').split(/\n{2,}/)) {
    const key = normalize(para);
    if (!key) { outParas.push(para); continue; }
    if (seen.has(key)) continue; // exact paragraph repeat (this msg or prior)
    seen.add(key);
    // sentence-level repeat within the paragraph
    const sentences = para.split(/(?<=[.!?])\s+/);
    const seenS = new Set();
    const keptS = [];
    for (const s of sentences) {
      const ks = normalize(s);
      if (ks && seenS.has(ks)) continue;
      if (ks) seenS.add(ks);
      keptS.push(s);
    }
    outParas.push(keptS.join(' '));
  }
  return outParas.join('\n\n').trim();
}

/** Trim the message body to the instructor word cap (backstop for the prompt). */
function enforceWordCap(message, wordCap) {
  if (!wordCap) return message;
  const words = String(message || '').split(/\s+/).filter(Boolean);
  // Allow the opener + next-step overhead: cap the whole message at wordCap*1.6,
  // floored so a one-line next step is never truncated away.
  const hardMax = Math.max(wordCap + 40, Math.round(wordCap * 1.6));
  if (words.length <= hardMax) return message;
  // Keep the last sentence (usually the question / next step) intact.
  const sentences = String(message).split(/(?<=[.!?])\s+/);
  const last = sentences[sentences.length - 1];
  let acc = [];
  let count = 0;
  for (const s of sentences.slice(0, -1)) {
    const w = s.split(/\s+/).filter(Boolean).length;
    if (count + w > hardMax - last.split(/\s+/).filter(Boolean).length) break;
    acc.push(s); count += w;
  }
  return `${acc.join(' ')}\n\n${last}`.trim();
}

/** Normalized paragraphs of prior assistant messages for THIS milestone. */
function priorMilestoneParagraphs(session) {
  const idx = session?.meta?.currentMilestoneIndex ?? 0;
  const out = [];
  for (const m of session?.messages || []) {
    if (m.role !== 'assistant') continue;
    if ((m.metadata?.milestoneIndexAtSend ?? idx) !== idx) continue;
    for (const para of String(m.content || '').split(/\n{2,}/)) {
      const k = normalize(para);
      if (k.length > 40) out.push(k); // ignore short openers/one-liners
    }
  }
  return out;
}

/** One-line summaries of what was already explained this milestone (for the prompt). */
function alreadyShownSummaries(session) {
  const idx = session?.meta?.currentMilestoneIndex ?? 0;
  const summaries = [];
  for (const m of session?.messages || []) {
    if (m.role !== 'assistant') continue;
    if ((m.metadata?.milestoneIndexAtSend ?? idx) !== idx) continue;
    const first = String(m.content || '').split(/\n{2,}/).map((p) => p.trim()).find((p) => p.length > 60);
    if (first) summaries.push(first.slice(0, 140));
  }
  return summaries.slice(-4);
}

/**
 * Repair near-JSON the model emits on long bodies: real (unescaped) newlines
 * and tabs inside string values, trailing commas, and a missing closing brace.
 * Walks the text tracking in-string state so structural whitespace is left
 * alone and only in-string control characters get escaped.
 */
function repairJsonText(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of String(text || '')) {
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { out += ch; inString = true; continue; }
    out += ch;
  }
  // Unterminated string at EOF → close it.
  if (inString) out += '"';
  // Trailing commas before } or ].
  out = out.replace(/,\s*([}\]])/g, '$1');
  // Balance braces (missing closers on truncated output).
  const opens = (out.match(/\{/g) || []).length;
  const closes = (out.match(/\}/g) || []).length;
  if (opens > closes) out += '}'.repeat(opens - closes);
  return out;
}

/**
 * String values may carry LITERAL backslash-n sequences (the model double
 * escaping) — turn them into real paragraph breaks so "\n\n" never renders
 * as visible text.
 */
function cleanPartValue(v) {
  if (typeof v !== 'string') return '';
  return v
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .trim();
}

/** Does a string still look like a leaked parts-object rather than prose? */
function looksLikeJsonLeak(text) {
  const t = String(text || '').trim();
  if (/^[{[]/.test(t)) return true;
  if (/"(?:intro|body|question)"\s*:/.test(t)) return true;
  if (/\\n\\n/.test(t)) return true;
  return false;
}

/** Parse the model's JSON {intro, body, question}, tolerant of fences/prose/dirt. */
function parseParts(raw) {
  const text = String(raw || '');
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  // Greedy outer braces (bodies contain no nested objects, but be safe).
  const braced = fenced ? fenced[1] : (text.match(/\{[\s\S]*\}/) || [])[0] || (
    // Missing closing brace: take from the first '{' to EOF and let repair close it.
    text.includes('{') ? text.slice(text.indexOf('{')) : null
  );
  if (!braced) return null;
  let obj = null;
  try { obj = JSON.parse(braced); } catch {
    try { obj = JSON.parse(repairJsonText(braced)); } catch { obj = null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const intro = cleanPartValue(obj.intro);
  const body = cleanPartValue(obj.body);
  const question = cleanPartValue(obj.question);
  if (!body && !question) return null;
  return { intro, body, question };
}

// --- assessment anchoring ---------------------------------------------------

const QUESTION_STOPWORDS = new Set(['what', 'which', 'where', 'when', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'of', 'in', 'to', 'for', 'and', 'or', 'that', 'this', 'with', 'how', 'why', 'can', 'could', 'would', 'your', 'you', 'about', 'between', 'from', 'have', 'has', 'will']);
const contentWords = (s) => new Set(
  String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !QUESTION_STOPWORDS.has(w))
);

/**
 * Does a composed question still test THIS milestone's objective? Content-word
 * overlap with the outstanding question or the milestone text. Bias toward
 * anchoring: a false replacement merely restates the original question; a
 * false keep lets an evasive student steer the assessment off the objective.
 */
function questionOnObjective(question, outstandingCheck, milestoneText) {
  const q = contentWords(question);
  if (!q.size) return false;
  const anchor = contentWords(`${outstandingCheck || ''} ${milestoneText || ''}`);
  let overlap = 0;
  for (const w of q) if (anchor.has(w)) overlap += 1;
  return overlap >= 2 || (q.size <= 3 && overlap >= 1);
}

const ANCHOR_LINE = (outstandingCheck) => `Now, back to the question: **${String(outstandingCheck).trim()}**`;

/**
 * Prose turns (clarify): if the message's trailing question drifted off the
 * milestone objective, strip it and re-anchor to the original outstanding
 * question. Tangents get answered; the assessment does not follow them.
 */
function anchorProseQuestion(message, outstandingCheck, milestoneText) {
  if (!outstandingCheck) return message;
  const text = String(message || '').trim();
  if (text.includes(String(outstandingCheck).trim())) return text; // already anchored
  const sentences = text.split(/(?<=[.!?])\s+/);
  const last = sentences[sentences.length - 1] || '';
  if (last.trim().endsWith('?') && !questionOnObjective(last, outstandingCheck, milestoneText)) {
    return `${sentences.slice(0, -1).join(' ')}\n\n${ANCHOR_LINE(outstandingCheck)}`.trim();
  }
  if (!last.trim().endsWith('?')) {
    return `${text}\n\n${ANCHOR_LINE(outstandingCheck)}`;
  }
  return text;
}

/** Keep an intro to a single sentence (no stacked openers). */
function firstSentence(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

/** Body word cap for a structured flow (instructor cap wins when stricter). */
function bodyCapFor(flowAction, instructorCap) {
  if (flowAction === 'complete_module') return Math.min(instructorCap || 120, 120);
  if (flowAction === 'correct_retry') return Math.min(instructorCap || RETRY_BODY_CAP, RETRY_BODY_CAP);
  if (flowAction === 'clarify') return Math.min(instructorCap || CLARIFY_BODY_CAP, CLARIFY_BODY_CAP);
  // first_teach / advance_milestone: up to 400, or the stricter instructor cap.
  return instructorCap ? Math.min(instructorCap, TEACH_BODY_CAP) : TEACH_BODY_CAP;
}

/**
 * Compose one tutor message for a teaching-ish flow
 * (first_teach | continue | clarify | correct_retry | advance_milestone |
 *  complete_module). refuse/start_quiz are composed deterministically by the
 * route and never reach here.
 *
 * Structured flows (STRUCTURED_FLOWS) return {intro, body, question} parts for
 * three-block UI rendering AND a concatenated `message` for everything that
 * consumes message text. clarify/continue return message only (parts null).
 *
 * @returns {Promise<{ message: string, parts: object|null, flowAction: string }>}
 */
async function composeTutorTurn({
  session,
  userMessage,
  flowAction,
  verdict,
  assessment,
  embeddedQuestion,
  forceCompleted,
  retryCount,
  globalInstructions,
  streamCallback,
}) {
  const activeModule = session?.plan?.find((m) => m.id === session.activeModuleId);
  const idx = session?.meta?.currentMilestoneIndex ?? 0;
  const milestoneText = activeModule?.milestones?.[idx]?.text || '';
  const nextMilestoneText = flowAction === 'advance_milestone'
    ? (activeModule?.milestones?.[idx]?.text || '')
    : (activeModule?.milestones?.[idx + 1]?.text || '');

  const wordCap = extractWordCap(globalInstructions);
  const adaptation = computeAdaptation({ session, assessment, retryCount, userMessage });
  const structured = STRUCTURED_FLOWS.includes(flowAction);
  const light = LIGHT_FLOWS.includes(flowAction);
  const bodyCap = structured ? bodyCapFor(flowAction, wordCap) : null;

  const prompt = buildTurnPrompt({
    topicName: session?.topic || 'the subject',
    moduleTitle: activeModule?.title || '',
    milestoneText,
    nextMilestoneText,
    flowAction,
    verdict,
    forceCompleted: !!forceCompleted,
    outstandingCheck: session?.meta?.outstandingCheck || '',
    studentMessage: userMessage,
    embeddedQuestion: embeddedQuestion || null,
    adaptation,
    wordCap,
    points: session?.points || 0,
    gems: session?.gems || 0,
    alreadyShownSummaries: alreadyShownSummaries(session),
    structured,
    light,
    bodyWordTarget: structured && !light ? Math.min(TEACH_BODY_TARGET, bodyCap) : undefined,
    bodyWordCap: bodyCap || undefined,
  });

  const outstanding = session?.meta?.outstandingCheck || '';
  let raw;
  try {
    // Structured turns generate JSON (API-enforced via response_format), so
    // they cannot stream readable text — the done-frame carries the full
    // composed message (the client replaces streamed text with it). Prose
    // flows may still stream.
    if (!structured && typeof streamCallback === 'function') {
      raw = await callTeacherAPIStream(prompt, 1400, session, { onChunk: streamCallback, globalInstructions: globalInstructions || '' });
    } else {
      raw = await callTeacherAPI(prompt, 1400, session, null, globalInstructions || '', structured ? { jsonMode: true } : {});
    }
  } catch (err) {
    return { message: '', parts: null, flowAction, error: err.message };
  }

  const priorParas = priorMilestoneParagraphs(session);

  if (structured) {
    let parsed = parseParts(raw);

    // OUTPUT-BOUNDARY FALLBACK: if the parts can't be recovered even after
    // repair, regenerate ONCE as plain prose — a student must never see raw
    // JSON or literal \n escapes. Logged loudly with the flowAction.
    if (!parsed) {
      console.error('[turnComposer] structured parse failed after repair — regenerating as prose', { flowAction, sample: String(raw || '').slice(0, 160) });
      try {
        const prosePrompt = buildTurnPrompt({
          topicName: session?.topic || 'the subject',
          moduleTitle: activeModule?.title || '',
          milestoneText,
          nextMilestoneText,
          flowAction,
          verdict,
          forceCompleted: !!forceCompleted,
          outstandingCheck: outstanding,
          studentMessage: userMessage,
          embeddedQuestion: embeddedQuestion || null,
          adaptation,
          wordCap,
          points: session?.points || 0,
          gems: session?.gems || 0,
          alreadyShownSummaries: alreadyShownSummaries(session),
          structured: false,
        });
        raw = await callTeacherAPI(prosePrompt, 1400, session, null, globalInstructions || '');
      } catch (regenErr) {
        console.error('[turnComposer] prose regeneration failed too', { flowAction, error: regenErr.message });
      }
    }

    if (parsed) {
      // Light flows (clarify, correct_retry) carry NO intro — a direct
      // answer/correction plus the anchored question, so the renderer cards
      // the question without the turn reading like a fresh lesson.
      const intro = light ? '' : firstSentence(parsed.intro);
      // Dedup body against the intro and prior-shown paragraphs; cap the body.
      let body = dedup(parsed.body, [...priorParas, normalize(intro)]);
      body = enforceWordCap(body, bodyCap);
      let question = parsed.question;
      // complete_module: guarantee the quiz call-to-action is present.
      if (flowAction === 'complete_module' && !/start\s*quiz/i.test(question)) {
        question = `${question ? question.replace(/\s*$/, ' ') : ''}When you're ready, click **Start Quiz** or type **"start quiz"**.`.trim();
      }
      // ASSESSMENT ANCHOR: a clarify/retry question must keep testing THIS
      // milestone. If the model's question drifted off the objective (or came
      // back empty), replace it with the original outstanding question.
      if (light && outstanding
        && (!question || !questionOnObjective(question, outstanding, milestoneText))
        && !String(question || '').includes(String(outstanding).trim())) {
        question = ANCHOR_LINE(outstanding);
      }
      // A light body must not ALSO end in an inline question — the question
      // lives in its own part so the renderer cards it consistently.
      if (light) {
        const bodySentences = body.split(/(?<=[.!?])\s+/);
        if (bodySentences.length > 1 && bodySentences[bodySentences.length - 1].trim().endsWith('?')) {
          body = bodySentences.slice(0, -1).join(' ').trim();
        }
      }
      const parts = { intro, body, question };
      const message = [intro, body, question].filter(Boolean).join('\n\n').trim();
      // Boundary guard: never let anything JSON-shaped through.
      if (message && !looksLikeJsonLeak(message)) return { message, parts, flowAction };
    }
    // fall through: prose handling of (possibly regenerated) raw text
  }

  let message = dedup(raw, priorParas);
  message = enforceWordCap(message, wordCap);
  // Prose clarify turns: answer the tangent, but END anchored to the
  // milestone's own question — an evasive student cannot steer the
  // assessment off the objective indefinitely.
  if ((flowAction === 'clarify' || flowAction === 'correct_retry') && outstanding) {
    message = anchorProseQuestion(message, outstanding, milestoneText);
  }
  // Final boundary guard: a JSON-shaped string must never reach the student.
  if (looksLikeJsonLeak(message)) {
    console.error('[turnComposer] output still JSON-shaped after fallback — recovering parts as prose', { flowAction });
    const rescued = parseParts(message);
    message = rescued
      ? [firstSentence(rescued.intro), rescued.body, rescued.question].filter(Boolean).join('\n\n').trim()
      : message.replace(/\\n/g, '\n').replace(/^[{[\s]+|[}\]\s]+$/g, '').replace(/"(intro|body|question)"\s*:\s*"?/g, '').replace(/",?\s*$/gm, '').trim();
  }
  return { message: message || String(raw || '').trim(), parts: null, flowAction };
}

module.exports = {
  FLOW_ACTIONS,
  STRUCTURED_FLOWS,
  LIGHT_FLOWS,
  deriveFlowAction,
  extractWordCap,
  extractTrailingQuestion,
  computeAdaptation,
  composeTutorTurn,
  // exported for unit tests
  _parseParts: parseParts,
  _repairJsonText: repairJsonText,
  _cleanPartValue: cleanPartValue,
  _looksLikeJsonLeak: looksLikeJsonLeak,
  _questionOnObjective: questionOnObjective,
  _anchorProseQuestion: anchorProseQuestion,
  _bodyCapFor: bodyCapFor,
  _firstSentence: firstSentence,
  _dedup: dedup,
  _enforceWordCap: enforceWordCap,
};
