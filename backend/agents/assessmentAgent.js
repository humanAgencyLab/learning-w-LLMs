const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateAssessment } = require('./validators/assessmentValidator');

const SYSTEM_PROMPT = `You are an expert educational assessment AI. Evaluate whether a student's answer demonstrates understanding of a milestone.

Return ONLY valid JSON with these fields:
- responseType: "clarification_request" | "wrong_answer" | "correct_answer" | "incomplete_answer"
- understood: boolean (true if student demonstrated understanding)
- confidence: "high" | "medium" | "low"
- recommendation: "move_forward" | "clarify_again" | "move_forward_anyway"
- reasoning: brief explanation of your assessment (1-2 sentences)

Classification rules:
- "I don't know", "help", "explain", "confused" → clarification_request (understood=false)
- Incorrect but attempted answer → wrong_answer (understood=false)
- Correct answer → correct_answer (understood=true, recommendation=move_forward)
- Correct but brief/incomplete → incomplete_answer (understood=true, recommendation=move_forward)

CRITICAL: clarification_request must NEVER increment retry count.
CRITICAL: correct_answer and incomplete_answer must ALWAYS set understood=true.`;

function buildUserPrompt(question, answer, milestone, retryCount, prevErrors) {
  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';

  return `QUESTION ASKED: "${question}"

STUDENT'S ANSWER: "${answer}"

MILESTONE BEING ASSESSED: "${milestone?.text || 'general understanding'}"

RETRY COUNT: ${retryCount} (if ≥1, the student already answered incorrectly once)

Evaluate the student's answer.${errHint}`;
}

async function runAssessmentAgent({ question, answer, milestone, retryCount = 0 }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      runAgent({
        taskName: 'assessment',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(question, answer, milestone, retryCount, prevErrors),
        maxTokens: 400,
        temperature: 0.3,
      }),
    validateAssessment,
    { agentName: 'AssessmentAgent' },
  );

  if (!valid) {
    return {
      type: 'assessment',
      payload: {
        responseType: 'wrong_answer',
        understood: false,
        confidence: 'low',
        recommendation: retryCount >= 1 ? 'move_forward_anyway' : 'clarify_again',
        reasoning: 'Assessment validation failed; defaulting to safe fallback.',
      },
      valid: false,
      errors,
    };
  }

  return { type: 'assessment', payload: output, valid: true, errors: [] };
}

module.exports = { runAssessmentAgent };
