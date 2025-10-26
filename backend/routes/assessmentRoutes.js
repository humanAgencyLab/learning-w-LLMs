const express = require('express');
const router = express.Router();
const pino = require('pino');
const { z } = require('zod');
const Session = require('../models/Session');
const { 
  assessmentRequestSchema, 
  assessmentResponseSchema,
  assessmentPlanSchema,
  clarifySchema 
} = require('../validation/assessmentValidation');
const { contextControl } = require('../middleware/contextControl');
const { buildAssessmentPrompt } = require('../prompts/srl_assessment_prompt');

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

// Groq client setup (lazy initialization to avoid test conflicts)
let groq;
const getGroqClient = () => {
  if (!groq) {
    const Groq = require('groq-sdk');
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }
  return groq;
};

// Assessment prompt builder now imported from srl_assessment_prompt.js

// JSON parsing with retry logic
const parseAssessmentResponse = async (response, isRetry = false) => {
  try {
    // Strip any leading/trailing non-JSON text
    let jsonText = response.trim();
    
    // Find JSON object boundaries
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
      throw new Error('No valid JSON object found');
    }
    
    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonText);
    
    // Validate against schema
    return assessmentResponseSchema.parse(parsed);
  } catch (error) {
    if (!isRetry) {
      // First attempt failed, try with stricter instructions
      throw new Error('JSON_PARSE_RETRY');
    }
    throw new Error(`JSON_PARSE_FAILED: ${error.message}`);
  }
};

// Call Groq API with retry logic
const callAssessmentAPI = async (prompt, isRetry = false) => {
  try {
    const groqClient = getGroqClient();
    const response = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert learning assessment AI. Return ONLY valid JSON matching the schema. No prose, no markdown blocks, no explanations outside the JSON. Return the raw JSON object only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      top_p: 0.95,
      max_tokens: 800,
      response_format: { type: "json_object" } // Force JSON mode
    });

    return response.choices[0].message.content;
  } catch (error) {
    throw new Error(`GROQ_API_ERROR: ${error.message}`);
  }
};

// POST /v1/assessment - Assessment endpoint
router.post('/v1/assessment', addRequestId, contextControl, async (req, res) => {
  const startTime = Date.now();
  let retryCount = 0;
  
  try {
    req.logger.info('Assessment request received', { body: req.body });
    
    // Validate request body
    const validatedData = assessmentRequestSchema.parse(req.body);
    const { sessionId, mode, profile: bodyProfile } = validatedData;
    // Use sanitized message if available, otherwise use original
    const userMessage = req.sanitized?.message || validatedData.userMessage;
    
    // Load session
    const session = await Session.findById(sessionId);
    if (!session) {
      req.logger.warn('Session not found', { sessionId });
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Resolve profile
    const profile = bodyProfile || session.profile;
    if (!profile || !profile.name || profile.name.trim() === '') {
      req.logger.warn('Profile missing or empty', { sessionId });
      return res.status(400).json({
        success: false,
        error: 'Profile is required for assessment'
      });
    }
    
    // Check phase state machine
    if (!['pre', 'assessing'].includes(session.phase)) {
      req.logger.warn('Illegal phase transition', { 
        sessionId, 
        currentPhase: session.phase 
      });
      return res.status(409).json({
        success: false,
        error: 'Illegal phase transition',
        currentPhase: session.phase,
        allowedPhases: ['pre', 'assessing']
      });
    }
    
    // Set phase to assessing
    session.phase = 'assessing';
    await session.save();
    
    // Track clarification count for this assessment phase
    const assessClarifyCount = session.meta.assessClarifyCount || 0;
    
    // Force plan generation if this is the third call (after 2 clarification rounds)
    if (assessClarifyCount >= 2) {
      req.logger.info('Maximum clarification attempts reached, forcing plan generation', { 
        sessionId, 
        assessClarifyCount 
      });
    }
    
    // Build prompt (will be retry version if needed)
    const prompt = buildAssessmentPrompt(profile, userMessage, mode, false);
    
    // Call API with retry logic
    let response;
    let parsedResponse;
    
    try {
      response = await callAssessmentAPI(prompt, false);
      parsedResponse = await parseAssessmentResponse(response, false);
    } catch (error) {
      if (error.message === 'JSON_PARSE_RETRY') {
        req.logger.info('JSON parse failed, retrying with stricter instructions', { sessionId });
        retryCount = 1;
        
        const retryPrompt = buildAssessmentPrompt(profile, userMessage, mode, true);
        response = await callAssessmentAPI(retryPrompt, true);
        parsedResponse = await parseAssessmentResponse(response, true);
      } else {
        throw error;
      }
    }
    
    // Handle clarifying questions
    if (parsedResponse.clarify) {
      const { questions } = parsedResponse;
      
      // Track assessment clarification count (reset when entering learning phase)
      const assessClarifyCount = (session.meta.assessClarifyCount || 0) + 1;
      session.meta.assessClarifyCount = assessClarifyCount;
      
      // Add assistant message with questions
      const assistantMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `I'd like to clarify a few things to create the best learning plan for you:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
        timestamp: new Date(),
        metadata: { type: 'clarify', questionCount: questions.length }
      };
      
      session.messages.push(assistantMessage);
      await session.save();
      
      req.logger.info('Assessment clarification returned', { 
        sessionId, 
        questionCount: questions.length,
        assessClarifyCount: session.meta.assessClarifyCount,
        duration: Date.now() - startTime 
      });
      
      return res.json({
        success: true,
        clarify: true,
        questions: questions
      });
    }
    
    // Handle plan generation
    const { topic, chatTitle, rationale, plan, nextPhase } = parsedResponse;
    
    // Backfill missing rationale
    const finalRationale = rationale && rationale.length > 0 
      ? rationale 
      : 'Personalized learning path based on your profile and goals';
    
    // Backfill missing targets for each module
    const finalPlan = plan.map(module => {
      const targets = module.targets && module.targets.length > 0
        ? module.targets
        : [`Master ${module.title}`]; // Minimal backfill
      return { ...module, targets };
    });
    
    // Validate final plan structure
    try {
      assessmentPlanSchema.parse({
        topic,
        chatTitle,
        rationale: finalRationale,
        plan: finalPlan,
        nextPhase
      });
    } catch (validationError) {
      req.logger.error('LLM output validation failed after backfill', {
        sessionId,
        error: validationError.message
      });
      return res.status(502).json({
        success: false,
        code: 'LLM_PROVIDER_ERROR',
        message: 'Chat service unavailable'
      });
    }
    
    // Reset session if topic changed
    if (!session.topic || session.topic !== topic) {
      session.points = 0;
      session.gems = 0;
      session.isViewOnly = false;
      session.progressPct = 0;
    }
    
    // Update session with plan
    session.topic = topic;
    session.chatTitle = chatTitle;
    session.plan = finalPlan.map(module => ({
      id: module.moduleId,
      title: module.title,
      description: `Learn ${module.title.toLowerCase()}`,
      status: module.moduleId === '1' ? 'in_progress' : 'locked',
      milestones: module.targets,
      completedMilestones: [],
      points: module.points,
      difficulty: module.difficulty || 'core'
    }));
    session.activeModuleId = '1';
    session.phase = nextPhase;
    
    // Clear assessment clarification count when entering learning phase
    if (nextPhase === 'learning') {
      session.meta.assessClarifyCount = undefined;
    }
    
    // Add user message
    const userMessageObj = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      metadata: { type: 'assessment_request' }
    };
    
    // Add assistant message (compact summary)
    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: `I've created a personalized learning plan for "${topic}" with ${plan.length} modules. Let's start with "${plan[0].title}"!`,
      timestamp: new Date(),
      metadata: { 
        type: 'assessment_plan', 
        moduleCount: plan.length,
        totalPoints: plan.reduce((sum, m) => sum + m.points, 0)
      }
    };
    
    session.messages.push(userMessageObj, assistantMessage);
    await session.save();
    
    req.logger.info('Assessment plan generated successfully', {
      sessionId,
      topic,
      modulesCount: finalPlan.length,
      sumPoints: finalPlan.reduce((sum, m) => sum + m.points, 0),
      clarifyPathUsed: (session.meta.assessClarifyCount || 0) > 0,
      assessClarifyCount: session.meta.assessClarifyCount || 0,
      retryCount,
      duration: Date.now() - startTime,
      latencyMs: Date.now() - startTime
    });
    
    res.json({
      success: true,
      data: {
        topic,
        chatTitle,
        rationale: finalRationale,
        plan: finalPlan,
        nextPhase
      }
    });
    
  } catch (error) {
    req.logger.error('Assessment failed', {
      sessionId: req.body.sessionId,
      error: error.message,
      stack: error.stack,
      retryCount,
      duration: Date.now() - startTime
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    // All LLM output/validation failures → 502 LLM_PROVIDER_ERROR
    if (error.message.includes('JSON_PARSE_FAILED') || 
        error.message.includes('GROQ_API_ERROR') ||
        error.message.includes('JSON_PARSE_RETRY')) {
      return res.status(502).json({
        success: false,
        code: 'LLM_PROVIDER_ERROR',
        message: 'Chat service unavailable'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'test' ? error.message : undefined
    });
  }
});

module.exports = router;
