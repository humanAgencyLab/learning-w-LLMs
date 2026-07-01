const { getGroqClient } = require('../../lib/llmClient');
const { getModelForTask } = require('./modelRouter');

/**
 * Default per-call Groq timeout. Groq happy-path is 1–3 s; occasional slow
 * responses land around 8–10 s. 15 s gives ~5× headroom and keeps us under
 * the CRA dev-proxy's 20 s ceiling so we always surface a clean "degraded"
 * state instead of the socket-hangup → "Backend unreachable" chain.
 */
const DEFAULT_AGENT_TIMEOUT_MS = 15000;

/**
 * Throws the tagged timeout error our route-level handlers recognize.
 * Using a stable `err.code` ('AGENT_TIMEOUT') means callers don't have to
 * string-match the message — they can branch on the code and return a
 * `degraded: true` payload.
 */
function makeAgentTimeoutError(reason = 'Agent call timed out') {
  const err = new Error('agent_timeout');
  err.code = 'AGENT_TIMEOUT';
  err.reason = reason;
  return err;
}

/**
 * Wrap a Groq `client.chat.completions.create(...)` call with an
 * AbortController so a stalled request rejects with AGENT_TIMEOUT instead
 * of hanging until the proxy drops the socket.
 *
 * The Groq SDK accepts a second `{ signal }` argument (OpenAI-style). If
 * a future SDK change removes that, the setTimeout-side still fires and
 * the resulting race still rejects in bounded time — we just lose the
 * ability to cancel the underlying fetch.
 */
async function createChatCompletionWithTimeout(client, requestOpts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await client.chat.completions.create(requestOpts, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw makeAgentTimeoutError(`Groq call exceeded ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
 * @param {number} [opts.timeoutMs=15000] – per-call Groq timeout. On abort throws
 *                                          an error with `code === 'AGENT_TIMEOUT'`.
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
  timeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
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

  const response = await createChatCompletionWithTimeout(client, requestOpts, timeoutMs);
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
 * @param {number}   [opts.timeoutMs=15000]        – per-round Groq timeout. Cap is
 *                                                   per Groq round, not the whole
 *                                                   loop — tool handlers run on
 *                                                   the server and shouldn't be
 *                                                   counted against the LLM budget.
 * @returns {Promise<{content: string, toolCalls: Array, iterations: number}>}
 */
async function runAgentWithTools({
  taskName,
  systemPrompt,
  messages = [],
  tools = [],
  maxIterations = 5,
  maxTokens = 2000,
  temperature = 0.2,
  onToolCall,
  timeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
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
    const response = await createChatCompletionWithTimeout(
      client,
      {
        model,
        messages: conversation,
        tools: toolSchemas,
        tool_choice: 'auto',
        temperature,
        max_tokens: maxTokens,
      },
      timeoutMs,
    );
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

  // Iteration budget exhausted. Instead of a bare failure, surface what the
  // agent DID learn from the tool-call log. Summarized server-side (no extra
  // LLM round — that would risk burning another iteration).
  const summaryLines = toolCallsLog.slice(0, 8).map((entry) => {
    const label = entry.name || 'tool';
    if (entry.error) return `• ${label}: error — ${entry.error}`;
    return `• ${label}: ${oneLineDigest(entry.resultSample)}`;
  });
  const summary = summaryLines.length ? summaryLines.join('\n') : '(no tool calls completed)';
  return {
    content: `I couldn't finish the full analysis, but here's what I did find:\n${summary}\n\nAsk a narrower follow-up if you want me to go deeper on any of these.`,
    toolCalls: toolCallsLog,
    iterations: maxIterations,
  };
}

// One-line digest of a tool result sample (already a truncated JSON string from
// safeSample) for the iteration-limit fallback.
function oneLineDigest(sample) {
  if (sample == null) return 'no data';
  const s = String(sample).replace(/\s+/g, ' ').trim();
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
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
