const express = require('express');
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const { z } = require('zod');
const Session = require('../models/Session');
const User = require('../models/User');
const { createSessionSchema, resumeSessionSchema } = require('../validation/sessionValidation');
const { requireAuth, requireOwnership } = require('../middleware/auth');

// Initialize Pino logger (no transport in production - pino-pretty is dev-only)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
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
    
    // Build query - only sessions with chatTitle (saved chats)
    // For study sessions: must have a plan
    // For revision sessions: may not have a plan (they're just quizzes)
    const query = { 
      userId: req.userId,
      chatTitle: { $ne: '', $exists: true }, // Must have a chat title
      $or: [
        { 'plan.0': { $exists: true } }, // Study sessions must have a plan
        { mode: 'reviewing' } // Revision sessions don't need a plan
      ]
    };
    
    // Filter by favorites if requested
    if (req.query.favorites === 'true') {
      query.isFavorite = true;
    }
    
    // Search functionality
    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      if (searchTerm) {
        query.$or = [
          { topic: { $regex: searchTerm, $options: 'i' } },
          { chatTitle: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }
    
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
      .select('phase mode topic chatTitle points gems progressPct isFavorite createdAt updatedAt plan');
    
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
          mode: session.mode,
          topic: session.topic,
          chatTitle: session.chatTitle,
          phase: session.phase,
          progressPct: session.progressPct,
          points: session.points,
          gems: session.gems,
          isFavorite: session.isFavorite || false,
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

/**
 * POST /v1/sessions/:id/summarize
 * Generate a summary of the completed learning session
 * NOTE: This route must be defined BEFORE /v1/sessions/:id to ensure proper matching
 */
router.post('/v1/sessions/:id/summarize', requireAuth, addRequestId, requireOwnership(async (req) => {
  req.logger.info('requireOwnership check for summarize', { 
    sessionId: req.params.id,
    userId: req.userId 
  });
  const session = await Session.findById(req.params.id);
  if (!session) {
    req.logger.warn('Session not found in requireOwnership', { sessionId: req.params.id });
    return null;
  }
  req.logger.info('Session found in requireOwnership', { 
    sessionId: session._id,
    sessionUserId: session.userId,
    reqUserId: req.userId
  });
  return session?.userId;
}), async (req, res) => {
  const startTime = Date.now();
  
  req.logger.info('Summarize route handler called', { 
    sessionId: req.params.id,
    method: req.method,
    path: req.path,
    url: req.url
  });
  
  try {
    req.logger.info('Starting summarize process', { sessionId: req.params.id });
    
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      req.logger.warn('Session not found for summarize', { sessionId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        code: 'NOT_FOUND'
      });
    }
    
    req.logger.info('Session found', { 
      sessionId: session._id,
      phase: session.phase,
      messageCount: (session.messages || []).length,
      planCount: (session.plan || []).length
    });
    
    // Only allow summarization for completed sessions
    if (session.phase !== 'completed') {
      req.logger.warn('Session not completed', { 
        sessionId: session._id,
        phase: session.phase 
      });
      return res.status(400).json({
        success: false,
        error: 'Session must be completed to generate summary',
        code: 'INVALID_PHASE',
        currentPhase: session.phase
      });
    }
    
    // Get all messages from the session
    const messages = session.messages || [];
    const plan = session.plan || [];
    
    req.logger.info('Processing messages and plan', {
      messageCount: messages.length,
      planCount: plan.length
    });
    
    // Build summary prompt
    const { getGroqClient } = require('../lib/llmClient');
    let groqClient;
    try {
      req.logger.info('Initializing Groq client');
      groqClient = getGroqClient();
      req.logger.info('Groq client initialized successfully');
    } catch (error) {
      req.logger.error('Failed to get Groq client', { 
        error: error.message,
        stack: error.stack,
        errorName: error.name
      });
      return res.status(500).json({
        success: false,
        error: `LLM service unavailable: ${error.message}`,
        code: 'LLM_UNAVAILABLE'
      });
    }
    
    const planSummary = plan.length > 0 
      ? plan.map((m, i) => {
          const milestones = (m.milestones || []).map(mil => mil.text || mil).join(', ');
          const status = m.status === 'passed' ? 'Completed' : m.status || 'Not started';
          return `${i + 1}. ${m.title || 'Untitled Module'} (${status})
   Milestones: ${milestones || 'No milestones'}`;
        }).join('\n\n')
      : 'No learning plan available.';
    
    let messagesSummary;
    try {
      messagesSummary = messages
        .filter(msg => {
          // Filter out system messages that are summaries, and ensure message has content
          if (!msg || !msg.role) return false;
          if (msg.role === 'system' && msg.metadata?.summaryVersion) {
            return false;
          }
          return msg.content && (typeof msg.content === 'string' || typeof msg.content === 'number');
        })
        .slice(-20) // Last 20 messages for context
        .map(msg => {
          try {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const content = String(msg.content || '').substring(0, 200);
            return `${role}: ${content}`;
          } catch (mapError) {
            req.logger.warn('Error processing message', {
              messageId: msg.id,
              error: mapError.message
            });
            return null;
          }
        })
        .filter(msg => msg && msg.length > 0) // Remove null and empty messages
        .join('\n\n');
      
      if (!messagesSummary || messagesSummary.trim().length === 0) {
        if (messages.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No messages found in session to summarize',
            code: 'NO_MESSAGES'
          });
        }
        // If we have messages but they're all filtered out, use a default message
        messagesSummary = 'No conversation content available for summary.';
      }
    } catch (processError) {
      req.logger.error('Error processing messages', {
        error: processError.message,
        stack: processError.stack
      });
      throw new Error(`Failed to process messages: ${processError.message}`);
    }
    
    const summaryPrompt = `You are creating a concise study guide summary of a completed learning session. Focus on summarizing the actual content and concepts learned, not the learning process.

Topic: ${session.topic}
Learning Plan:
${planSummary}

Key Conversations:
${messagesSummary}

Create a brief, content-focused summary that:
1. Briefly explains what the topic is about (2-3 sentences)
2. For each module, list the key concepts and milestones covered (be specific about what was learned)
3. Keep it concise and study-guide style - focus on the actual knowledge/content, not the learning journey

Format:
- Start with a brief topic overview
- Then list each module with its key concepts and milestones
- Keep it under 300 words total
- Write in a clear, educational tone like a study guide

Example format:
"Python Basics is a programming language known for its simple syntax and readability. It uses indentation to define code blocks and supports multiple data types.

Module 1: Introduction to Python Basics
- Basic syntax and indentation rules
- Variables and data types (strings, numbers, booleans)
- Operators (arithmetic, comparison, logical)
- Control structures (if/else, for/while loops)

Module 2: Python Fundamentals
- Functions: defining with def keyword, parameters, return values
- Data structures: Lists (mutable), Tuples (immutable), Dictionaries (key-value pairs)
- Practical applications and small projects"`;

    req.logger.info('Generating session summary', { 
      sessionId: session._id,
      topic: session.topic,
      messageCount: messages.length,
      moduleCount: plan.length
    });
    
    let summaryResponse;
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    
    try {
      req.logger.info('Calling Groq API', {
        model: model,
        promptLength: summaryPrompt.length
      });
      
      summaryResponse = await groqClient.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a learning assistant that creates clear, structured summaries of learning sessions.'
          },
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        top_p: 0.9
      });
      
      req.logger.info('Groq API call successful', {
        hasChoices: !!summaryResponse?.choices,
        choicesCount: summaryResponse?.choices?.length || 0
      });
    } catch (llmError) {
      req.logger.error('LLM API call failed', {
        sessionId: session._id,
        error: llmError.message,
        errorName: llmError.name,
        stack: llmError.stack,
        errorCode: llmError.code,
        errorStatus: llmError.status,
        model: model
      });
      
      // Check for model permission errors
      if (llmError.message && llmError.message.includes('model_permission_blocked')) {
        const errorMsg = `The model "${model}" is blocked in your Groq project. Please enable it in your project settings at https://console.groq.com/settings/project/limits or set GROQ_MODEL environment variable to an available model.`;
        throw new Error(errorMsg);
      }
      
      // Check for other API errors
      if (llmError.response?.data?.error) {
        const apiError = llmError.response.data.error;
        if (apiError.code === 'model_permission_blocked_project') {
          const errorMsg = `The model "${model}" is blocked in your Groq project. Please enable it in your project settings at https://console.groq.com/settings/project/limits or set GROQ_MODEL environment variable to an available model.`;
          throw new Error(errorMsg);
        }
      }
      
      throw new Error(`LLM service error: ${llmError.message}`);
    }
    
    const summary = summaryResponse?.choices?.[0]?.message?.content?.trim();
    
    if (!summary) {
      req.logger.warn('Empty summary response from LLM', {
        sessionId: session._id,
        response: JSON.stringify(summaryResponse)
      });
      throw new Error('Received empty summary from LLM service');
    }
    
    req.logger.info('Session summary generated', {
      sessionId: session._id,
      summaryLength: summary.length,
      duration: Date.now() - startTime
    });
    
    res.json({
      success: true,
      data: {
        summary,
        sessionId: session._id.toString(),
        topic: session.topic,
        modulesCompleted: plan.filter(m => m.status === 'passed').length,
        totalModules: plan.length
      }
    });
    
  } catch (error) {
    req.logger.error('Summary generation failed', {
      sessionId: req.params.id,
      error: error.message,
      stack: error.stack,
      errorName: error.name,
      duration: Date.now() - startTime
    });
    
    // Log full error details
    console.error('Summary generation error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate summary',
      code: 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

// GET /v1/sessions/:id/messages - Paginated messages for display (oldest-first in each page)
// Query: limit=20, fromEnd=0 (fromEnd=0 => newest 20; fromEnd=20 => next 20 older)
router.get('/v1/sessions/:id/messages', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
    const fromEnd = Math.max(0, parseInt(req.query.fromEnd) || 0);
    const allMessages = (await Session.findById(id).select('messages').lean())?.messages || [];
    const totalCount = allMessages.length;
    const start = Math.max(0, totalCount - fromEnd - limit);
    const end = totalCount - fromEnd;
    const messages = start < end ? allMessages.slice(start, end) : [];
    const hasMore = fromEnd + limit < totalCount;
    res.json({
      success: true,
      data: { messages, totalCount, hasMore }
    });
  } catch (error) {
    req.logger.error('Failed to fetch session messages', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /v1/sessions/:id/resume - Initial hydrate: last 20 messages + totalCount for paging
router.post('/v1/sessions/:id/resume', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const INITIAL_PAGE_SIZE = 20;
    
    req.logger.info('Resuming session', { sessionId: id });
    
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
    
    const allMessages = session.messages || [];
    const totalMessageCount = allMessages.length;
    const lastMessages = allMessages.slice(-INITIAL_PAGE_SIZE);
    const hasMoreMessages = totalMessageCount > INITIAL_PAGE_SIZE;
    
    req.logger.info('Session resumed successfully', { 
      sessionId: id,
      messageCount: lastMessages.length,
      totalMessageCount,
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
        lastMessages,
        totalMessageCount,
        hasMoreMessages,
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

// PATCH /v1/sessions/:id/favorite - Toggle favorite status
router.patch('/v1/sessions/:id/favorite', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const { isFavorite } = req.body;
    
    req.logger.info('Updating favorite status', { sessionId: id, isFavorite });
    
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
    
    // Update favorite status
    if (typeof isFavorite === 'boolean') {
      session.isFavorite = isFavorite;
    } else {
      session.isFavorite = !session.isFavorite;
    }
    await session.save();
    
    req.logger.info('Favorite status updated', { 
      sessionId: id,
      isFavorite: session.isFavorite,
      duration: Date.now() - startTime 
    });
    
    res.json({
      success: true,
      data: {
        id: session._id,
        isFavorite: session.isFavorite
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to update favorite', { 
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

// PATCH /v1/sessions/:id - Update session (e.g., chatTitle)
router.patch('/v1/sessions/:id', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const { chatTitle } = req.body;
    
    req.logger.info('Updating session', { sessionId: id, chatTitle });
    
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
    
    // Update chatTitle if provided
    // When user renames chat, update both chatTitle and topic to keep them in sync
    if (chatTitle !== undefined) {
      session.chatTitle = chatTitle;
      // Also update topic to match the new chatTitle
      session.topic = chatTitle;
    }
    
    await session.save();
    
    req.logger.info('Session updated', { 
      sessionId: id,
      chatTitle: session.chatTitle,
      topic: session.topic,
      duration: Date.now() - startTime 
    });
    
    res.json({
      success: true,
      data: {
        id: session._id,
        chatTitle: session.chatTitle,
        topic: session.topic
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to update session', { 
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

// DELETE /v1/sessions/:id - Delete session
router.delete('/v1/sessions/:id', requireAuth, addRequestId, requireOwnership(async (req) => {
  const session = await Session.findById(req.params.id);
  return session?.userId;
}), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    
    req.logger.info('Deleting session', { sessionId: id });
    
    // Validate session ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      req.logger.warn('Invalid session ID format', { sessionId: id });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    const session = await Session.findByIdAndDelete(id);
    
    if (!session) {
      req.logger.warn('Session not found', { sessionId: id });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    req.logger.info('Session deleted', { 
      sessionId: id,
      userId: session.userId,
      duration: Date.now() - startTime 
    });
    
    // Note: We do NOT recalculate gems on session delete
    // Gems are based on pointsTotal which accumulates points when earned
    // Deleting a session does not affect pointsTotal or gems
    
    res.json({
      success: true,
      data: {
        id: id
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to delete session', { 
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

// GET /v1/sessions/search - Search sessions (with enhanced search across messages)
router.get('/v1/sessions/search', requireAuth, addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const searchQuery = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    if (!searchQuery.trim()) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Search query is required'
      });
    }
    
    req.logger.info('Searching sessions', { 
      userId: req.userId,
      searchQuery,
      limit,
      offset 
    });
    
    // Build search query - search in topic, chatTitle, and message content
    const searchRegex = { $regex: searchQuery.trim(), $options: 'i' };
    
    const query = { 
      userId: req.userId,
      chatTitle: { $ne: '', $exists: true },
      $and: [
        {
          $or: [
            { 'plan.0': { $exists: true } }, // Study sessions must have a plan
            { mode: 'reviewing' } // Revision sessions don't need a plan
          ]
        },
        {
          $or: [
            { topic: searchRegex },
            { chatTitle: searchRegex },
            { 'messages.content': searchRegex }
          ]
        }
      ]
    };
    
    // Fetch sessions
    const sessions = await Session.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .select('phase mode topic chatTitle points gems progressPct isFavorite createdAt updatedAt plan');
    
    const total = await Session.countDocuments(query);
    
    req.logger.info('Search completed', { 
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
          mode: session.mode,
          topic: session.topic,
          chatTitle: session.chatTitle,
          phase: session.phase,
          progressPct: session.progressPct,
          points: session.points,
          gems: session.gems,
          isFavorite: session.isFavorite || false,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        })),
        total,
        limit,
        offset,
        query: searchQuery
      }
    });
    
  } catch (error) {
    req.logger.error('Search failed', { 
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

module.exports = router;