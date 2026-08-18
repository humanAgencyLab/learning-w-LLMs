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
// When the instructor gives STRUCTURAL directives (hook-first, no-examples,
// question-first, ...), the teaching body tightens to hook + focused
// explanation rather than the default developed lecture.
const DIRECTIVE_BODY_CAP = 220;
const DIRECTIVE_BODY_TARGET = 150;

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
 * Pedagogical STRUCTURE directives from the instructor's free-text teaching
 * instructions (RQ-A). The instructions must shape HOW a teaching turn is
 * built — opening style, example use, code use, concision — not just its
 * tone. Nothing here hardcodes a style: every field is null/absent unless
 * the instructor asked for it, and the default prompt is unchanged when no
 * directive is found.
 */
function extractTeachingDirectives(globalInstructions) {
  const t = String(globalInstructions || '').toLowerCase();
  if (!t.trim()) return { openingStyle: null, examples: null, code: null, concise: false, any: false };

  let openingStyle = null;
  // example/hook first: "hook the student with an example", "start with an
  // example/scenario/analogy/story", "example first", "open with a real-world case"
  if (/\bhook\b/.test(t)
    || /\b(?:start|begin|open|lead|first)\w*\b[^.!?]{0,60}\b(?:example|scenario|analog\w*|story|real[- ]world|concrete case)/.test(t)
    || /\b(?:example|scenario)s?\b[^.!?]{0,20}\bfirst\b/.test(t)) {
    openingStyle = 'example_first';
  }
  // question first / Socratic
  if (/\bsocratic\b/.test(t)
    || /\b(?:start|begin|open|lead)\w*\b[^.!?]{0,40}\bquestions?\b/.test(t)
    || /\bquestion[- ]first\b/.test(t)) {
    openingStyle = 'question_first';
  }
  // definition first (checked last so an explicit "definition-first" wins over
  // a stray example mention elsewhere in the text)
  if (/\bdefinition[- ]first\b/.test(t)
    || /\b(?:start|begin|open|lead)\w*\b[^.!?]{0,40}\bdefinitions?\b/.test(t)) {
    openingStyle = 'definition_first';
  }

  let examples = null;
  if (/\bno examples?\b|without examples?\b|skip (?:the )?examples?\b|avoid examples?\b/.test(t)) examples = 'banned';
  else if (/\b(?:use|include|with|give|show|work(?:ed)?)\b[^.!?]{0,30}\bexamples?\b|\bworked examples?\b/.test(t) || openingStyle === 'example_first') examples = 'required';

  let code = null;
  if (/\bno code\b|without code\b|avoid code\b/.test(t)) code = 'banned';
  else if (/\bcode (?:snippets?|examples?|samples?)\b|\bshow code\b|\binclude code\b/.test(t)) code = 'preferred';

  const concise = /\bconcise\b|\bbrief\b|\bshort\b|\bto the point\b|\btight\b/.test(t);

  return { openingStyle, examples, code, concise, any: !!(openingStyle || examples || code || concise) };
}

// High-precision detector for a definitional copula opener ("A loop is a
// construct that...", "Loops are blocks that...") — used ONLY as the retry
// trigger when the instructor asked for example-first and the model led with
// a definition anyway. Deliberately narrow: "Imagine you are baking..." or
// "Picture a chef..." must not match.
const DEFINITIONAL_OPENER_RE = /^(?:in\s+[\w+#.]+\s*,?\s+)?(?:(?:a|an|the)\s+[\w-]+(?:\s+[\w-]+){0,3}|[\w-]*s)\s+(?:is|are|refers? to|means)\b/i;

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

// Defensive prefix strip: if a stored outstanding question ever carries the
// anchor phrasing (legacy sessions), don't nest it a second time.
const ANCHOR_LINE = (outstandingCheck) => {
  const q = String(outstandingCheck).trim().replace(/^now,?\s*back to the question:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
  return `Now, back to the question: **${q}**`;
};

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

/** Strip the re-anchor prefix + bold wrapping from a stored/recovered question. */
function stripAnchorPrefix(q) {
  return String(q || '').replace(/^now,?\s*back to the question:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
}

/**
 * Outstanding-question recovery (2026-08 loop hardening). When
 * meta.outstandingCheck is missing — prior extraction failed, a fallback turn
 * carried no question, a restart wiped it — the question is almost always
 * still present in a prior assistant turn's structured parts for the SAME
 * milestone. Recover it instead of letting a clarification degrade into a
 * fresh first_teach re-dump: that degradation is exactly the 36-message loop
 * the boundary sim produced on "Lists & Dynamic Arrays".
 */
function recoverOutstanding(session) {
  const idx = session?.meta?.currentMilestoneIndex ?? 0;
  const moduleId = session?.activeModuleId ? String(session.activeModuleId) : null;
  const msgs = session?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    const md = m.metadata || {};
    // A complete_module turn's question part is the quiz CTA, not a check.
    if (md.flowAction === 'complete_module') continue;
    // milestoneIndexAtSend is PER-MODULE, so module identity must match too —
    // module A's milestone-0 question must not resurface on module B's
    // milestone 0. Messages predating the moduleIdAtSend stamp pass through
    // (legacy sessions; the index filter is all they have).
    if ((md.milestoneIndexAtSend ?? idx) !== idx) continue;
    if (moduleId && md.moduleIdAtSend && String(md.moduleIdAtSend) !== moduleId) continue;
    const q = md.parts?.question;
    if (typeof q === 'string' && q.trim()) return stripAnchorPrefix(q);
  }
  return null;
}

// Lesson-style openers a light turn must never lead with — their presence is
// the signature of a milestone re-dump ("We're starting the Array-based list
// milestone...") rather than a direct answer.
const LESSON_OPENER_RE = /^\s*(let'?s (?:begin|start|work on|implement|tackle)|we(?:'re| are)\s+(?:starting|beginning|now)|now we(?:'ll| will)\b|this (?:milestone|session|module) (?:covers|introduces|focuses)|welcome to|we'll start)/i;

/**
 * HARD GUARD for light (clarify/correct_retry) bodies: never a milestone
 * teaching block. Strips a lesson-style opening sentence, caps paragraphs at
 * two, and truncates at the word cap keeping the FRONT (a clarify answer
 * leads with the answer, so the front is the part that matters). Unlike
 * enforceWordCap this has no 1.6x slack — light turns are short by contract.
 */
function hardCapLightBody(body, cap) {
  let text = String(body || '').trim();
  if (!text) return text;
  let paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length > 2) paras = paras.slice(0, 2);
  const firstSentences = paras[0].split(/(?<=[.!?])\s+/);
  if (firstSentences.length > 1 && LESSON_OPENER_RE.test(firstSentences[0])) {
    paras[0] = firstSentences.slice(1).join(' ');
  }
  text = paras.join('\n\n').trim();
  if (!cap) return text;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= cap) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const acc = [];
  let count = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).filter(Boolean).length;
    if (acc.length && count + w > cap) break;
    acc.push(s);
    count += w;
  }
  return acc.join(' ').trim();
}

/**
 * Near-identical repeat detection: token-set Jaccard of the current message
 * against the previous two user messages. The looping boundary student sent
 * 17 rephrasings of the same scope question — each pair well above 0.6.
 * Called BEFORE the current message is pushed to session.messages.
 */
function isRepeatedUserMessage(session, userMessage) {
  const tokens = (s) => new Set(normalize(s).split(' ').filter((w) => w.length >= 3));
  const cur = tokens(userMessage);
  if (cur.size < 3) return false;
  const priorUsers = (session?.messages || []).filter((m) => m.role === 'user').slice(-2);
  for (const m of priorUsers) {
    const prev = tokens(m.content);
    if (!prev.size) continue;
    let inter = 0;
    for (const w of cur) if (prev.has(w)) inter += 1;
    const union = new Set([...cur, ...prev]).size;
    if (union && inter / union >= 0.6) return true;
  }
  return false;
}

/**
 * Synthesize {intro:'', body, question} parts from a prose message so
 * question-bearing turns still card their question on the fallback path.
 *
 * The heuristic is deliberately CONSERVATIVE because whatever it cards
 * becomes the graded outstandingCheck: a false positive arms the grader on a
 * turn that carried no question (adversarial review caught "Which is why the
 * doubling strategy wins." being carded). So: a last paragraph is a question
 * only when it ends with '?', carries the anchor phrasing, or restates the
 * outstanding question — and the no-'?' imperative-check phrasings
 * ("In your own words, ..." — gpt-oss's habit) count ONLY on question-bearing
 * flows, never on 'continue' (whose trailing CTA "Tell me when you're
 * ready..." is not a check; pre-hardening, continue turns only armed the
 * grader via a literal '?', and that must stay true).
 */
const QUESTION_BEARING_FLOWS = ['first_teach', 'advance_milestone', 'clarify', 'correct_retry'];
function synthesizeProseParts(message, flowAction, outstanding) {
  if (!QUESTION_BEARING_FLOWS.includes(flowAction) && flowAction !== 'continue') return null;
  const paras = String(message || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length < 2) return null;
  const last = paras[paras.length - 1];
  const stripped = last.replace(/\*\*/g, '').trim();
  const outstandingCore = stripAnchorPrefix(outstanding);
  let looksQuestion = /\?$/.test(stripped)
    || /^now,?\s*back to the question:/i.test(stripped)
    || (!!outstandingCore && stripped.includes(outstandingCore));
  if (!looksQuestion && QUESTION_BEARING_FLOWS.includes(flowAction)) {
    looksQuestion = /^(in your own words|explain|describe|walk me through)\b/i.test(stripped);
  }
  if (!looksQuestion) return null;
  return { intro: '', body: paras.slice(0, -1).join('\n\n'), question: last };
}

/** Streak-cap collapse: after repeated non-advancing turns, stop re-emitting
 * teaching entirely — two sentences, then the anchored question. Fires on a
 * genuine repeat loop (streak>=4 with a near-identical message) or as an
 * absolute backstop (streak>=6) so distinct, productive questions aren't
 * punished at 4. */
function collapseToTwoSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
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
  // RQ-A: the instructor's structural directives shape teaching turns. When
  // any structural directive exists, the teaching body tightens: a hook plus
  // a focused explanation, not the default developed-lecture size (the
  // instructor's own word cap still wins when stricter).
  const directives = extractTeachingDirectives(globalInstructions);
  let bodyCap = structured ? bodyCapFor(flowAction, wordCap) : null;
  let bodyTarget = TEACH_BODY_TARGET;
  if (directives.any && !light && flowAction !== 'complete_module') {
    bodyCap = Math.min(bodyCap || DIRECTIVE_BODY_CAP, DIRECTIVE_BODY_CAP);
    bodyTarget = DIRECTIVE_BODY_TARGET;
  }

  // ANCHOR RECOVERY (2026-08 loop hardening): a light turn must always have a
  // question to anchor to. If meta.outstandingCheck is gone, recover it from a
  // prior turn's structured question part; failing that, the milestone
  // objective itself is the anchor. Never compose a clarify with no anchor.
  let outstanding = session?.meta?.outstandingCheck || '';
  if (!outstanding && light) outstanding = recoverOutstanding(session) || milestoneText || '';
  // When the anchor is the milestone OBJECTIVE (last-resort recovery), the
  // "do not state the answer" guardrail must not fire — it would forbid the
  // clarify turn from explaining the very content being clarified.
  const outstandingIsObjective = !!outstanding && normalize(outstanding) === normalize(milestoneText);

  // Repetition escalation: streak is maintained by the route on session.meta;
  // near-identical detection compares against the prior two user messages.
  const clarifyStreak = session?.meta?.clarifyStreak || 0;
  const repeatedClarification = light && isRepeatedUserMessage(session, userMessage);

  const prompt = buildTurnPrompt({
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
    structured,
    light,
    bodyWordTarget: structured && !light ? Math.min(bodyTarget, bodyCap) : undefined,
    bodyWordCap: bodyCap || undefined,
    clarifyStreak,
    repeatedClarification,
    outstandingIsObjective,
    directives,
  });
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
          clarifyStreak,
          repeatedClarification,
          outstandingIsObjective,
          directives,
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
      // HARD GUARD: a light turn can never carry a milestone teaching block —
      // strip lesson openers, cap paragraphs, front-truncate at the word cap.
      // At the streak cap the body collapses to two sentences: after four
      // non-advancing turns the tutor stops re-emitting teaching entirely.
      if (light) {
        body = hardCapLightBody(body, bodyCap);
        if ((clarifyStreak >= 4 && repeatedClarification) || clarifyStreak >= 6) {
          body = collapseToTwoSentences(body);
        }
      }
      // EXAMPLE-FIRST RETRY (RQ-A): the instructor asked to open with a hook,
      // but the body leads with a definitional copula anyway ("A loop is a
      // construct that..."). One corrective regeneration with explicit
      // feedback; if the retry still leads with a definition, keep it and log
      // — never loop.
      if (!light && directives.openingStyle === 'example_first'
        && ['first_teach', 'continue', 'advance_milestone'].includes(flowAction)
        && DEFINITIONAL_OPENER_RE.test(String(body).trim())) {
        console.warn('[turnComposer] example-first directive violated (definitional opener) — one corrective retry', { flowAction, opener: String(body).trim().slice(0, 80) });
        try {
          const retryRaw = await callTeacherAPI(
            `${prompt}\n\n⚠️ YOUR PREVIOUS ATTEMPT OPENED THE BODY WITH AN ABSTRACT DEFINITION ("${String(body).trim().slice(0, 90)}..."). The instructor requires the body to OPEN with a concrete, specific example or scenario. Regenerate the SAME JSON with the body's first sentence being the example — the definition comes after it.`,
            1400, session, null, globalInstructions || '', { jsonMode: true },
          );
          const retryParsed = parseParts(retryRaw);
          if (retryParsed) {
            const retryBody = enforceWordCap(dedup(retryParsed.body, [...priorParas, normalize(intro)]), bodyCap);
            if (retryBody && !DEFINITIONAL_OPENER_RE.test(String(retryBody).trim())) {
              body = retryBody;
              if (typeof retryParsed.question === 'string' && retryParsed.question.trim()) parsed.question = retryParsed.question;
            }
          }
        } catch (retryErr) {
          console.warn('[turnComposer] example-first retry failed — keeping original body', { error: retryErr.message });
        }
      }
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
  // Light flows get the strict light cap even on the prose fallback (the
  // instructor cap alone left a fallback clarify entirely uncapped); other
  // flows keep the instructor cap.
  message = light ? hardCapLightBody(message, bodyCap) : enforceWordCap(message, wordCap);
  if (light && ((clarifyStreak >= 4 && repeatedClarification) || clarifyStreak >= 6)) {
    message = collapseToTwoSentences(message);
  }
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
  // Even prose turns card their question when one is recognizable — the
  // renderer and the outstanding-check storage both key on parts.question.
  const finalMessage = message || String(raw || '').trim();
  return { message: finalMessage, parts: synthesizeProseParts(finalMessage, flowAction, outstanding), flowAction };
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
  recoverOutstanding,
  isRepeatedUserMessage,
  stripAnchorPrefix,
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
  _hardCapLightBody: hardCapLightBody,
  _synthesizeProseParts: synthesizeProseParts,
  _collapseToTwoSentences: collapseToTwoSentences,
  _ANCHOR_LINE: ANCHOR_LINE,
  extractTeachingDirectives,
  _DEFINITIONAL_OPENER_RE: DEFINITIONAL_OPENER_RE,
};
