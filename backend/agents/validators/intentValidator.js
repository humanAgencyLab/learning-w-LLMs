const VALID_INTENTS = ['learning', 'greeting', 'general', 'unclear'];
const VALID_ACTIONS = ['trigger_assessment', 'respond_naturally'];

function validateIntent(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output is not a valid object'] };
  }

  if (!VALID_INTENTS.includes(output.intent)) {
    errors.push(`intent must be one of ${VALID_INTENTS.join(', ')}, got "${output.intent}"`);
  }

  if (!VALID_ACTIONS.includes(output.action)) {
    errors.push(`action must be one of ${VALID_ACTIONS.join(', ')}, got "${output.action}"`);
  }

  if (output.intent === 'learning' && (!output.topic || output.topic.trim() === '')) {
    errors.push('topic must be non-empty when intent is "learning"');
  }

  if (['greeting', 'general', 'unclear'].includes(output.intent) && !output.response) {
    errors.push('response is required for non-learning intents');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateIntent };
