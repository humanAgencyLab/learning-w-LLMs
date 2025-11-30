const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Environment-driven rate limits with defaults
// Higher limits for development, lower for production
const isDevelopment = process.env.NODE_ENV !== 'production';
const RATE_LIMITS = {
  assessment: parseInt(process.env.RL_ASSESSMENT) || (isDevelopment ? 30 : 5), // per minute
  chat: parseInt(process.env.RL_CHAT) || (isDevelopment ? 60 : 12), // per minute
  quizStart: parseInt(process.env.RL_QUIZ_START) || (isDevelopment ? 30 : 6), // per minute
  quizSubmit: parseInt(process.env.RL_QUIZ_SUBMIT) || (isDevelopment ? 30 : 8), // per minute
  general: parseInt(process.env.RL_GENERAL) || (isDevelopment ? 100 : 30), // per minute
  auth: parseInt(process.env.RL_AUTH) || (isDevelopment ? 50 : 20) // per minute for auth endpoints
};

// Store for tracking requests (in production, use Redis)
const requestCounts = new Map();

/**
 * Create a rate limiter with custom configuration
 */
function createRateLimiter(options) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: options.max,
    message: {
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a bit.',
      retryAfterSec: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      
      logger.warn({
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        retryAfter
      }, 'Rate limit exceeded');

      res.set('Retry-After', retryAfter.toString());
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many requests',
        message: `Too many requests. Please wait ${retryAfter} seconds before trying again.`
      });
    },
    skip: (req) => {
      // Skip rate limiting in test environment unless explicitly testing it
      // Rate limiting tests disable this skip
      return process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_ENABLED;
    }
  });
}

// Create specific rate limiters for each endpoint
const assessmentLimiter = createRateLimiter({
  max: RATE_LIMITS.assessment,
  windowMs: 60 * 1000
});

const chatLimiter = createRateLimiter({
  max: RATE_LIMITS.chat,
  windowMs: 60 * 1000
});

const quizStartLimiter = createRateLimiter({
  max: RATE_LIMITS.quizStart,
  windowMs: 60 * 1000
});

const quizSubmitLimiter = createRateLimiter({
  max: RATE_LIMITS.quizSubmit,
  windowMs: 60 * 1000
});

const generalLimiter = createRateLimiter({
  max: RATE_LIMITS.general,
  windowMs: 60 * 1000
});

const authLimiter = createRateLimiter({
  max: RATE_LIMITS.auth,
  windowMs: 60 * 1000
});

/**
 * Middleware to apply rate limiting based on route
 */
const applyRateLimit = (req, res, next) => {
  const path = req.path;
  
  // Auth endpoints get higher limits (login, signup, refresh, etc.)
  if (path.includes('/v1/auth')) {
    return authLimiter(req, res, next);
  } else if (path.includes('/v1/assessment')) {
    return assessmentLimiter(req, res, next);
  } else if (path.includes('/v1/chat')) {
    return chatLimiter(req, res, next);
  } else if (path.includes('/v1/quiz/start')) {
    return quizStartLimiter(req, res, next);
  } else if (path.includes('/v1/quiz/submit')) {
    return quizSubmitLimiter(req, res, next);
  } else {
    return generalLimiter(req, res, next);
  }
};

/**
 * Middleware to track rate limit metrics
 */
const trackRateLimitMetrics = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Track metrics
    if (res.statusCode === 429) {
      logger.info({
        requestId: req.requestId,
        route: req.path,
        ip: req.ip,
        rateLimited: true
      }, 'Rate limit metrics');
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  applyRateLimit,
  trackRateLimitMetrics,
  assessmentLimiter,
  chatLimiter,
  quizStartLimiter,
  quizSubmitLimiter,
  generalLimiter,
  authLimiter,
  RATE_LIMITS
};