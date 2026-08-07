const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateAssessment, repairAssessment } = require('./validators/assessmentValidator');

const SYSTEM_PROMPT = `You are an expert educational assessment AI. Evaluate whether a student's answer demonstrates understanding of a milestone.

Return ONLY valid JSON with these fields:
- responseType: "clarification_request" | "wrong_answer" | "correct_answer" | "incomplete_answer"
- understood: boolean (true if student demonstrated understanding)
- confidence: "high" | "medium" | "low"
- recommendation: "move_forward" | "clarify_again" | "move_forward_anyway"
- reasoning: brief explanation of your assessment (1-2 sentences)

RULE 0 - SUBSTANCE BEFORE KEYWORDS (apply before everything else):
Decide FIRST whether the response contains a substantive attempt at the question
— a claim, definition, example, code snippet, comparison, or piece of reasoning.
If it does, classify on that substance (correct_answer / incomplete_answer /
wrong_answer) EVEN IF the student also asks a follow-up question or hedges.
Only use clarification_request when there is NO substantive attempt at all.
A question mark, or words like "what is" / "how do I" / "explain", never by
themselves make a response a clarification request.

Classification rules:
- Pure request for help with no attempt ("I don't know", "can you explain", "I'm confused") → clarification_request (understood=false)
- Incorrect but attempted answer → wrong_answer (understood=false)
- Correct answer → correct_answer (understood=true, recommendation=move_forward)
- Correct but brief/incomplete → incomplete_answer (understood=true, recommendation=move_forward)
- Correct answer PLUS a follow-up question → correct_answer or incomplete_answer (understood=true), NEVER clarification_request
- Correct demonstration of the concept using a different but valid example than
  the question named → incomplete_answer (understood=true), not wrong_answer.
  Judge the concept, not whether the exact values from the question were reused.
- Judge correctness in the language and subject of the course topic given below.

CRITICAL: clarification_request must NEVER increment retry count.
CRITICAL: correct_answer and incomplete_answer must ALWAYS set understood=true.`;

function buildUserPrompt(question, answer, milestone, retryCount, prevErrors, topicTitle) {
  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';
  const topicLine = topicTitle
    ? `COURSE TOPIC (the subject and language to judge this answer in): "${topicTitle}"\n\n`
    : '';

  return `${topicLine}QUESTION ASKED: "${question}"

STUDENT'S ANSWER: "${answer}"

MILESTONE BEING ASSESSED: "${milestone?.text || 'general understanding'}"

RETRY COUNT: ${retryCount} (if ≥1, the student already answered incorrectly once)

Evaluate the student's answer.${errHint}`;
}

async function runAssessmentAgent({ question, answer, milestone, retryCount = 0, topicTitle = '' }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      repairAssessment(await runAgent({
        taskName: 'assessment',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(question, answer, milestone, retryCount, prevErrors, topicTitle),
        maxTokens: 400,
        temperature: 0.3,
      })),
    validateAssessment,
    { agentName: 'AssessmentAgent' },
  );

  if (!valid) {
    // Fail OPEN, not closed. The old fallback was `wrong_answer`, which made
    // every timeout, parse slip, or schema miss cost the student a retry and
    // record a failed MilestoneAttempt — polluting the LOW PASS RATE analytic
    // with grader infrastructure failures. clarification_request is the
    // neutral outcome: it re-teaches without penalising anyone, and never
    // increments the retry count.
    return {
      type: 'assessment',
      payload: {
        responseType: 'clarification_request',
        understood: false,
        confidence: 'low',
        recommendation: 'clarify_again',
        reasoning: 'Assessment unavailable; re-teaching without penalising the student.',
      },
      valid: false,
      errors,
    };
  }

  return { type: 'assessment', payload: output, valid: true, errors: [] };
}

module.exports = { runAssessmentAgent };
