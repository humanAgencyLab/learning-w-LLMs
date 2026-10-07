let _client = null;

/**
 * LLM provider factory (GEMINI_MIGRATION.md, Phase 1).
 *
 * `LLM_PROVIDER=gemini` selects Google's OpenAI-compatible endpoint through
 * the `openai` package. Anything else (unset, 'groq', ...) is the Groq path,
 * unchanged from before the migration. The returned client always exposes
 * the same `chat.completions.create(params, requestOptions)` surface, so the
 * ~15 call sites stay provider-blind; every provider difference is absorbed
 * by the per-provider wrapper below.
 *
 * The env is read when the singleton is first built (and again after
 * resetGroqClient()), never per call.
 */
const GEMINI_OPENAI_COMPAT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

function isGeminiProvider() {
  return process.env.LLM_PROVIDER === 'gemini';
}

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

/**
 * Gemini analog of wrapWithReasoningDefaults. Gemini thinking models spend
 * completion tokens on thinking BEFORE any content, exactly like gpt-oss
 * reasoning did. Phase-0 probe on gemini-3.8-flash (live key): at
 * max_tokens 20, default thinking, reasoning_effort:'low' and
 * thinking_budget:0 ALL returned empty content (finish_reason=length,
 * completion_tokens=0); reasoning_effort:'none' answered correctly in one
 * token. Default thinking also truncated a 400-token json_object reply
 * (~380 tokens of thinking, unterminated JSON).
 *
 * gpt-oss gets 'low' because it CANNOT disable reasoning; Gemini can, so
 * 'none' is the faithful default: it restores the pre-gpt-oss
 * (non-reasoning Llama) token math every max_tokens budget in this codebase
 * was sized for.
 *
 * Callers that explicitly set reasoning_effort keep their value untouched
 * (code_check 'medium', sim students 'low'). Every other param —
 * response_format, tools, tool_choice, stream, temperature, top_p,
 * max_tokens, messages (multiple system messages are accepted natively by
 * the compat endpoint, probe-verified) — and the request-options argument
 * (AbortController `{ signal }`) pass through as-is. The caller's params
 * object is never mutated.
 *
 * PROBE-TODO: only gemini-3.8-flash was measured. /gemini/i matches every
 * Gemini model, so before pointing LLM_MODEL / LLM_MODEL_CHEAP at another
 * one (e.g. a flash-lite cheap tier), re-probe that it accepts
 * reasoning_effort:'none' and the explicit 'low'/'medium' callers send.
 */
function wrapForGemini(client) {
  const create = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = (params, ...rest) => {
    if (params && typeof params.model === 'string' && /gemini/i.test(params.model) && params.reasoning_effort === undefined) {
      params = { ...params, reasoning_effort: 'none' };
    }
    return create(params, ...rest);
  };
  return client;
}

// Lazy import so jest.mock('groq-sdk') works. Tolerate both export shapes:
// the real SDK (and some test mocks) export the constructor as the default,
// others expose only a named `Groq`.
function createGroqClient() {
  const GroqSdk = require('groq-sdk');
  const Groq = GroqSdk.Groq || GroqSdk;
  // .trim(): Cloud Run injects secret bytes verbatim — a trailing newline
  // from a pasted secret version makes an invalid Authorization header and
  // every call fails as a bare "Connection error".
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return wrapWithReasoningDefaults(new Groq({ apiKey }));
}

// Lazy import so jest.mock('openai') works; same export-shape tolerance as
// groq-sdk (the real package exports the constructor as module.exports,
// `.OpenAI` and `.default`).
//
// PROBE-TODO: SDK defaults differ — openai's per-request timeout is 10 min,
// groq-sdk's is 1 min (both retry twice). Calls bounded by baseAgent's
// AbortController are unaffected; un-aborted sites (teacherService, quiz,
// assessment routes) would wait longer on a stalled Gemini call. Left at
// the SDK default until Phase 0/3 timings say what a Gemini-safe ceiling is
// (a 60 s parity value could cut heavy topic-plan generations short).
function createGeminiClient() {
  const OpenAISdk = require('openai');
  const OpenAI = OpenAISdk.OpenAI || OpenAISdk;
  const apiKey = (process.env.GEMINI_API_KEY || '').trim(); // see Groq note
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return wrapForGemini(new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_COMPAT_BASE_URL }));
}

// Name kept from the Groq-only era so existing call sites stay untouched; it
// returns whichever provider's wrapped client LLM_PROVIDER selects.
function getGroqClient() {
  if (_client) return _client;
  _client = isGeminiProvider() ? createGeminiClient() : createGroqClient();
  return _client;
}

function setGroqClient(client) {
  _client = client;
}

function resetGroqClient() {
  _client = null;
}

module.exports = {
  getGroqClient,
  getLLMClient: getGroqClient,
  setGroqClient,
  resetGroqClient,
  wrapWithReasoningDefaults,
  wrapForGemini,
  GEMINI_OPENAI_COMPAT_BASE_URL,
};
