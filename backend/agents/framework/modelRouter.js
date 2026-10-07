/**
 * Model names (GEMINI_MIGRATION.md). Precedence per tier:
 *   neutral LLM_MODEL / LLM_MODEL_CHEAP
 *   -> legacy GROQ_MODEL / GROQ_MODEL_CHEAP (so Groq revisions need no env change)
 *   -> the provider's default (same model for both tiers).
 * Leaf module: must not require lib/llmClient. Reads env at call time, and
 * uses the same LLM_PROVIDER test as the client factory.
 */
const PROVIDER_DEFAULT_MODELS = {
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-3.8-flash',
};
const defaultModelForProvider = () =>
  (process.env.LLM_PROVIDER === 'gemini' ? PROVIDER_DEFAULT_MODELS.gemini : PROVIDER_DEFAULT_MODELS.groq);

const CHEAP_MODEL = () =>
  process.env.LLM_MODEL_CHEAP || process.env.GROQ_MODEL_CHEAP || defaultModelForProvider();
const EXPENSIVE_MODEL = () =>
  process.env.LLM_MODEL || process.env.GROQ_MODEL || defaultModelForProvider();

const TASK_MODEL_MAP = {
  intent: 'cheap',
  conversation_manager: 'cheap',
  plan_modify: 'cheap',
  feedback: 'cheap',
  engagement: 'cheap',
  material_summary: 'cheap',
  plan: 'expensive',
  assessment: 'expensive',
  teaching: 'expensive',
  quiz: 'expensive',
  topic_plan: 'expensive',
  topic_plan_modify: 'expensive',
  topic_draft_modify: 'expensive',
  struggle_summary: 'cheap',
  instructor_insights: 'expensive',
  probe_intent: 'cheap',
  code_check: 'expensive',
};

function getModelForTask(taskName) {
  const tier = TASK_MODEL_MAP[taskName] || 'expensive';
  return tier === 'cheap' ? CHEAP_MODEL() : EXPENSIVE_MODEL();
}

module.exports = { getModelForTask, CHEAP_MODEL, EXPENSIVE_MODEL };
