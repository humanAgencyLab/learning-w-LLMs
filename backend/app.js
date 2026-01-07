require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Groq = require('groq-sdk');
const helmet = require('helmet');
// Rate limiting is handled by the new rateLimiter middleware
const morgan = require('morgan');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const Session = require('./models/Session');
// StudySession and ChatLog are still imported in server.js for index creation

// Import new session routes
const sessionRoutes = require('./routes/sessionRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const quizRoutes = require('./routes/quizRoutes');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const path = require('path');

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

// CORS configuration (must be before helmet for proper handling)
const corsOrigins = process.env.CORS_ORIGINS ? 
  process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) : 
  ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Security middleware (after CORS to avoid conflicts)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting is handled by the new rateLimiter middleware

// Body parsing with size limit
app.use(express.json({ limit: '1mb', strict: false, type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files for avatar uploads
const { AVATAR_UPLOAD_DIR } = require('./utils/fileUpload');
app.use('/uploads/avatars', express.static(path.resolve(AVATAR_UPLOAD_DIR)));

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

// Mount routes
app.use('/v1/auth', authRoutes);
// Log registered auth routes in production for debugging
if (process.env.NODE_ENV === 'production') {
  console.log('🔍 Checking auth routes in production...');
  authRoutes.stack.forEach((layer, idx) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      console.log(`  Route ${idx}: ${methods} /v1/auth${layer.route.path}`);
    }
  });
  console.log(`✅ Total auth routes registered: ${authRoutes.stack.filter(l => l.route).length}`);
}
app.use('/v1/profile', profileRoutes);
app.use('/', performanceRoutes);
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
