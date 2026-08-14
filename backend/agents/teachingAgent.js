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
 * branches on.
 *
 * Scenario coverage (legacy scenarioType ← this mapping):
 * - first_teaching        ← assessment null (isFollowUp=false)
 * - correct_move_next     ← understood, !needsMore, milestoneInfo both flags
 * - correct_needs_more    ← understood + recommendation 'clarify_again'
 * - clarification_request ← !understood + responseType 'clarification_request'
 * - incorrect_first       ← wrong_answer, first attempt
 * - incorrect_second      ← wrong_answer with a prior failed attempt
 * - follow_up             ← understood without a milestone advance
 *
 * `retryCount` is the ROUTE's count for the milestone being assessed, taken
 * before this turn's increment — it, not the model's `recommendation`, is the
 * authoritative first-vs-second signal (the grader is an LLM and may say
 * "clarify_again" on a second wrong). This mirrors the legacy analyzer, which
 * branches on the same stored count.
 */
function mapAssessmentForTeacher(assessment, retryCount = 0) {
  if (!assessment) return null;
  const wrong = assessment.responseType === 'wrong_answer';
  const secondWrong = wrong
    && (Number(retryCount) >= 1 || assessment.recommendation === 'move_forward_anyway');
  return {
    understood: !!assessment.understood,
    isClarificationRequest: assessment.responseType === 'clarification_request',
    isFirstIncorrect: wrong && !secondWrong,
    isSecondIncorrect: secondWrong,
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
      const content = await callTeacherAPIStream(prompt, 1500, session, { onChunk: streamCallback, globalInstructions: globalInstructions || '' });
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
      const content = await callTeacherAPI(prompt + errHint, 1500, session, null, globalInstructions || '');
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
