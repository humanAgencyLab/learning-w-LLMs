function validateQuiz(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output is not a valid object'] };
  }

  const questions = output.questions;
  if (!Array.isArray(questions)) {
    return { valid: false, errors: ['questions must be an array'] };
  }

  if (questions.length !== 5) {
    errors.push(`Expected exactly 5 questions, got ${questions.length}`);
  }

  const forbiddenPatterns = ['all of the above', 'none of the above', 'both a and b', 'both a and c', 'both b and c'];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.id) errors.push(`question ${i}: missing id`);
    if (!q.text || q.text.trim() === '') errors.push(`question ${i}: missing text`);

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`question ${i}: must have exactly 4 options, got ${q.options?.length || 0}`);
    } else {
      for (const opt of q.options) {
        if (forbiddenPatterns.some(p => opt.toLowerCase().includes(p))) {
          errors.push(`question ${i}: contains forbidden option "${opt}"`);
        }
      }
    }

    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
      errors.push(`question ${i}: correctIndex must be 0-3, got ${q.correctIndex}`);
    }

    if (!q.explanation || q.explanation.trim() === '') {
      errors.push(`question ${i}: missing explanation`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateQuiz };
