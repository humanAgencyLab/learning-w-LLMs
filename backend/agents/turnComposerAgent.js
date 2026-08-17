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
 * Compose one tutor message for a teaching-ish flow
 * (first_teach | continue | clarify | correct_retry | advance_milestone |
 *  complete_module). refuse/start_quiz are composed deterministically by the
 * route and never reach here.
 *
 * @returns {Promise<{ message: string, flowAction: string }>}
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
  // On an advance, the "current" index already points at the NEW milestone;
  // teach it as the current one and cite the just-finished one only in transition.
  const nextMilestoneText = flowAction === 'advance_milestone'
    ? (activeModule?.milestones?.[idx]?.text || '')
    : (activeModule?.milestones?.[idx + 1]?.text || '');

  const wordCap = extractWordCap(globalInstructions);
  const adaptation = computeAdaptation({ session, assessment, retryCount, userMessage });

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
  });

  let raw;
  try {
    if (typeof streamCallback === 'function') {
      raw = await callTeacherAPIStream(prompt, 1200, session, { onChunk: streamCallback, globalInstructions: globalInstructions || '' });
    } else {
      raw = await callTeacherAPI(prompt, 1200, session, null, globalInstructions || '');
    }
  } catch (err) {
    // Fail-soft: a short honest line beats a 500. Grading already happened.
    return { message: '', flowAction, error: err.message };
  }

  const priorParas = priorMilestoneParagraphs(session);
  let message = dedup(raw, priorParas);
  message = enforceWordCap(message, wordCap);
  return { message: message || String(raw || '').trim(), flowAction };
}

module.exports = {
  FLOW_ACTIONS,
  deriveFlowAction,
  extractWordCap,
  extractTrailingQuestion,
  computeAdaptation,
  composeTutorTurn,
  // exported for unit tests
  _dedup: dedup,
  _enforceWordCap: enforceWordCap,
};
