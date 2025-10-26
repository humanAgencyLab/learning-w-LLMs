const express = require('express');
const router = express.Router();
const pino = require('pino');
const { z } = require('zod');
const Session = require('../models/Session');
const { createSessionSchema, resumeSessionSchema } = require('../validation/sessionValidation');

// Initialize Pino logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Middleware to add request ID to logger
const addRequestId = (req, res, next) => {
  req.logger = logger.child({ requestId: req.id });
  next();
};

// Default dummy profile for new sessions (Phase 2)
const getDummyProfile = () => ({
  source: 'dummy',
  name: 'Alex',
  background: '2nd-year CS undergrad',
  goals: ['Pass Algorithms midterm', 'Understand graph traversal well enough to explain it'],
  strengths: ['arrays', 'big-O basics', 'sorting fundamentals'],
  gaps: ['graph traversal', 'BFS vs DFS tradeoffs', 'recurrence intuition'],
  timePerDayMins: 30,
  preferredStyle: 'examples-first',
  lastUpdated: new Date().toISOString()
});

// POST /v1/sessions - Create new session
router.post('/v1/sessions', addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    req.logger.info('Creating new session', { body: req.body });
    
    // Validate request body
    const validatedData = createSessionSchema.parse(req.body);
    
    // Always inject dummy profile if none provided (Phase 2 requirement)
    let profile = validatedData.profile || getDummyProfile();
    
    // Ensure profile has required fields and is not empty/placeholder
    if (!profile.name || profile.name.trim() === '' || profile.name.toLowerCase().includes('anonymous')) {
      req.logger.warn('Empty or placeholder profile provided, injecting dummy profile');
      profile = getDummyProfile();
    }
    
    // Create new session with defaults
    const sessionData = {
      phase: validatedData.phase,
      mode: validatedData.mode,
      topic: validatedData.topic,
      chatTitle: validatedData.chatTitle,
      plan: [], // Will be populated later
      activeModuleId: null,
      points: 0,
      gems: 0,
      isViewOnly: false,
      progressPct: 0,
      messages: [],
      profile: profile,
      quizAttempts: [],
      userId: validatedData.userId
    };
    
    const session = new Session(sessionData);
    await session.save();
    
    req.logger.info('Session created successfully', { 
      sessionId: session._id,
      duration: Date.now() - startTime 
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: session._id,
        phase: session.phase,
        mode: session.mode,
        topic: session.topic,
        chatTitle: session.chatTitle,
        plan: session.plan,
        activeModuleId: session.activeModuleId,
        points: session.points,
        gems: session.gems,
        isViewOnly: session.isViewOnly,
        progressPct: session.progressPct,
        profile: session.profile,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to create session', { 
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime 
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /v1/sessions/:id - Full fetch of session
router.get('/v1/sessions/:id', addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    
    req.logger.info('Fetching session', { sessionId: id });
    
    // Validate session ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      req.logger.warn('Invalid session ID format', { sessionId: id });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    const session = await Session.findById(id);
    
    if (!session) {
      req.logger.warn('Session not found', { sessionId: id });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    req.logger.info('Session fetched successfully', { 
      sessionId: id,
      duration: Date.now() - startTime 
    });
    
    res.json({
      success: true,
      data: {
        id: session._id,
        phase: session.phase,
        mode: session.mode,
        topic: session.topic,
        chatTitle: session.chatTitle,
        plan: session.plan,
        activeModuleId: session.activeModuleId,
        points: session.points,
        gems: session.gems,
        isViewOnly: session.isViewOnly,
        progressPct: session.progressPct,
        messages: session.messages,
        profile: session.profile,
        quizAttempts: session.quizAttempts,
        userId: session.userId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to fetch session', { 
      sessionId: req.params.id,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime 
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /v1/sessions/:id/resume - Minimal hydrate payload
router.post('/v1/sessions/:id/resume', addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    
    req.logger.info('Resuming session', { sessionId: id });
    
    // Validate session ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      req.logger.warn('Invalid session ID format', { sessionId: id });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    const session = await Session.findById(id);
    
    if (!session) {
      req.logger.warn('Session not found for resume', { sessionId: id });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    // Get last 20 messages for minimal hydrate
    const lastMessages = session.messages.slice(-20);
    
    req.logger.info('Session resumed successfully', { 
      sessionId: id,
      messageCount: lastMessages.length,
      duration: Date.now() - startTime 
    });
    
    res.json({
      success: true,
      data: {
        phase: session.phase,
        mode: session.mode,
        topic: session.topic,
        chatTitle: session.chatTitle,
        plan: session.plan,
        activeModuleId: session.activeModuleId,
        points: session.points,
        gems: session.gems,
        isViewOnly: session.isViewOnly,
        progressPct: session.progressPct,
        lastMessages: lastMessages,
        profile: session.profile
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to resume session', { 
      sessionId: req.params.id,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime 
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;