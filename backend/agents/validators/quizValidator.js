function validateQuiz(output, expectedCount = 5) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output is not a valid object'] };
  }

  const questions = output.questions;
  if (!Array.isArray(questions)) {
    return { valid: false, errors: ['questions must be an array'] };
  }

  const exp = Math.min(10, Math.max(3, Number(expectedCount) || 5));
  if (questions.length !== exp) {
    errors.push(`Expected exactly ${exp} questions, got ${questions.length}`);
  }

  // Compound/aggregate options defeat single-select grading: if "All of these"
  // is the key, every individually-true option grades as wrong (and vice
  // versa). "All of these" itself shipped in a live quiz — the original list
  // only matched "...of the above".
  //
  // Anchored REGEXES, not substrings: a first draft used bare substrings like
  // 'a and b', which rejected ordinary option text ("Schema and constraints"
  // contains 'a and c' across the word boundary, "Data and bandwidth" contains
  // 'a and b'). Letter-pair patterns must reference standalone option LETTERS
  // or span the whole option.
  const forbiddenRes = [
    /\b(?:all|none|each|any)\s+of\s+(?:the\s+above|these)\b/i,
    /\ball\s+the\s+above\b/i,
    /\bboth\s+[a-d]\s+and\s+[a-d]\b/i,
    /^\s*(?:options?\s+)?[a-d]\s*(?:and|&|\+|,)\s*[a-d]\s*$/i, // the whole option is "A and B" / "Options A, C"
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.id) errors.push(`question ${i}: missing id`);
    if (!q.text || q.text.trim() === '') errors.push(`question ${i}: missing text`);

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`question ${i}: must have exactly 4 options, got ${q.options?.length || 0}`);
    } else {
      for (const opt of q.options) {
        if (forbiddenRes.some(re => re.test(String(opt)))) {
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
