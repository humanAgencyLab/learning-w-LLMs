const express = require('express');
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const { z } = require('zod');
const Session = require('../models/Session');
const User = require('../models/User');
const { createSessionSchema, resumeSessionSchema } = require('../validation/sessionValidation');
const { requireAuth, requireOwnership } = require('../middleware/auth');

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
  req.logger = logger.child({ requestId: req.requestId });
  next();
};

/**
 * Convert user profile to session profile format
 * Must match Session model's profile schema requirements
 */
function userProfileToSessionProfile(user) {
  // Handle case where user.profile might be null or undefined
  const profile = user.profile || {};
  
  return {
    source: 'user',
    name: user.name || 'User',
    background: profile.background || 'Student learning with AI assistance', // Required field
    goals: Array.isArray(profile.goals) ? profile.goals : [],
    strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
    gaps: Array.isArray(profile.gaps) ? profile.gaps : [],
    timePerDayMins: profile.timePerDayMins || 30,
    preferredStyle: profile.preferredStyle || 'mixed',
    lastUpdated: new Date().toISOString(),
    skillLevel: profile.skillLevel || 'Beginner',
    learningType: profile.learningType || 'Visual', // Must be one of: Visual, Auditory, Reading/Writing, Kinesthetic
    major: profile.major && ['Computer Science', 'Mathematics', 'Data Science', 'Engineering', 'Other'].includes(profile.major) 
      ? profile.major 
      : 'Other', // Must be valid enum value, not empty string
    currentCourses: Array.isArray(profile.currentCourses) ? profile.currentCourses : [],
    daysPerWeek: profile.daysPerWeek || 3,
    minutesPerSession: profile.minutesPerSession || 30,
    recentTopics: Array.isArray(profile.recentTopics) ? profile.recentTopics : [],
    selfRating: profile.selfRating && ['None', 'Basic', 'Intermediate', 'Advanced'].includes(profile.selfRating)
      ? profile.selfRating
      : 'Basic', // Must be valid enum value, not empty string
    primaryGoal: profile.primaryGoal && ['Master Basics', 'Exam Prep', 'Revise Gaps', 'Project Help', 'Interview Prep'].includes(profile.primaryGoal)
      ? profile.primaryGoal
      : 'Master Basics', // Must be valid enum value, not empty string
    defaultMode: profile.defaultMode && ['Studying', 'Revision'].includes(profile.defaultMode)
      ? profile.defaultMode
      : 'Studying', // Must be valid enum value
    explanationLength: profile.explanationLength && ['Concise', 'Balanced', 'Detailed'].includes(profile.explanationLength)
      ? profile.explanationLength
      : 'Balanced', // Must be valid enum value
    examplesPreference: profile.examplesPreference && ['Few', 'Many'].includes(profile.examplesPreference)
      ? profile.examplesPreference
      : 'Many', // Must be valid enum value
    language: profile.language || 'English',
    codeLanguagePreference: profile.codeLanguagePreference && ['Python', 'JavaScript', 'C++', 'None'].includes(profile.codeLanguagePreference)
      ? profile.codeLanguagePreference
      : 'None' // Must be valid enum value
  };
}

// GET /v1/sessions - List all sessions for authenticated user
// Only returns sessions that have a plan and chatTitle (saved chats)
router.get('/v1/sessions', requireAuth, addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status; // Filter by phase
    
    req.logger.info('Fetching user sessions', { 
      userId: req.userId,
      limit,
      offset,
      status 
    });
    
    // Build query - only sessions with plan and chatTitle (saved chats)
    const query = { 
      userId: req.userId,
      chatTitle: { $ne: '', $exists: true }, // Must have a chat title
      'plan.0': { $exists: true } // Must have at least one module in plan
    };
    
    if (status) {
      if (status === 'completed') {
        query.phase = 'completed';
      } else if (status === 'in_progress') {
        query.phase = { $ne: 'completed' };
      } else {
        query.phase = status;
      }
    }
    
    // Fetch sessions
    const sessions = await Session.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .select('phase topic chatTitle points gems progressPct createdAt updatedAt plan');
    
    const total = await Session.countDocuments(query);
    
    req.logger.info('Sessions fetched successfully', { 
      userId: req.userId,
      count: sessions.length,
      total,
      duration: Date.now() - startTime 
    });
    
    res.json({
      success: true,
      data: {
        sessions: sessions.map(session => ({
          id: session._id,
          topic: session.topic,
          chatTitle: session.chatTitle,
          phase: session.phase,
          progressPct: session.progressPct,
          points: session.points,
          gems: session.gems,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        })),
        total,
        limit,
        offset
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to fetch sessions', { 
      userId: req.userId,
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

// POST /v1/sessions - Create new session (requires authentication)
router.post('/v1/sessions', requireAuth, addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    req.logger.info('Creating new session', { body: req.body });
    
    // Validate request body
    const validatedData = createSessionSchema.parse(req.body);
    
    // Get user profile from authenticated user
    const user = await User.findById(req.userId).select('+passwordHash'); // Include all fields
    if (!user) {
      req.logger.warn('User not found for session creation', { userId: req.userId });
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Convert user profile to session profile format
    const profile = validatedData.profile || userProfileToSessionProfile(user);
    
    // Create new session with defaults
    // Note: Session is created but won't appear in chat history until plan is generated and chatTitle is set
    const sessionData = {
      phase: validatedData.phase || 'pre',
      mode: validatedData.mode || 'studying',
      topic: validatedData.topic || '',
      chatTitle: validatedData.chatTitle || '', // Empty until plan is generated
      plan: [], // Will be populated later when assessment completes
      activeModuleId: null,
      points: 0,
      gems: 0,
      isViewOnly: false,
      progressPct: 0,
      messages: [],
      profile: profile,
      quizAttempts: [],
      userId: new mongoose.Types.ObjectId(req.userId) // Convert to ObjectId
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
      userId: req.userId,
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
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /v1/sessions/:id - Full fetch of session (requires authentication and ownership)
router.get('/v1/sessions/:id', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
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
        planApproved: session.planApproved,
        activeModuleId: session.activeModuleId,
        points: session.points,
        gems: session.gems,
        isViewOnly: session.isViewOnly,
        progressPct: session.progressPct,
        messages: session.messages,
        profile: session.profile,
        quizAttempts: session.quizAttempts,
        userId: session.userId,
        meta: session.meta,
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

// POST /v1/sessions/:id/resume - Minimal hydrate payload (requires authentication and ownership)
router.post('/v1/sessions/:id/resume', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
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