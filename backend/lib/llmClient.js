let _client = null;

/**
 * Reasoning-model shim (2026-08-17 Groq model migration). Groq decommissioned
 * llama-3.3-70b-versatile and llama-3.1-8b-instant; the replacement
 * (openai/gpt-oss-120b) is a REASONING model whose thinking consumes
 * completion tokens. Every agent in this codebase sized max_tokens for
 * non-reasoning Llama models, so default reasoning effort truncated JSON
 * outputs mid-generation (Groq json_validate_failed — the briefing was the
 * first casualty). Injecting reasoning_effort:'low' at the client keeps every
 * existing token budget valid and every call site untouched; measured: a
 * briefing-style JSON reply dropped from 207 to 91 completion tokens and
 * parses cleanly even at a 220-token budget. Callers that explicitly set
 * reasoning_effort keep their value.
 */
function wrapWithReasoningDefaults(client) {
  const create = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = (params, ...rest) => {
    if (params && typeof params.model === 'string' && /gpt-oss/i.test(params.model) && params.reasoning_effort === undefined) {
      params = { ...params, reasoning_effort: 'low' };
    }
    return create(params, ...rest);
  };
  return client;
}

// Lazy import so jest.mock('groq-sdk') works. Tolerate both export shapes:
// the real SDK (and some test mocks) export the constructor as the default,
// others expose only a named `Groq`.
function getGroqClient() {
  if (_client) return _client;
  const GroqSdk = require('groq-sdk');
  const Groq = GroqSdk.Groq || GroqSdk;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  _client = wrapWithReasoningDefaults(new Groq({ apiKey }));
  return _client;
}

function setGroqClient(client) {
  _client = client;
}

function resetGroqClient() {
  _client = null;
}

module.exports = { getGroqClient, setGroqClient, resetGroqClient, wrapWithReasoningDefaults };

