/**
 * Multi-agent teaching turn — at parity with the legacy tutor.
 *
 * The graph's teaching node used to teach from a ~20-line generic prompt with
 * five scenarios and no conversation history. This runner now builds the SAME
 * prompt the legacy path uses (prompts/teacher_prompt.js — seven scenarios,
 * authoritative milestone selection, per-milestone points, unified response
 * structure, module transitions, student profile, instructor guidelines block
 * + safety floor) and sends it through the SAME transport
 * (services/teacherService — system persona, contextSummary + recent-message
 * history with token truncation, step-label cleanup, Groq retry/backoff).
 *
 * What stays multi-agent: routing (conversation manager), the separate
 * assessment agent, and the validation wrapper with bounded retries around
 * this call. teacher_prompt.js is the reference implementation and is not
 * modified.
 */
const { runWithValidation } = require('./framework/validator');
const { validateTeaching } = require('./validators/teachingValidator');
const { buildTeacherPrompt } = require('../prompts/teacher_prompt');
const { callTeacherAPI, callTeacherAPIStream } = require('../services/teacherService');

/**
 * Map the assessment agent's payload
 *   { responseType, understood, recommendation, ... }
 * onto the legacy analyzer's assessmentResult shape that buildTeacherPrompt
 * branches on. The mapping must be TOTAL over wrong answers: teacher_prompt's
 * fallback operands reference an undefined `milestoneRetryCount` (latent
 * ReferenceError the legacy analyzer never triggers because it always sets the
 * explicit flags) — so exactly one of isFirstIncorrect/isSecondIncorrect must
 * be true for every wrong_answer.
 *
 * Scenario coverage (legacy scenarioType ← this mapping):
 * - first_teaching        ← assessment null (isFollowUp=false)
 * - correct_move_next     ← understood, !needsMore, milestoneInfo both flags
 * - correct_needs_more    ← understood + recommendation 'clarify_again'
 * - clarification_request ← !understood + responseType 'clarification_request'
 * - incorrect_first       ← every wrong_answer (see below)
 * - follow_up             ← understood without a milestone advance
 *
 * incorrect_second is deliberately NOT selectable: whenever teacher_prompt
 * would choose it (isFirstIncorrect falsy on a wrong answer), line 105
 * evaluates the undefined milestoneRetryCount and throws — the legacy
 * analyzer feeds exactly that shape (isSecondIncorrect only), so the
 * incorrect_second template has never once rendered in production; second
 * wrongs have always surfaced as the re-teach loop (pilot F16) or an error.
 * We therefore set isFirstIncorrect for ALL wrong answers, which
 * short-circuits the broken operand and renders the re-teach template —
 * the only second-wrong behavior legacy has ever actually delivered — while
 * the route still advances the milestone. Fixing teacher_prompt.js is a
 * post-study change (it is the pilot's reference implementation).
 */
function mapAssessmentForTeacher(assessment) {
  if (!assessment) return null;
  const wrong = assessment.responseType === 'wrong_answer';
  return {
    understood: !!assessment.understood,
    isClarificationRequest: assessment.responseType === 'clarification_request',
    isFirstIncorrect: wrong,
    isSecondIncorrect: wrong && assessment.recommendation === 'move_forward_anyway',
    needsMoreClarification: !!assessment.understood && assessment.recommendation === 'clarify_again',
    responseType: assessment.responseType,
    recommendation: assessment.recommendation,
  };
}

async function runTeachingAgent({
  session,
  userMessage,
  isFollowUp,
  assessmentResult,
  milestoneInfo,
  globalInstructions,
  streamCallback,
}) {
  const prompt = buildTeacherPrompt(
    session,
    userMessage,
    !!isFollowUp,
    assessmentResult || null,
    milestoneInfo || null,
    globalInstructions || ''
  );

  // Streaming: single attempt, mirroring the legacy path (callTeacherAPIStream
  // deliberately has no retry — re-streaming after a validation failure would
  // duplicate content on the client). The route's done-frame carries the final
  // message, and on validation failure the route's legacy fallback regenerates.
  if (typeof streamCallback === 'function') {
    try {
      const content = await callTeacherAPIStream(prompt, 1500, session, { onChunk: streamCallback });
      const check = validateTeaching({ content });
      return {
        type: 'teaching',
        payload: check.valid ? { content } : null,
        uiMessage: check.valid ? content : null,
        valid: check.valid,
        errors: check.valid ? [] : check.errors,
      };
    } catch (err) {
      return { type: 'teaching', payload: null, uiMessage: null, valid: false, errors: [err.message] };
    }
  }

  // Non-streaming: keep the graph's bounded validation retries around the
  // legacy transport (history injection + cleanup + Groq retry live inside
  // callTeacherAPI).
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) => {
      const errHint = prevErrors.length
        ? `\n\nIMPORTANT: Your previous response was rejected for structural reasons: ${prevErrors.join('; ')}. Regenerate the full response and fix them.`
        : '';
      const content = await callTeacherAPI(prompt + errHint, 1500, session);
      return { content };
    },
    validateTeaching,
    { agentName: 'TeachingAgent' },
  );

  if (!valid) {
    return { type: 'teaching', payload: null, uiMessage: null, valid: false, errors };
  }
  return { type: 'teaching', payload: output, uiMessage: output.content, valid: true, errors: [] };
}

module.exports = { runTeachingAgent, mapAssessmentForTeacher };
