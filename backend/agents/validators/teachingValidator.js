const MIN_WORDS = 80;
const MAX_WORDS = 500;

function validateTeaching(output) {
  const errors = [];

  if (!output || typeof output !== 'object' || !output.content) {
    return { valid: false, errors: ['Output must have a content field'] };
  }

  const content = output.content;
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const questionCount = (content.match(/\?/g) || []).length;
  const hasStepLabels = /STEP\s*[123]|Context:|Teaching Content:/i.test(content);

  if (wordCount < MIN_WORDS) {
    errors.push(`Content too short: ${wordCount} words (minimum ${MIN_WORDS})`);
  }
  if (wordCount > MAX_WORDS) {
    errors.push(`Content too long: ${wordCount} words (maximum ${MAX_WORDS})`);
  }
  if (questionCount === 0) {
    errors.push('Must include exactly one question (ending with ?)');
  }
  if (questionCount > 2) {
    errors.push(`Too many questions: ${questionCount} (should be exactly 1)`);
  }
  if (hasStepLabels) {
    errors.push('Must not contain step labels (STEP 1, Context:, Teaching Content:)');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateTeaching, MIN_WORDS, MAX_WORDS };
