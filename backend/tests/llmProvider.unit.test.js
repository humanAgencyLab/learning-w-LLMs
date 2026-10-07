/**
 * LLM provider adapter (GEMINI_MIGRATION.md Phases 1-2).
 *
 * lib/llmClient.js picks the provider from LLM_PROVIDER: 'gemini' -> the
 * `openai` package pointed at Google's OpenAI-compatible endpoint, wrapped by
 * wrapForGemini; anything else -> the pre-migration Groq client, unchanged.
 * Phase-0 probe (gemini-3.8-flash, live key) set the Gemini wrapper's rules:
 * inject reasoning_effort:'none' unless the caller set one (any thinking at
 * all ate small budgets whole), and NO system-message merge (the compat
 * endpoint takes several system messages natively).
 *
 * Both SDKs are mocked at module level. Each mock can expose its constructor
 * as a named export ({ Groq } / { OpenAI }) or as the module itself (the real
 * packages' shape); the suite's other files use both groq-sdk shapes, so both
 * are exercised here.
 */
const fs = require('fs');
const path = require('path');

const mockGroqCreate = jest.fn();
const mockGroqCtor = jest.fn(() => ({ chat: { completions: { create: mockGroqCreate } } }));
let mockGroqExportShape = 'named';
jest.mock('groq-sdk', () => (mockGroqExportShape === 'named' ? { Groq: mockGroqCtor } : mockGroqCtor));

const mockOpenAICreate = jest.fn();
const mockOpenAICtor = jest.fn(() => ({ chat: { completions: { create: mockOpenAICreate } } }));
let mockOpenAIExportShape = 'named';
jest.mock('openai', () => (mockOpenAIExportShape === 'named' ? { OpenAI: mockOpenAICtor } : mockOpenAICtor));

const {
  getGroqClient,
  getLLMClient,
  setGroqClient,
  resetGroqClient,
  wrapWithReasoningDefaults,
  wrapForGemini,
  GEMINI_OPENAI_COMPAT_BASE_URL,
} = require('../lib/llmClient');
const { runAgent, runAgentWithTools } = require('../agents/framework/baseAgent');

const COMPAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const ENV_KEYS = [
  'LLM_PROVIDER', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'LLM_MODEL', 'LLM_MODEL_CHEAP', 'GROQ_MODEL', 'GROQ_MODEL_CHEAP',
];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

/** A bare client shaped like both SDKs, for testing the wrappers directly. */
function fakeClient() {
  const create = jest.fn(async () => ({ ok: true }));
  return { client: { chat: { completions: { create } } }, create };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetGroqClient();
  for (const k of ['LLM_PROVIDER', 'LLM_MODEL', 'LLM_MODEL_CHEAP', 'GROQ_MODEL', 'GROQ_MODEL_CHEAP']) delete process.env[k];
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  mockGroqExportShape = 'named';
  mockOpenAIExportShape = 'named';
  resetGroqClient();
});

describe('provider selection', () => {
  it('LLM_PROVIDER unset -> groq-sdk client with GROQ_API_KEY; openai untouched', () => {
    const client = getGroqClient();
    expect(mockGroqCtor).toHaveBeenCalledTimes(1);
    expect(mockGroqCtor).toHaveBeenCalledWith({ apiKey: 'test-groq-key' });
    expect(mockOpenAICtor).not.toHaveBeenCalled();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it("LLM_PROVIDER='groq' -> the same groq-sdk client", () => {
    process.env.LLM_PROVIDER = 'groq';
    getGroqClient();
    expect(mockGroqCtor).toHaveBeenCalledWith({ apiKey: 'test-groq-key' });
    expect(mockOpenAICtor).not.toHaveBeenCalled();
  });

  it('any other LLM_PROVIDER value keeps the groq path (only "gemini" switches)', () => {
    process.env.LLM_PROVIDER = 'openai';
    getGroqClient();
    expect(mockGroqCtor).toHaveBeenCalledTimes(1);
    expect(mockOpenAICtor).not.toHaveBeenCalled();
  });

  it("LLM_PROVIDER='gemini' -> openai package on the compat baseURL with GEMINI_API_KEY, nothing else", () => {
    process.env.LLM_PROVIDER = 'gemini';
    const client = getGroqClient();
    expect(mockOpenAICtor).toHaveBeenCalledTimes(1);
    expect(mockOpenAICtor).toHaveBeenCalledWith({ apiKey: 'test-gemini-key', baseURL: COMPAT_URL });
    expect(GEMINI_OPENAI_COMPAT_BASE_URL).toBe(COMPAT_URL);
    expect(mockGroqCtor).not.toHaveBeenCalled();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('gemini without GEMINI_API_KEY throws, never falls back to groq, and caches nothing', () => {
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    expect(() => getGroqClient()).toThrow('GEMINI_API_KEY is not configured');
    expect(mockGroqCtor).not.toHaveBeenCalled();
    process.env.GEMINI_API_KEY = 'late-key';
    getGroqClient();
    expect(mockOpenAICtor).toHaveBeenCalledWith({ apiKey: 'late-key', baseURL: COMPAT_URL });
  });

  it('groq without GROQ_API_KEY still throws the pre-migration error', () => {
    delete process.env.GROQ_API_KEY;
    expect(() => getGroqClient()).toThrow('GROQ_API_KEY is not configured');
    expect(mockOpenAICtor).not.toHaveBeenCalled();
  });

  it('caches one singleton; env is re-read only after resetGroqClient()', () => {
    const first = getGroqClient();
    expect(getGroqClient()).toBe(first);
    process.env.LLM_PROVIDER = 'gemini';
    expect(getGroqClient()).toBe(first); // still the cached groq client
    expect(mockOpenAICtor).not.toHaveBeenCalled();
    resetGroqClient();
    const second = getGroqClient();
    expect(second).not.toBe(first);
    expect(mockOpenAICtor).toHaveBeenCalledTimes(1);
    expect(mockGroqCtor).toHaveBeenCalledTimes(1);
  });

  it('getLLMClient is an alias of getGroqClient', () => {
    expect(getLLMClient).toBe(getGroqClient);
    process.env.LLM_PROVIDER = 'gemini';
    expect(getLLMClient()).toBe(getGroqClient());
  });

  it('setGroqClient injects a client verbatim (no wrapping); resetGroqClient clears it', () => {
    const injected = { chat: { completions: { create: jest.fn() } } };
    const originalCreate = injected.chat.completions.create;
    setGroqClient(injected);
    expect(getGroqClient()).toBe(injected);
    expect(injected.chat.completions.create).toBe(originalCreate);
    expect(mockGroqCtor).not.toHaveBeenCalled();
    resetGroqClient();
    expect(getGroqClient()).not.toBe(injected);
  });

  // resetModules (not isolateModules): an already-instantiated mock in the
  // main registry would otherwise be reused and the shape never exercised.
  it('accepts groq-sdk exporting the constructor as the module itself', () => {
    mockGroqExportShape = 'default';
    try {
      jest.resetModules();
      expect(require('groq-sdk')).toBe(mockGroqCtor); // the shape under test is the one loaded
      const fresh = require('../lib/llmClient');
      fresh.getGroqClient().chat.completions.create({ model: 'openai/gpt-oss-120b', messages: [] });
      expect(mockGroqCtor).toHaveBeenCalledWith({ apiKey: 'test-groq-key' });
      expect(mockGroqCreate).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: 'low' }));
    } finally {
      mockGroqExportShape = 'named';
      jest.resetModules();
    }
  });

  it('accepts openai exporting the constructor as the module itself (the real package shape)', () => {
    mockOpenAIExportShape = 'default';
    process.env.LLM_PROVIDER = 'gemini';
    try {
      jest.resetModules();
      expect(require('openai')).toBe(mockOpenAICtor);
      const fresh = require('../lib/llmClient');
      fresh.getGroqClient().chat.completions.create({ model: 'gemini-3.8-flash', messages: [] });
      expect(mockOpenAICtor).toHaveBeenCalledWith({ apiKey: 'test-gemini-key', baseURL: COMPAT_URL });
      expect(mockOpenAICreate).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: 'none' }));
    } finally {
      mockOpenAIExportShape = 'named';
      jest.resetModules();
    }
  });
});

describe('wrapForGemini — reasoning default', () => {
  it("injects reasoning_effort:'none' for a Gemini model when the caller set none, nothing else changes", async () => {
    const { client, create } = fakeClient();
    wrapForGemini(client);
    const params = { model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 20 };
    await client.chat.completions.create(params);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({ ...params, reasoning_effort: 'none' });
  });

  it.each([['none'], ['low'], ['medium'], ['high']])(
    'an explicit caller value (%s) passes through untouched',
    async (effort) => {
      const { client, create } = fakeClient();
      wrapForGemini(client);
      await client.chat.completions.create({ model: 'gemini-3.8-flash', messages: [], reasoning_effort: effort });
      expect(create.mock.calls[0][0].reasoning_effort).toBe(effort);
    },
  );

  it('matches Gemini model names case-insensitively, including prefixed forms', async () => {
    const { client, create } = fakeClient();
    wrapForGemini(client);
    await client.chat.completions.create({ model: 'models/GEMINI-3.8-Flash', messages: [] });
    await client.chat.completions.create({ model: 'gemini-3.8-flash-lite', messages: [] });
    expect(create.mock.calls[0][0].reasoning_effort).toBe('none');
    expect(create.mock.calls[1][0].reasoning_effort).toBe('none');
  });

  it('leaves non-Gemini models alone (no gpt-oss "low" shim on the Gemini path)', async () => {
    const { client, create } = fakeClient();
    wrapForGemini(client);
    await client.chat.completions.create({ model: 'openai/gpt-oss-120b', messages: [] });
    expect(create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
  });

  it('never mutates the caller params object', async () => {
    const { client } = fakeClient();
    wrapForGemini(client);
    const params = { model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'x' }] };
    const snapshot = JSON.parse(JSON.stringify(params));
    await client.chat.completions.create(params);
    expect(params).toEqual(snapshot);
    expect(params).not.toHaveProperty('reasoning_effort');
  });

  it('passes response_format, tools, tool_choice, stream, temperature, top_p, max_tokens through as-is', async () => {
    const { client, create } = fakeClient();
    wrapForGemini(client);
    const tools = [{ type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object', properties: {} } } }];
    const params = {
      model: 'gemini-3.8-flash',
      messages: [{ role: 'user', content: 'x' }],
      response_format: { type: 'json_object' },
      tools,
      tool_choice: 'auto',
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1400,
    };
    await client.chat.completions.create(params);
    const sent = create.mock.calls[0][0];
    expect(sent).toEqual({ ...params, reasoning_effort: 'none' });
    expect(sent.response_format).toBe(params.response_format);
    expect(sent.tools).toBe(tools);
    expect(sent.messages).toBe(params.messages);
  });

  it('sends multiple system messages unmerged, in order (compat endpoint accepts them natively)', async () => {
    const { client, create } = fakeClient();
    wrapForGemini(client);
    const messages = [
      { role: 'system', content: 'persona' },
      { role: 'system', content: 'instructor guidelines' },
      { role: 'system', content: 'context summary' },
      { role: 'assistant', content: 'earlier turn' },
      { role: 'user', content: 'question' },
    ];
    await client.chat.completions.create({ model: 'gemini-3.8-flash', messages });
    expect(create.mock.calls[0][0].messages).toBe(messages);
    expect(create.mock.calls[0][0].messages.filter((m) => m.role === 'system')).toHaveLength(3);
  });

  it('forwards the request-options argument (AbortController signal) and the return value', async () => {
    const stream = { [Symbol.asyncIterator]: async function* gen() {} };
    const { client, create } = fakeClient();
    create.mockResolvedValueOnce(stream);
    wrapForGemini(client);
    const opts = { signal: new AbortController().signal };
    const out = await client.chat.completions.create({ model: 'gemini-3.8-flash', messages: [], stream: true }, opts);
    expect(create.mock.calls[0][1]).toBe(opts);
    expect(out).toBe(stream);
  });

  it('tolerates missing params exactly like the groq wrapper', async () => {
    const { client, create } = fakeClient();
    wrapForGemini(client);
    await client.chat.completions.create(undefined);
    expect(create).toHaveBeenCalledWith(undefined);
  });
});

describe('wrapWithReasoningDefaults — groq behavior unchanged', () => {
  it("injects reasoning_effort:'low' for gpt-oss models when unset", async () => {
    const { client, create } = fakeClient();
    wrapWithReasoningDefaults(client);
    const params = { model: 'openai/gpt-oss-120b', messages: [], max_tokens: 300 };
    await client.chat.completions.create(params);
    expect(create.mock.calls[0][0]).toEqual({ ...params, reasoning_effort: 'low' });
    expect(params).not.toHaveProperty('reasoning_effort');
  });

  it('keeps a caller-set reasoning_effort', async () => {
    const { client, create } = fakeClient();
    wrapWithReasoningDefaults(client);
    await client.chat.completions.create({ model: 'openai/gpt-oss-120b', messages: [], reasoning_effort: 'medium' });
    expect(create.mock.calls[0][0].reasoning_effort).toBe('medium');
  });

  it('leaves non-gpt-oss models alone (and never applies the Gemini "none" default)', async () => {
    const { client, create } = fakeClient();
    wrapWithReasoningDefaults(client);
    await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [] });
    await client.chat.completions.create({ model: 'gemini-3.8-flash', messages: [] });
    expect(create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
    expect(create.mock.calls[1][0]).not.toHaveProperty('reasoning_effort');
  });

  it('the factory groq client applies it end to end, with params and options otherwise untouched', async () => {
    const opts = { signal: new AbortController().signal };
    const messages = [{ role: 'system', content: 'a' }, { role: 'system', content: 'b' }, { role: 'user', content: 'c' }];
    await getGroqClient().chat.completions.create({ model: 'openai/gpt-oss-120b', messages, temperature: 0.7 }, opts);
    expect(mockGroqCreate).toHaveBeenCalledWith(
      { model: 'openai/gpt-oss-120b', messages, temperature: 0.7, reasoning_effort: 'low' },
      opts,
    );
    expect(mockGroqCreate.mock.calls[0][0].messages).toBe(messages);
  });

  it('the factory groq client carries no Gemini behavior, whatever the model name', async () => {
    const params = { model: 'gemini-3.8-flash', messages: [] };
    await getGroqClient().chat.completions.create(params);
    expect(mockGroqCreate.mock.calls[0][0]).toBe(params); // not even copied
  });
});

describe('call sites stay provider-blind (baseAgent through the factory)', () => {
  it('runAgent on gemini: provider-default model, json mode, reasoning none, abort signal forwarded', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    mockOpenAICreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    const out = await runAgent({ taskName: 'probe_intent', systemPrompt: 's', userPrompt: 'u', maxTokens: 300 });
    expect(out).toEqual({ ok: true });
    expect(mockOpenAICreate).toHaveBeenCalledWith(
      {
        model: 'gemini-3.8-flash',
        messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        reasoning_effort: 'none',
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });

  it("runAgent's explicit reasoningEffort (code_check 'medium') survives the Gemini wrapper", async () => {
    process.env.LLM_PROVIDER = 'gemini';
    mockOpenAICreate.mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] });
    await runAgent({ taskName: 'code_check', systemPrompt: 's', userPrompt: 'u', reasoningEffort: 'medium' });
    expect(mockOpenAICreate.mock.calls[0][0].reasoning_effort).toBe('medium');
  });

  it('runAgent on groq (unset provider) is the pre-migration request', async () => {
    mockGroqCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":1}' } }] });
    await runAgent({ taskName: 'teaching', systemPrompt: 's', userPrompt: 'u' });
    expect(mockGroqCreate.mock.calls[0][0]).toEqual({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
    });
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });

  it('runAgentWithTools on gemini: tools/tool_choice and the role:tool round trip pass through unchanged', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    mockOpenAICreate
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'tool_calls',
          message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } }] },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: 'done' } }] });
    const handler = jest.fn(async () => ({ value: 42 }));
    const out = await runAgentWithTools({
      taskName: 'instructor_insights',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'lookup', description: 'd', parameters: { type: 'object', properties: {} }, handler }],
    });
    expect(out.content).toBe('done');
    expect(handler).toHaveBeenCalledWith({ q: 'x' });
    const first = mockOpenAICreate.mock.calls[0][0];
    expect(first.tool_choice).toBe('auto');
    expect(first.tools[0]).toEqual({ type: 'function', function: { name: 'lookup', description: 'd', parameters: { type: 'object', properties: {} } } });
    expect(first.reasoning_effort).toBe('none');
    const second = mockOpenAICreate.mock.calls[1][0];
    expect(second.messages.find((m) => m.role === 'tool')).toEqual({
      role: 'tool', tool_call_id: 'call_1', name: 'lookup', content: JSON.stringify({ value: 42 }),
    });
  });
});

describe('model names are single-sourced in modelRouter (fallback sweep)', () => {
  const ROOT = path.join(__dirname, '..');
  const RUNTIME_DIRS = ['routes', 'services', 'agents', 'models', 'prompts', 'middleware', 'utils', 'lib', 'validation', 'config'];
  const ROUTER = path.join('agents', 'framework', 'modelRouter.js');

  function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(p, out);
      } else if (entry.name.endsWith('.js')) {
        out.push(p);
      }
    }
    return out;
  }
  const runtimeFiles = () => {
    const files = ['app.js', 'server.js'].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
    for (const d of RUNTIME_DIRS) walk(path.join(ROOT, d), files);
    return files;
  };

  it('no runtime file outside modelRouter hardcodes a provider model name or reads GROQ_MODEL* directly', () => {
    const offenders = [];
    for (const file of runtimeFiles()) {
      const rel = path.relative(ROOT, file);
      if (rel === ROUTER) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/['"`]openai\/gpt-oss-[\w.-]+['"`]/.test(src)) offenders.push(`${rel}: gpt-oss model literal`);
      if (/['"`](models\/)?gemini-[\w.-]+['"`]/.test(src)) offenders.push(`${rel}: gemini model literal`);
      if (/process\.env\.(GROQ_MODEL|GROQ_MODEL_CHEAP|LLM_MODEL|LLM_MODEL_CHEAP)\b/.test(src)) offenders.push(`${rel}: reads model env directly`);
    }
    expect(offenders).toEqual([]);
  });

  it('the in-app sim student keeps its SIM_GROQ_MODEL override ahead of the cheap tier', () => {
    const src = fs.readFileSync(require.resolve('../services/simulation/simulationRunService'), 'utf8');
    expect(src).toMatch(/const STUDENT_MODEL = process\.env\.SIM_GROQ_MODEL \|\| CHEAP_MODEL\(\);/);
  });

  it('the summarizer middleware stays on the cheap tier', () => {
    const src = fs.readFileSync(require.resolve('../middleware/contextControl'), 'utf8');
    expect(src).toMatch(/model: CHEAP_MODEL\(\),/);
    expect(src).not.toMatch(/EXPENSIVE_MODEL/);
  });
});
