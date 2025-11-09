const { z } = require('zod');

// Import profile schema from session validation
const { profileSchema } = require('./sessionValidation');

// Assessment request schema
const assessmentRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  userMessage: z.string()
    .min(1, 'User message is required')
    .max(1000, 'User message too long')
    .transform(msg => msg.replace(/<[^>]*>/g, '')), // Strip HTML
  mode: z.enum(['studying', 'revision']).default('studying'),
  profile: profileSchema.optional() // Optional in body; will load from session if not provided
});

// Module schema for plan
const moduleSchema = z.object({
  moduleId: z.string().regex(/^\d+$/, 'Module ID must be numeric string'),
  title: z.string()
    .min(1, 'Title is required')
    .max(50, 'Title too long')
    .refine(title => !/^(Module|Part|Section)\s*\d+$/i.test(title), 'Title must be content-specific, not generic'),
  targets: z.array(z.string())
    .min(1, 'At least one learning target required')
    .max(10, 'Too many targets'),
  points: z.number()
    .int('Points must be integer')
    .min(1, 'Points must be positive')
    .max(60, 'Single module cannot exceed 60 points'),
  difficulty: z.enum(['intro', 'core', 'apply', 'challenge']).optional()
});

// Assessment plan response schema
const assessmentPlanSchema = z.object({
  topic: z.string()
    .min(1, 'Topic is required')
    .max(60, 'Topic too long')
    .refine(topic => !/```|`|#|\*|_/.test(topic), 'Topic cannot contain markdown or code fences')
    .refine(topic => !/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(topic), 'Topic cannot contain emojis'),
  chatTitle: z.string()
    .min(1, 'Chat title is required')
    .max(40, 'Chat title too long')
    .refine(title => !/```|`|#|\*|_/.test(title), 'Chat title cannot contain markdown or code fences')
    .refine(title => !/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(title), 'Chat title cannot contain emojis'),
  rationale: z.string()
    .min(1, 'Rationale is required')
    .max(500, 'Rationale too long'),
  plan: z.array(moduleSchema)
    .min(2, 'Plan must have at least 2 modules')
    .max(8, 'Plan cannot have more than 8 modules')
    .refine(modules => {
      const points = modules.reduce((sum, module) => sum + module.points, 0);
      return points === 100;
    }, 'Total points must equal exactly 100')
    .refine(modules => {
      const titles = modules.map(m => m.title.toLowerCase());
      return new Set(titles).size === titles.length;
    }, 'Module titles must be unique')
    .refine(modules => {
      const ids = modules.map(m => parseInt(m.moduleId));
      const expectedIds = Array.from({length: modules.length}, (_, i) => i + 1);
      return JSON.stringify(ids.sort()) === JSON.stringify(expectedIds);
    }, 'Module IDs must be sequential starting from 1')
    .refine(modules => {
      const ids = modules.map(m => parseInt(m.moduleId));
      const sortedIds = ids.sort((a, b) => a - b);
      // Check for contiguous sequence starting from 1
      for (let i = 0; i < sortedIds.length; i++) {
        if (sortedIds[i] !== i + 1) {
          return false;
        }
      }
      return true;
    }, 'Module IDs must be contiguous sequence starting from 1'),
  nextPhase: z.literal('planning')
});

// Clarify response schema
const clarifySchema = z.object({
  clarify: z.literal(true),
  questions: z.array(z.string().min(1).max(200))
    .min(1, 'At least one clarifying question required')
    .max(2, 'Maximum 2 clarifying questions allowed')
});

// Combined assessment response schema
const assessmentResponseSchema = z.union([assessmentPlanSchema, clarifySchema]);

module.exports = {
  assessmentRequestSchema,
  assessmentPlanSchema,
  clarifySchema,
  assessmentResponseSchema,
  moduleSchema
};
