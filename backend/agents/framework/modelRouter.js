const CHEAP_MODEL = () => process.env.GROQ_MODEL_CHEAP || 'openai/gpt-oss-120b';
const EXPENSIVE_MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

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
