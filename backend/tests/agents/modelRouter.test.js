/**
 * Re-pinned 2026-08 Groq model migration: llama-3.3-70b-versatile and
 * llama-3.1-8b-instant were decommissioned by Groq mid-study; every tier now
 * defaults to openai/gpt-oss-120b, with GROQ_MODEL / GROQ_MODEL_CHEAP env as
 * the production override (both point at gpt-oss-120b on Cloud Run until a
 * smaller model is unblocked for the cheap tier).
 *
 * Gemini migration (GEMINI_MIGRATION.md): neutral LLM_MODEL / LLM_MODEL_CHEAP
 * outrank the legacy GROQ_MODEL* vars, and the fallback default follows
 * LLM_PROVIDER — gemini-3.8-flash for both tiers on 'gemini' (the 2.5 family
 * is closed to new API users), gpt-oss-120b otherwise.
 */
describe('Model Router', () => {
  const savedModel = process.env.GROQ_MODEL;
  const savedCheap = process.env.GROQ_MODEL_CHEAP;
  const savedLlmModel = process.env.LLM_MODEL;
  const savedLlmCheap = process.env.LLM_MODEL_CHEAP;
  const savedProvider = process.env.LLM_PROVIDER;

  beforeEach(() => {
    // The neutral vars and the provider switch change every default below;
    // start each test from "none set" so a developer's shell can't leak in.
    delete process.env.LLM_MODEL;
    delete process.env.LLM_MODEL_CHEAP;
    delete process.env.LLM_PROVIDER;
  });

  afterEach(() => {
    if (savedModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = savedModel;
    if (savedCheap === undefined) delete process.env.GROQ_MODEL_CHEAP;
    else process.env.GROQ_MODEL_CHEAP = savedCheap;
    if (savedLlmModel === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = savedLlmModel;
    if (savedLlmCheap === undefined) delete process.env.LLM_MODEL_CHEAP;
    else process.env.LLM_MODEL_CHEAP = savedLlmCheap;
    if (savedProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = savedProvider;
  });

  it('should return the cheap-tier model for intent task', () => {
    delete process.env.GROQ_MODEL_CHEAP;
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    const model = getModelForTask('intent');
    expect(model).toBe('openai/gpt-oss-120b');
  });

  it('should return the expensive-tier model for plan task', () => {
    delete process.env.GROQ_MODEL;
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    const model = getModelForTask('plan');
    expect(model).toBe('openai/gpt-oss-120b');
  });

  it('should return the expensive-tier model for unknown task', () => {
    delete process.env.GROQ_MODEL;
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    const model = getModelForTask('unknown_task');
    expect(model).toBe('openai/gpt-oss-120b');
  });

  it('honours GROQ_MODEL / GROQ_MODEL_CHEAP env overrides', () => {
    process.env.GROQ_MODEL = 'override/expensive';
    process.env.GROQ_MODEL_CHEAP = 'override/cheap';
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    expect(getModelForTask('plan')).toBe('override/expensive');
    expect(getModelForTask('intent')).toBe('override/cheap');
  });

  describe('neutral LLM_MODEL* env and per-provider defaults', () => {
    it('LLM_MODEL / LLM_MODEL_CHEAP outrank GROQ_MODEL / GROQ_MODEL_CHEAP', () => {
      process.env.GROQ_MODEL = 'groq/expensive';
      process.env.GROQ_MODEL_CHEAP = 'groq/cheap';
      process.env.LLM_MODEL = 'neutral/expensive';
      process.env.LLM_MODEL_CHEAP = 'neutral/cheap';
      const { getModelForTask, EXPENSIVE_MODEL, CHEAP_MODEL } = require('../../agents/framework/modelRouter');
      expect(EXPENSIVE_MODEL()).toBe('neutral/expensive');
      expect(CHEAP_MODEL()).toBe('neutral/cheap');
      expect(getModelForTask('plan')).toBe('neutral/expensive');
      expect(getModelForTask('intent')).toBe('neutral/cheap');
    });

    it('each tier reads only its own vars (LLM_MODEL never leaks into the cheap tier, or vice versa)', () => {
      delete process.env.GROQ_MODEL;
      delete process.env.GROQ_MODEL_CHEAP;
      process.env.LLM_MODEL = 'neutral/expensive';
      const { EXPENSIVE_MODEL, CHEAP_MODEL } = require('../../agents/framework/modelRouter');
      expect(EXPENSIVE_MODEL()).toBe('neutral/expensive');
      expect(CHEAP_MODEL()).toBe('openai/gpt-oss-120b');
      delete process.env.LLM_MODEL;
      process.env.LLM_MODEL_CHEAP = 'neutral/cheap';
      expect(EXPENSIVE_MODEL()).toBe('openai/gpt-oss-120b');
      expect(CHEAP_MODEL()).toBe('neutral/cheap');
    });

    it("LLM_PROVIDER='gemini' with no model env -> gemini-3.8-flash for both tiers", () => {
      delete process.env.GROQ_MODEL;
      delete process.env.GROQ_MODEL_CHEAP;
      process.env.LLM_PROVIDER = 'gemini';
      const { getModelForTask, EXPENSIVE_MODEL, CHEAP_MODEL } = require('../../agents/framework/modelRouter');
      expect(EXPENSIVE_MODEL()).toBe('gemini-3.8-flash');
      expect(CHEAP_MODEL()).toBe('gemini-3.8-flash');
      expect(getModelForTask('teaching')).toBe('gemini-3.8-flash');
      expect(getModelForTask('probe_intent')).toBe('gemini-3.8-flash');
    });

    it.each([['groq'], [undefined], ['anything-else']])(
      'LLM_PROVIDER=%s with no model env -> openai/gpt-oss-120b for both tiers',
      (provider) => {
        delete process.env.GROQ_MODEL;
        delete process.env.GROQ_MODEL_CHEAP;
        if (provider !== undefined) process.env.LLM_PROVIDER = provider;
        const { EXPENSIVE_MODEL, CHEAP_MODEL } = require('../../agents/framework/modelRouter');
        expect(EXPENSIVE_MODEL()).toBe('openai/gpt-oss-120b');
        expect(CHEAP_MODEL()).toBe('openai/gpt-oss-120b');
      },
    );

    it('under gemini, LLM_MODEL* pick the model; legacy GROQ_MODEL* still outrank the provider default', () => {
      // Deploy implication: a Gemini revision that inherits GROQ_MODEL*
      // must set LLM_MODEL / LLM_MODEL_CHEAP, or the Groq model name wins.
      process.env.LLM_PROVIDER = 'gemini';
      process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
      process.env.GROQ_MODEL_CHEAP = 'openai/gpt-oss-120b';
      const { EXPENSIVE_MODEL, CHEAP_MODEL } = require('../../agents/framework/modelRouter');
      expect(EXPENSIVE_MODEL()).toBe('openai/gpt-oss-120b');
      expect(CHEAP_MODEL()).toBe('openai/gpt-oss-120b');
      process.env.LLM_MODEL = 'gemini-3.8-flash';
      process.env.LLM_MODEL_CHEAP = 'gemini-3.8-flash';
      expect(EXPENSIVE_MODEL()).toBe('gemini-3.8-flash');
      expect(CHEAP_MODEL()).toBe('gemini-3.8-flash');
    });

    it('reads env at call time, not at require time', () => {
      delete process.env.GROQ_MODEL;
      const { EXPENSIVE_MODEL } = require('../../agents/framework/modelRouter');
      expect(EXPENSIVE_MODEL()).toBe('openai/gpt-oss-120b');
      process.env.LLM_PROVIDER = 'gemini';
      expect(EXPENSIVE_MODEL()).toBe('gemini-3.8-flash');
      process.env.LLM_MODEL = 'later/model';
      expect(EXPENSIVE_MODEL()).toBe('later/model');
    });

    it('stays a leaf module (no requires, so call sites can import it without a cycle)', () => {
      const src = require('fs').readFileSync(require.resolve('../../agents/framework/modelRouter'), 'utf8');
      expect(src).not.toMatch(/require\(/);
    });
  });
});
