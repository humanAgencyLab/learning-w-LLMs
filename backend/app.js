require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Groq = require('groq-sdk');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');
const helmet = require('helmet');
// Rate limiting is handled by the new rateLimiter middleware
const morgan = require('morgan');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const StudySession = require('./models/StudySession');
const ChatLog = require('./models/ChatLog');
const QuizAttempt = require('./models/QuizAttempt');
const Quiz = require('./models/Quiz');
const Session = require('./models/Session');
const { srlSystemPrompt } = require('./prompts/systemPrompt');
const { generateQuiz } = require('./prompts/quizGenerator');

// Import new session routes
const sessionRoutes = require('./routes/sessionRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const quizRoutes = require('./routes/quizRoutes');
const healthRoutes = require('./routes/healthRoutes');

// Import middleware
const { requestLogger, errorLogger, metricsTracker, securityHeaders } = require('./middleware/logging');
const { applyRateLimit, trackRateLimitMetrics } = require('./middleware/rateLimiter');

const app = express();
// Trust first proxy (React dev server / reverse proxies) so rate limiting has correct IPs
const trustProxy = parseInt(process.env.TRUST_PROXY || '1', 10);
app.set('trust proxy', trustProxy);
const PORT = process.env.PORT || 5001;

// Logger configuration
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Security middleware
app.use(helmet());

// Rate limiting is handled by the new rateLimiter middleware

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS ? 
  process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) : 
  ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Body parsing with size limit
app.use(express.json({ limit: '1mb', strict: false, type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID middleware - Single source of truth for request IDs
// Sets both req.requestId (used throughout codebase) and X-Request-Id header
app.use((req, res, next) => {
  // Use UUID v4 for consistent, standard request IDs
  req.requestId = uuidv4();
  // Also set req.id for backward compatibility (will be removed in future)
  req.id = req.requestId;
  // Set HTTP response header for client tracking
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// Security headers
app.use(securityHeaders);

// Request logging
app.use(requestLogger);

// Metrics tracking
app.use(metricsTracker);

// Rate limiting (after body parsing, before validation and routes)
app.use(applyRateLimit);
app.use(trackRateLimitMetrics);

// Input validation and sanitization (after rate limiting, before routes)
const { validateInput } = require('./middleware/validationHardening');
app.use(validateInput);

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
} else {
  app.use(morgan('dev'));
}

// Mount session routes
app.use('/', sessionRoutes);
app.use('/', assessmentRoutes);
app.use('/', chatRoutes);
app.use('/', quizRoutes);
app.use('/', healthRoutes);

// Legacy health endpoint for backward compatibility
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Error handling middleware
app.use(errorLogger);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND'
  });
});

module.exports = app;
