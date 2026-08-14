const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateQuiz } = require('./validators/quizValidator');
const { checkQuizKeys } = require('./validators/quizKeyCheck');

/**
 * Instructor course guidelines slot (2026-08 instruction-fidelity fix; the
 * generator previously never saw them). Structural rules — 4 options, exactly
 * one correct, JSON shape — still bind; the guidelines shape style, cognitive
 * level, and content emphasis.
 */
function buildInstructionsBlock(globalInstructions) {
  const text = String(globalInstructions || '').trim();
  if (!text) return '';
  return `\n\nInstructor course guidelines (authoritative for question style, cognitive level, and content emphasis — the structural JSON rules above still apply):\n${text}`;
}

function buildQuizPatternBlock(quizPattern) {
  if (!quizPattern || typeof quizPattern !== 'object') return '';
  const parts = [];
  if (quizPattern.cognitiveLevel) parts.push(`Cognitive target: ${quizPattern.cognitiveLevel}.`);
  if (quizPattern.difficultyMix) {
    parts.push(`Difficulty mix: easy ${quizPattern.difficultyMix.easy ?? 30}% / medium ${quizPattern.difficultyMix.medium ?? 50}% / hard ${quizPattern.difficultyMix.hard ?? 20}%.`);
  }
  if (Array.isArray(quizPattern.questionTypes) && quizPattern.questionTypes.length) {
    parts.push(`Question type weights: ${quizPattern.questionTypes.map((t) => `${t.type}:${t.weight}%`).join(', ')}.`);
  }
  if (quizPattern.constraints && String(quizPattern.constraints).trim()) {
    parts.push(`Instructor constraints: ${String(quizPattern.constraints).trim()}`);
  }
  if (!parts.length) return '';
  return `\n\nInstructor pattern:\n${parts.join('\n')}`;
}

function buildSystemPrompt(questionCount) {
  return `You are an expert quiz generator. Generate multiple-choice questions for a learning module.

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
- Generate exactly ${questionCount} questions
- Each question must have exactly 4 options
- correctIndex must be 0-3
- NEVER use "All of the above", "All of these", "None of the above", "None of these", or any compound/aggregate options
- EXACTLY ONE option may be correct: the keyed option must be right and the other three must be clearly, defensibly wrong for the question as written. If several candidate options would all be true (e.g. "Which of these is a type of X?" where many are), narrow the question or the options until only one survives.
- Each option must be a standalone, specific answer
- Questions must test understanding of the milestones provided
- Include an explanation for every question
- Vary difficulty appropriately${questionCount > 5 ? '\n- With more than 5 questions, still cover all milestones thoroughly.' : ''}`;
}

function buildUserPrompt(moduleTitle, milestones, difficulty, questionCount, prevErrors, quizPattern, globalInstructions) {
  const milestonesText = milestones
    .map((m, i) => `${i + 1}. ${m.text || m}`)
    .join('\n');

  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';

  return `MODULE: "${moduleTitle}" (difficulty: ${difficulty})

MILESTONES TO TEST:
${milestonesText}

Generate exactly ${questionCount} multiple-choice questions covering these milestones.${buildQuizPatternBlock(quizPattern)}${buildInstructionsBlock(globalInstructions)}${errHint}`;
}

async function runQuizAgent({ module, globalInstructions = '' }) {
  const milestones = module.milestones || [];
  const difficulty = module.difficulty || 'core';
  const quizPattern = module.quizPattern && typeof module.quizPattern === 'object' ? module.quizPattern : {};
  const questionCount = Math.min(10, Math.max(3, quizPattern.questionCount || 5));

  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      runAgent({
        taskName: 'quiz',
        systemPrompt: buildSystemPrompt(questionCount),
        userPrompt: buildUserPrompt(module.title, milestones, difficulty, questionCount, prevErrors, quizPattern, globalInstructions),
        maxTokens: 2000,
        temperature: 0.7,
      }),
    // Structure first (cheap, deterministic), then the exactly-one-correct key
    // audit (LLM). A key-audit failure re-enters the generation loop with the
    // per-question errors as feedback. The audit FAILS OPEN if the checker
    // itself errors — see quizKeyCheck.js.
    async (out) => {
      const structural = validateQuiz(out, questionCount);
      if (!structural.valid) return structural;
      const keys = await checkQuizKeys(out.questions);
      if (!keys.checked) {
        console.warn('[QuizAgent] key audit skipped (checker unavailable) — delivering structurally-valid quiz');
      }
      return { valid: keys.valid, errors: keys.errors };
    },
    { agentName: 'QuizAgent' },
  );

  if (!valid) {
    return { type: 'quiz', payload: null, valid: false, errors };
  }
  return { type: 'quiz', payload: output, valid: true, errors: [] };
}

module.exports = { runQuizAgent };
