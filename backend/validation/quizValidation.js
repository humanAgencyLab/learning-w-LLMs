const { z } = require('zod');

// Quiz start request schema
const quizStartRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  moduleId: z.string().min(1, 'Module ID is required').optional()
});

// Quiz submit request schema
const quizSubmitRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  moduleId: z.string().min(1, 'Module ID is required').optional(), // Optional for revision quizzes
  answers: z.array(z.object({
    id: z.string().min(1, 'Answer ID is required'),
    userIndex: z.number().int('User index must be integer').min(0).max(3, 'User index must be 0-3')
  })).min(1, 'At least one answer is required')
});

// Quiz item schema
const quizItemSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  text: z.string().min(1, 'Question text is required'),
  options: z.array(z.string().min(1, 'Option text is required'))
    .length(4, 'Must have exactly 4 options'),
  correctIndex: z.number().int('Correct index must be integer').min(0).max(3, 'Correct index must be 0-3'),
  explanation: z.string().min(10, 'Explanation must be at least 10 characters').optional() // Explanation for why the correct answer is correct
});

// Quiz generation response schema
const quizGenerationSchema = z.object({
  questions: z.array(quizItemSchema)
    .min(3, 'Must have at least 3 questions')
    .max(5, 'Must have at most 5 questions')
    .refine(questions => {
      // Ensure all question IDs are unique
      const ids = questions.map(q => q.id);
      return new Set(ids).size === ids.length;
    }, 'Question IDs must be unique')
    .refine(questions => {
      // Ensure all options are distinct within each question
      return questions.every(q => new Set(q.options).size === q.options.length);
    }, 'Options within each question must be distinct')
    .refine(questions => {
      // Reject forbidden options
      const forbiddenPatterns = ['all of the above', 'none of the above'];
      return !questions.some(q => 
        q.options.some(opt => 
          forbiddenPatterns.some(pattern => 
            opt.toLowerCase().includes(pattern)
          )
        )
      );
    }, 'Questions cannot contain "All of the above" or "None of the above" options')
});

// Quiz submit response schema
const quizSubmitResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    passed: z.boolean(),
    scorePct: z.number().min(0).max(100),
    pointsEarned: z.number().min(0),
    feedbackMarkdown: z.string()
  }).optional(),
  error: z.string().optional()
});

module.exports = {
  quizStartRequestSchema,
  quizSubmitRequestSchema,
  quizItemSchema,
  quizGenerationSchema,
  quizSubmitResponseSchema
};

