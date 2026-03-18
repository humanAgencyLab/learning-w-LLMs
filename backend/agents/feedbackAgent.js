const { runAgent } = require('./framework/baseAgent');

const SYSTEM_PROMPT = `You are a supportive learning feedback assistant. Given quiz results, provide brief, encouraging feedback and decide the next action.

Return ONLY valid JSON with these fields:
- message: a short, encouraging feedback message (2-4 sentences)
- nextAction: "proceed_to_next_module" | "retry_milestones" | "session_complete"

Rules:
- If the quiz was passed (≥60%) → congratulate and suggest proceeding
- If the quiz was failed → encourage and suggest reviewing specific milestones
- Keep the tone positive and supportive
- Be specific about what went well and what needs work`;

function buildUserPrompt(quizResult, userMessage) {
  return `QUIZ RESULT:
- Score: ${quizResult.scorePct}%
- Passed: ${quizResult.passed}
- Correct: ${quizResult.numCorrect}/${quizResult.total}

USER MESSAGE: "${userMessage || ''}"

Provide feedback and decide next action.`;
}

async function runFeedbackAgent({ quizResult, userMessage }) {
  try {
    const output = await runAgent({
      taskName: 'feedback',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(quizResult, userMessage),
      maxTokens: 300,
      temperature: 0.5,
    });
    return { type: 'feedback', payload: output };
  } catch (err) {
    console.error('[FeedbackAgent] Failed, returning safe default', err.message);
    const passed = quizResult.passed;
    return {
      type: 'feedback',
      payload: {
        message: passed
          ? `Great job scoring ${quizResult.scorePct}%! You're ready to move on.`
          : `You scored ${quizResult.scorePct}%. Let's review the areas that need work.`,
        nextAction: passed ? 'proceed_to_next_module' : 'retry_milestones',
      },
    };
  }
}

module.exports = { runFeedbackAgent };
