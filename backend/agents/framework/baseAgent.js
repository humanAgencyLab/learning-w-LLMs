const { getGroqClient } = require('../../lib/llmClient');
const { getModelForTask } = require('./modelRouter');

/**
 * Base agent runner. Every agent is a thin wrapper: a system prompt, a user
 * prompt builder, an optional response parser, and a task name for model routing.
 *
 * @param {object} opts
 * @param {string} opts.taskName        – key in modelRouter (e.g. 'intent')
 * @param {string} opts.systemPrompt    – system message content
 * @param {string} opts.userPrompt      – user message content
 * @param {number} [opts.maxTokens=600] – max tokens for completion
 * @param {number} [opts.temperature=0.3]
 * @param {boolean} [opts.jsonMode=true] – request JSON response format
 * @param {function} [opts.parse]       – (rawText) => parsed object; defaults to JSON.parse
 * @returns {Promise<object>} parsed output
 */
async function runAgent({
  taskName,
  systemPrompt,
  userPrompt,
  maxTokens = 600,
  temperature = 0.3,
  jsonMode = true,
  parse,
}) {
  const client = getGroqClient();
  const model = getModelForTask(taskName);

  const requestOpts = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    requestOpts.response_format = { type: 'json_object' };
  }

  const response = await client.chat.completions.create(requestOpts);
  const raw = response.choices[0].message.content.trim();

  if (parse) return parse(raw);

  let jsonText = raw;
  const fenced = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (fenced) jsonText = fenced[1];
  else {
    const braced = jsonText.match(/\{[\s\S]*\}/);
    if (braced) jsonText = braced[0];
  }
  return JSON.parse(jsonText);
}

module.exports = { runAgent };
