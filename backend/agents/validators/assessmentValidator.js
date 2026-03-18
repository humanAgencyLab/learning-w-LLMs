const VALID_RESPONSE_TYPES = ['clarification_request', 'wrong_answer', 'correct_answer', 'incomplete_answer'];
const VALID_RECOMMENDATIONS = ['move_forward', 'clarify_again', 'move_forward_anyway'];

function validateAssessment(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output is not a valid object'] };
  }

  if (!VALID_RESPONSE_TYPES.includes(output.responseType)) {
    errors.push(`responseType must be one of ${VALID_RESPONSE_TYPES.join(', ')}, got "${output.responseType}"`);
  }

  if (typeof output.understood !== 'boolean') {
    errors.push('understood must be a boolean');
  }

  if (!VALID_RECOMMENDATIONS.includes(output.recommendation)) {
    errors.push(`recommendation must be one of ${VALID_RECOMMENDATIONS.join(', ')}, got "${output.recommendation}"`);
  }

  // Consistency checks
  if ((output.responseType === 'correct_answer' || output.responseType === 'incomplete_answer') && output.understood !== true) {
    errors.push('understood must be true when responseType is correct_answer or incomplete_answer');
  }

  if (output.responseType === 'correct_answer' && output.recommendation !== 'move_forward') {
    errors.push('recommendation must be move_forward when responseType is correct_answer');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateAssessment };
