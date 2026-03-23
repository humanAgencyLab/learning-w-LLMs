const { z } = require('zod');

const MilestoneSchema = z.object({
  text: z.string().min(1).max(2000)
});

const ModuleSchema = z.object({
  moduleId: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().default(''),
  difficulty: z.enum(['intro', 'core', 'apply']).optional().default('core'),
  points: z.number().min(0).max(1000),
  milestones: z.array(MilestoneSchema).min(2).max(8),
  quizPattern: z.record(z.unknown()).optional()
});

const TopicsPayloadSchema = z.object({
  topics: z.array(z.object({
    title: z.string().min(1).max(300),
    objective: z.string().max(2000).optional().default(''),
    orderIndex: z.number().int().min(0).optional(),
    modules: z.array(ModuleSchema).min(1).max(8)
  })).min(1).max(20)
});

/**
 * @param {unknown} data - parsed JSON from LLM
 * @returns {{ valid: boolean, topics?: any[], errors: string[] }}
 */
function validateTopicPlanPayload(data) {
  const parsed = TopicsPayloadSchema.safeParse(data);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { valid: false, errors };
  }
  return { valid: true, topics: parsed.data.topics, errors: [] };
}

module.exports = {
  validateTopicPlanPayload,
  TopicsPayloadSchema
};
