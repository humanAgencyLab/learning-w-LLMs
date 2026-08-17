/**
 * Re-pinned 2026-08 Groq model migration: llama-3.3-70b-versatile and
 * llama-3.1-8b-instant were decommissioned by Groq mid-study; every tier now
 * defaults to openai/gpt-oss-120b, with GROQ_MODEL / GROQ_MODEL_CHEAP env as
 * the production override (both point at gpt-oss-120b on Cloud Run until a
 * smaller model is unblocked for the cheap tier).
 */
describe('Model Router', () => {
  const savedModel = process.env.GROQ_MODEL;
  const savedCheap = process.env.GROQ_MODEL_CHEAP;

  afterEach(() => {
    if (savedModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = savedModel;
    if (savedCheap === undefined) delete process.env.GROQ_MODEL_CHEAP;
    else process.env.GROQ_MODEL_CHEAP = savedCheap;
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
});
