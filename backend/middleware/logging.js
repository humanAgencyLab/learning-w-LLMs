const logger = require('../utils/logger');

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  // req.requestId is guaranteed to be set by app.js middleware before this runs
  const requestId = req.requestId;
  
  // Attach logger to request object (requestId already set)
  req.logger = logger;
  
  // Log request start
  logger.info({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  }, 'Request started');

  // Override res.json to capture response data
  const originalJson = res.json;
  res.json = function(data) {
    const latencyMs = Date.now() - startTime;
    
    // Log request completion
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs,
      success: res.statusCode < 400,
      userId: req.user?.id, // Future auth
      sessionId: req.session?._id,
      phaseBefore: req.session?.phase,
      phaseAfter: data?.phase || req.session?.phase,
      tokensIn: data?.tokensIn,
      tokensOut: data?.tokensOut,
      retries: data?.retries
    }, 'Request completed');

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Error logging middleware
 */
const errorLogger = (err, req, res, next) => {
  const requestId = req.requestId;
  
  // Log error details
  logger.error({
    requestId,
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    error: err.message,
    code: err.code,
    stack: err.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
    userId: req.user?.id,
    sessionId: req.session?._id,
    body: sanitizeRequestBody(req.body)
  }, 'Request error');

  next(err);
};

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'apiKey', 'token', 'secret'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  // Truncate long strings
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
      sanitized[key] = sanitized[key].substring(0, 1000) + '...[TRUNCATED]';
    }
  });
  
  return sanitized;
}

/**
 * Metrics tracking middleware
 */
const metricsTracker = (req, res, next) => {
  const startTime = Date.now();
  
  // Track request metrics
  const originalSend = res.send;
  res.send = function(data) {
    const latencyMs = Date.now() - startTime;
    
    // Track different types of requests
    if (req.path.includes('/v1/chat')) {
      logger.info({
        requestId: req.requestId,
        metric: 'chat_requests_total',
        latencyMs,
        success: res.statusCode < 400
      }, 'Chat request metric');
    } else if (req.path.includes('/v1/quiz/start')) {
      logger.info({
        requestId: req.requestId,
        metric: 'quiz_start_total',
        latencyMs,
        success: res.statusCode < 400
      }, 'Quiz start metric');
    } else if (req.path.includes('/v1/quiz/submit')) {
      logger.info({
        requestId: req.requestId,
        metric: 'quiz_submit_total',
        latencyMs,
        success: res.statusCode < 400
      }, 'Quiz submit metric');
    } else if (req.path.includes('/v1/assessment')) {
      logger.info({
        requestId: req.requestId,
        metric: 'assessment_requests_total',
        latencyMs,
        success: res.statusCode < 400
      }, 'Assessment request metric');
    }
    
    // Track rate limiting
    if (res.statusCode === 429) {
      logger.info({
        requestId: req.requestId,
        metric: 'rate_limited_total',
        path: req.path
      }, 'Rate limit metric');
    }
    
    // Track LLM tokens if present
    if (data && typeof data === 'object') {
      if (data.tokensIn) {
        logger.info({
          requestId: req.requestId,
          metric: 'llm_tokens_in_total',
          tokens: data.tokensIn
        }, 'LLM tokens in metric');
      }
      
      if (data.tokensOut) {
        logger.info({
          requestId: req.requestId,
          metric: 'llm_tokens_out_total',
          tokens: data.tokensOut
        }, 'LLM tokens out metric');
      }
      
      if (data.retries) {
        logger.info({
          requestId: req.requestId,
          metric: 'json_retry_total',
          retries: data.retries
        }, 'JSON retry metric');
      }
      
      if (data.summarized) {
        logger.info({
          requestId: req.requestId,
          metric: 'summaries_total',
          path: req.path
        }, 'Context summary metric');
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add CORS headers for development
  if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  next();
};

/**
 * Request ID generator
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

module.exports = {
  requestLogger,
  errorLogger,
  metricsTracker,
  securityHeaders,
  generateRequestId,
  sanitizeRequestBody
};
