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

/**
 * Tool-using agent loop. Groq SDK supports OpenAI-style `tools` + `tool_choice`;
 * we pass the tool schemas, inspect each completion for `tool_calls`, execute
 * the handler, feed the tool result back as a tool-role message, and continue
 * until the model returns a plain assistant reply or we hit `maxIterations`.
 *
 * Intended for read-only information-retrieval agents (e.g. the instructor
 * Insights chatbot). Each tool is { name, description, parameters (JSONSchema),
 * handler: (args) => Promise<any> }.
 *
 * @param {object} opts
 * @param {string} opts.taskName                   – key in modelRouter
 * @param {string} opts.systemPrompt               – system message content
 * @param {Array<{role, content}>} opts.messages   – prior chat history (newest last)
 * @param {Array} opts.tools                       – tool definitions
 * @param {number} [opts.maxIterations=5]          – cap on tool-call rounds
 * @param {number} [opts.maxTokens=1200]
 * @param {number} [opts.temperature=0.2]
 * @param {function} [opts.onToolCall]             – observability: (name, args, result) => void
 * @returns {Promise<{content: string, toolCalls: Array, iterations: number}>}
 */
async function runAgentWithTools({
  taskName,
  systemPrompt,
  messages = [],
  tools = [],
  maxIterations = 5,
  maxTokens = 1200,
  temperature = 0.2,
  onToolCall,
}) {
  const client = getGroqClient();
  const model = getModelForTask(taskName);

  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error('runAgentWithTools requires at least one tool');
  }

  const handlers = {};
  const toolSchemas = tools.map((t) => {
    handlers[t.name] = t.handler;
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    };
  });

  const conversation = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const toolCallsLog = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.chat.completions.create({
      model,
      messages: conversation,
      tools: toolSchemas,
      tool_choice: 'auto',
      temperature,
      max_tokens: maxTokens,
    });
    const msg = response.choices[0].message;

    // Terminal: plain assistant reply.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { content: msg.content || '', toolCalls: toolCallsLog, iterations: i };
    }

    // Record the assistant message (with tool_calls) before injecting tool results.
    conversation.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: msg.tool_calls,
    });

    for (const call of msg.tool_calls) {
      const fnName = call.function?.name;
      let args = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      let result;
      let error = null;
      try {
        const handler = handlers[fnName];
        if (!handler) throw new Error(`Unknown tool: ${fnName}`);
        result = await handler(args);
      } catch (err) {
        error = err?.message || String(err);
        result = { error };
      }

      const logEntry = { name: fnName, args, error, resultSample: safeSample(result) };
      toolCallsLog.push(logEntry);
      if (typeof onToolCall === 'function') {
        try { onToolCall(fnName, args, result); } catch { /* non-fatal */ }
      }

      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        name: fnName,
        content: JSON.stringify(result ?? null).slice(0, 12000),
      });
    }
  }

  return {
    content: 'I ran out of tool-call iterations while trying to answer that. Try asking a narrower question.',
    toolCalls: toolCallsLog,
    iterations: maxIterations,
  };
}

function safeSample(value) {
  try {
    const s = JSON.stringify(value);
    return s.length > 400 ? `${s.slice(0, 400)}… (${s.length} chars)` : s;
  } catch {
    return '[unserializable]';
  }
}

module.exports = { runAgent, runAgentWithTools };
