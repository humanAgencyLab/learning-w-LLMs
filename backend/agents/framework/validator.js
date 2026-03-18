/**
 * Generic validation runner with bounded retries.
 *
 * @param {function} generate   – async () => agentOutput
 * @param {function} validate   – (output) => { valid: boolean, errors: string[] }
 * @param {object}   [opts]
 * @param {number}   [opts.maxRetries=2]
 * @param {string}   [opts.agentName='agent']  – for logging
 * @returns {Promise<{output: object, valid: boolean, errors: string[]}>}
 */
async function runWithValidation(generate, validate, opts = {}) {
  const { maxRetries = 2, agentName = 'agent' } = opts;
  let lastErrors = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const output = await generate(lastErrors);
      const result = validate(output);
      if (result.valid) {
        return { output, valid: true, errors: [] };
      }
      lastErrors = result.errors;
      console.warn(`[${agentName}] Validation failed (attempt ${attempt + 1}/${maxRetries + 1})`, lastErrors);
    } catch (err) {
      lastErrors = [err.message];
      console.error(`[${agentName}] Generation error (attempt ${attempt + 1}/${maxRetries + 1})`, err.message);
    }
  }

  return { output: null, valid: false, errors: lastErrors };
}

module.exports = { runWithValidation };
