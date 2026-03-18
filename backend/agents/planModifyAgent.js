const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validatePlan } = require('./validators/planValidator');

const SYSTEM_PROMPT = `You are an expert curriculum designer. Given an existing learning plan and a modification request, generate an updated plan.

Return ONLY valid JSON with the same schema as the original plan:
- topic, chatTitle, rationale, plan (array of modules), nextPhase: "planning"

Rules:
- 2-3 modules (never more than 3)
- Each module: 3-6 targets, meaningful and specific
- Points must total ~100
- Preserve the topic unless the user explicitly requests a change
- Address the modification request while keeping the overall structure sound`;

function buildUserPrompt(existingPlan, modificationRequest, topic, prevErrors) {
  const planSummary = existingPlan
    .map((m, i) => `${i + 1}. ${m.title} (${m.points} pts): ${(m.milestones || []).map(ms => ms.text || ms).join('; ')}`)
    .join('\n');

  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';

  return `CURRENT TOPIC: "${topic}"

EXISTING PLAN:
${planSummary}

MODIFICATION REQUEST: "${modificationRequest}"

Generate an updated plan.${errHint}`;
}

async function runPlanModifyAgent({ session, modificationRequest }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      runAgent({
        taskName: 'plan_modify',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(session.plan, modificationRequest, session.topic, prevErrors),
        maxTokens: 1200,
        temperature: 0.5,
      }),
    validatePlan,
    { agentName: 'PlanModifyAgent' },
  );

  if (!valid) {
    return { type: 'plan_modify', payload: null, valid: false, errors };
  }
  return { type: 'plan_modify', payload: output, valid: true, errors: [] };
}

module.exports = { runPlanModifyAgent };
