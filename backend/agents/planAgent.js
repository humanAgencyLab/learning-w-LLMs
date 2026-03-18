const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validatePlan } = require('./validators/planValidator');

const SYSTEM_PROMPT = `You are an expert curriculum designer. Given a topic and learner profile, generate a structured learning plan.

Return ONLY valid JSON with these fields:
- topic: the learning topic (string)
- chatTitle: a concise human-friendly title (≤40 chars)
- rationale: brief explanation of why this plan fits the learner (1-2 sentences)
- plan: array of modules, each with:
  - moduleId: string (e.g. "1", "2")
  - title: module title
  - targets: array of 3-6 milestone strings (specific, actionable, 8-20 words each)
  - points: number (total across all modules must equal 100)
  - difficulty: "intro" | "core" | "apply"
- nextPhase: "planning"

Rules:
- Generate 2-3 modules (never more than 3, never fewer than 2)
- Each module must have 3-6 milestones (targets)
- Milestones must be specific and meaningful, not generic
- Point distribution should reflect module complexity (not equal splits)
- Introductory modules get fewer points, advanced get more`;

function buildUserPrompt(userMessage, profile, prevErrors) {
  const profileStr = profile
    ? `LEARNER PROFILE:\n- Name: ${profile.name}\n- Education: ${profile.educationLevel || 'not specified'}\n- Experience: ${profile.experienceLevel || 'not specified'}`
    : 'LEARNER PROFILE: not provided';

  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';

  return `${profileStr}

USER MESSAGE: "${userMessage}"

Generate a learning plan for this topic.${errHint}`;
}

async function runPlanAgent({ userMessage, profile }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      runAgent({
        taskName: 'plan',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(userMessage, profile, prevErrors),
        maxTokens: 1200,
        temperature: 0.5,
      }),
    validatePlan,
    { agentName: 'PlanAgent' },
  );

  if (!valid) {
    return { type: 'plan', payload: null, valid: false, errors };
  }
  return { type: 'plan', payload: output, valid: true, errors: [] };
}

module.exports = { runPlanAgent };
