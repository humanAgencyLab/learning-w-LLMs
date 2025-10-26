const { z } = require('zod');
const logger = require('../utils/logger');

/**
 * HTML sanitization utility
 */
function sanitizeHtml(input) {
  if (typeof input !== 'string') return input;
  
  // Decode entities first, then remove HTML tags
  let cleaned = input
    .replace(/&amp;/g, '&')   // Decode &amp; first (order matters)
    .replace(/&lt;/g, '<')    // Decode &lt;
    .replace(/&gt;/g, '>')    // Decode &gt;
    .replace(/&quot;/g, '"')  // Decode &quot;
    .replace(/&#x27;/g, "'")  // Decode &#x27;
    .replace(/&#39;/g, "'")   // Decode &#39;
    .replace(/&#x2F;/g, '/')  // Decode &#x2F;
    .replace(/&nbsp;/g, ' ')  // Decode &nbsp;
    .replace(/<[^>]*>/g, '')  // Remove HTML tags
    .trim()
    .replace(/\s+/g, ' ')     // Collapse repeated spaces to single space
    .trim();
  
  return cleaned;
}

/**
 * Global input validation middleware
 */
const validateInput = (req, res, next) => {
  try {
    // Sanitize userMessage if present
    if (req.body.userMessage) {
      req.body.userMessage = sanitizeHtml(req.body.userMessage);
    }

    // Validate userMessage length
    if (req.body.userMessage) {
      if (req.body.userMessage.length < 1) {
        return res.status(400).json({
          success: false,
          error: 'User message is required',
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            userMessage: 'Message cannot be empty'
          }
        });
      }

      if (req.body.userMessage.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'User message too long',
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            userMessage: 'Message must be 1000 characters or less'
          }
        });
      }
    }

    // Validate sessionId if present
    if (req.body.sessionId) {
      if (typeof req.body.sessionId !== 'string' || req.body.sessionId.length < 1) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID',
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            sessionId: 'Session ID must be a non-empty string'
          }
        });
      }
    }

    next();
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      body: req.body
    }, 'Input validation error');

    res.status(400).json({
      success: false,
      error: 'Invalid input',
      code: 'VALIDATION_ERROR',
      fieldErrors: {
        general: 'Input validation failed'
      }
    });
  }
};

/**
 * Quiz route validation middleware
 */
const validateQuizRoutes = async (req, res, next) => {
  try {
    const { sessionId, moduleId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
        code: 'VALIDATION_ERROR',
        fieldErrors: {
          sessionId: 'Session ID is required'
        }
      });
    }

    // Load session to validate moduleId
    const Session = require('../models/Session');
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        code: 'NOT_FOUND'
      });
    }

    // Validate moduleId exists in session plan
    if (moduleId) {
      const moduleExists = session.plan.some(module => module.id === moduleId);
      if (!moduleExists) {
        return res.status(404).json({
          success: false,
          error: 'Module not found in session plan',
          code: 'NOT_FOUND',
          fieldErrors: {
            moduleId: 'Module not found in session plan'
          }
        });
      }
    }

    // Attach session to request for use in route handlers
    req.session = session;
    next();
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      body: req.body
    }, 'Quiz route validation error');

    res.status(500).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR'
    });
  }
};

/**
 * Assessment output validation schema
 */
const assessmentOutputSchema = z.object({
  topic: z.string().min(1).max(60),
  chatTitle: z.string().min(1).max(40),
  plan: z.array(z.object({
    moduleId: z.string().regex(/^\d+$/), // Sequential numbers as strings
    title: z.string().min(1).max(50),
    points: z.number().int().min(1).max(60),
    difficulty: z.enum(['intro', 'core', 'apply', 'challenge']).optional()
  })).min(2).max(8),
  nextPhase: z.literal('learning')
}).refine(
  (data) => {
    // Validate points sum to 100
    const totalPoints = data.plan.reduce((sum, module) => sum + module.points, 0);
    return totalPoints === 100;
  },
  {
    message: 'Plan points must sum to exactly 100',
    path: ['plan']
  }
).refine(
  (data) => {
    // Validate unique titles
    const titles = data.plan.map(module => module.title);
    return new Set(titles).size === titles.length;
  },
  {
    message: 'Module titles must be unique',
    path: ['plan']
  }
).refine(
  (data) => {
    // Validate sequential module IDs
    const ids = data.plan.map(module => parseInt(module.moduleId));
    const expectedIds = Array.from({ length: ids.length }, (_, i) => i + 1);
    return JSON.stringify(ids.sort()) === JSON.stringify(expectedIds);
  },
  {
    message: 'Module IDs must be sequential starting from 1',
    path: ['plan']
  }
);

/**
 * Quiz generation validation schema
 */
const quizGenerationSchema = z.object({
  questions: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3)
  })).min(3).max(5)
}).refine(
  (data) => {
    // Validate no "All of the above" or "None of the above" options
    const hasForbiddenOptions = data.questions.some(question => 
      question.options.some(option => 
        option.toLowerCase().includes('all of the above') ||
        option.toLowerCase().includes('none of the above')
      )
    );
    return !hasForbiddenOptions;
  },
  {
    message: 'Questions cannot contain "All of the above" or "None of the above" options',
    path: ['questions']
  }
);

/**
 * Validate assessment output
 */
const validateAssessmentOutput = (data) => {
  try {
    return assessmentOutputSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        fieldErrors[path] = err.message;
      });
      
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Assessment output validation failed',
        fieldErrors
      };
    }
    throw error;
  }
};

/**
 * Validate quiz generation output
 */
const validateQuizGeneration = (data) => {
  try {
    return quizGenerationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        fieldErrors[path] = err.message;
      });
      
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Quiz generation validation failed',
        fieldErrors
      };
    }
    throw error;
  }
};

/**
 * Error response helper
 */
const createErrorResponse = (code, message, fieldErrors = null, statusCode = 400) => {
  const response = {
    success: false,
    error: message,
    code
  };
  
  if (fieldErrors) {
    response.fieldErrors = fieldErrors;
  }
  
  return { statusCode, response };
};

/**
 * Common error responses
 */
const ERROR_RESPONSES = {
  VALIDATION_ERROR: (fieldErrors) => createErrorResponse('VALIDATION_ERROR', 'Validation failed', fieldErrors, 400),
  AUTH_REQUIRED: () => createErrorResponse('AUTH_REQUIRED', 'Authentication required', null, 401),
  NOT_FOUND: (resource = 'Resource') => createErrorResponse('NOT_FOUND', `${resource} not found`, null, 404),
  ILLEGAL_PHASE: (currentPhase, requiredPhase) => createErrorResponse('ILLEGAL_PHASE', `Cannot perform action in ${currentPhase} phase. Required: ${requiredPhase}`, null, 409),
  RATE_LIMITED: (retryAfter) => createErrorResponse('RATE_LIMITED', 'Too many requests. Please wait a bit.', null, 429),
  LLM_PROVIDER_ERROR: (details) => createErrorResponse('LLM_PROVIDER_ERROR', 'Language model provider error', null, 502),
  ASSESSMENT_JSON_INVALID: () => createErrorResponse('ASSESSMENT_JSON_INVALID', 'Assessment response format invalid', null, 502),
  CONTEXT_LIMIT: () => createErrorResponse('CONTEXT_LIMIT', 'Context limit exceeded. Try shorter messages or start a new session.', null, 507)
};

module.exports = {
  validateInput,
  validateQuizRoutes,
  validateAssessmentOutput,
  validateQuizGeneration,
  sanitizeHtml,
  ERROR_RESPONSES,
  assessmentOutputSchema,
  quizGenerationSchema
};

