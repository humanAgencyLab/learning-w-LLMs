const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateQuiz } = require('./validators/quizValidator');

const SYSTEM_PROMPT = `You are an expert quiz generator. Generate multiple-choice questions for a learning module.

Return ONLY valid JSON in this format:
{
  "questions": [
    {
      "id": "q1",
      "text": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief explanation (2-3 sentences) why the correct answer is correct."
    }
  ]
}

Rules:
- Generate exactly 5 questions
- Each question must have exactly 4 options
- correctIndex must be 0-3
- NEVER use "All of the above", "None of the above", or compound options
- Each option must be a standalone, specific answer
- Questions must test understanding of the milestones provided
- Include an explanation for every question
- Vary difficulty appropriately`;

function buildUserPrompt(moduleTitle, milestones, difficulty, prevErrors) {
  const milestonesText = milestones
    .map((m, i) => `${i + 1}. ${m.text || m}`)
    .join('\n');

  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';

  return `MODULE: "${moduleTitle}" (difficulty: ${difficulty})

MILESTONES TO TEST:
${milestonesText}

Generate exactly 5 multiple-choice questions covering these milestones.${errHint}`;
}

async function runQuizAgent({ module }) {
  const milestones = module.milestones || [];
  const difficulty = module.difficulty || 'core';

  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      runAgent({
        taskName: 'quiz',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(module.title, milestones, difficulty, prevErrors),
        maxTokens: 1500,
        temperature: 0.7,
      }),
    validateQuiz,
    { agentName: 'QuizAgent' },
  );

  if (!valid) {
    return { type: 'quiz', payload: null, valid: false, errors };
  }
  return { type: 'quiz', payload: output, valid: true, errors: [] };
}

module.exports = { runQuizAgent };
