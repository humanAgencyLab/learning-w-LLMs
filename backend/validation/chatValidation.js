const { z } = require('zod');

// Chat request schema
const chatRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  userMessage: z.string()
    .min(1, 'User message is required')
    .max(1000, 'User message too long')
    .transform(msg => msg.replace(/<[^>]*>/g, '')), // Strip HTML
});

// Chat response schema
const chatResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    message: z.string(),
    nextAction: z.enum(['START_QUIZ', 'CONTINUE_LEARNING']).optional(),
    moduleId: z.string().optional(),
    tokensIn: z.number().optional(),
    tokensOut: z.number().optional(),
    hadCheckInReply: z.boolean(),
    followedUpOutstanding: z.boolean()
  }).optional(),
  error: z.string().optional()
});

module.exports = {
  chatRequestSchema,
  chatResponseSchema
};

