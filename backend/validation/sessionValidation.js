const { z } = require('zod');

// Validation schema for profile (strict validation when provided)
const profileSchema = z.object({
  source: z.enum(['dummy', 'user']).default('dummy'),
  name: z.string().min(1).max(100),
  background: z.string().min(1).max(500),
  goals: z.array(z.string().min(1).max(200)).min(1),
  strengths: z.array(z.string().min(1).max(200)).min(1),
  gaps: z.array(z.string().min(1).max(200)).min(1),
  timePerDayMins: z.number().min(10).max(480),
  preferredStyle: z.enum(['examples-first', 'theory-first', 'mixed']).default('examples-first'),
  lastUpdated: z.string().datetime().optional()
});

// Validation schema for profile (optional validation for session creation)
const optionalProfileSchema = profileSchema.optional();

// Validation schema for creating a new session
const createSessionSchema = z.object({
  topic: z.string().min(1).max(200).optional().default('General Learning'),
  chatTitle: z.string().max(200).optional().default(''),
  phase: z.enum(['pre', 'planning', 'learning', 'quiz', 'feedback', 'completed']).optional().default('pre'),
  mode: z.enum(['studying', 'reviewing', 'testing']).optional().default('studying'),
  profile: optionalProfileSchema, // Will be injected if not provided
  userId: z.string().nullable().optional().default(null)
});

// Validation schema for session resume
const resumeSessionSchema = z.object({
  // No body validation needed for resume - it's just a GET-like operation
});

// Validation schema for message objects
const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  timestamp: z.date().optional().default(() => new Date()),
  metadata: z.any().optional()
});

// Validation schema for plan modules
const planModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(['locked', 'in_progress', 'complete']).default('locked'),
  milestones: z.array(z.string()).default([]),
  completedMilestones: z.array(z.number()).default([])
});

// Validation schema for quiz attempts
const quizAttemptSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  questions: z.array(z.object({
    id: z.string().min(1),
    question: z.string().min(1),
    answer: z.string().min(1),
    isCorrect: z.boolean()
  })),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  completedAt: z.date().default(() => new Date())
});

// Validation schema for profile updates
const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  background: z.string().min(1).max(500).optional(),
  goals: z.array(z.string().min(1).max(200)).min(1).optional(),
  strengths: z.array(z.string().min(1).max(200)).min(1).optional(),
  gaps: z.array(z.string().min(1).max(200)).min(1).optional(),
  timePerDayMins: z.number().min(10).max(480).optional(),
  preferredStyle: z.enum(['examples-first', 'theory-first', 'mixed']).optional()
});

module.exports = {
  createSessionSchema,
  resumeSessionSchema,
  messageSchema,
  planModuleSchema,
  quizAttemptSchema,
  profileUpdateSchema,
  profileSchema
};
