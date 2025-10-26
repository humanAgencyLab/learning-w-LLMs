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

// Profile-aware assessment prompt builder
const buildAssessmentPrompt = (profile, userMessage, mode, isRetry = false) => {
  const retryInstruction = isRetry ? 
    '\n\nIMPORTANT: Return only valid JSON matching the schema. No prose, no explanations, no markdown.' : '';
  
  return `You are an expert learning assessment AI. Create a personalized learning plan based on the user's profile and request.

USER PROFILE:
- Background: ${profile.background}
- Goals: ${profile.goals.join(', ')}
- Strengths: ${profile.strengths.join(', ')}
- Knowledge Gaps: ${profile.gaps.join(', ')}
- Time Available: ${profile.timePerDayMins} minutes per day
- Preferred Style: ${profile.preferredStyle}

USER REQUEST: "${userMessage}"
MODE: ${mode}

INSTRUCTIONS:
1. If the user's topic is too vague or doesn't align with their profile, ask 1-2 targeted clarifying questions instead of creating a plan.
2. If the topic is clear and specific, create a learning plan with 2-8 modules.
3. Each module must have unique, content-specific titles (not "Module 1", "Part 2", etc.).
4. Points must sum to exactly 100 across all modules.
5. No single module can exceed 60 points.
6. Module IDs must be sequential strings starting from "1".

RESPONSE FORMAT (JSON only):
For a plan:
{
  "topic": "specific topic name (≤60 chars, no emojis)",
  "chatTitle": "human-friendly title (≤40 chars)",
  "plan": [
    {"moduleId": "1", "title": "specific module title", "points": 20, "difficulty": "intro"},
    {"moduleId": "2", "title": "another specific title", "points": 40, "difficulty": "core"}
  ],
  "nextPhase": "learning"
}

For clarifying questions:
{
  "clarify": true,
  "questions": ["What specific aspect of X do you want to focus on?", "Are you more interested in theory or practical applications?"]
}

${retryInstruction}`;
};

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
          content: 'You are an expert learning assessment AI. Return only valid JSON matching the provided schema. No prose, no explanations, no markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      top_p: 0.95,
      max_tokens: req.maxTokens || 500 // Use context control max tokens
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
    const { sessionId, userMessage, mode, profile: bodyProfile } = validatedData;
    
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
    
    // Check for too many clarification attempts using persisted clarifyCount
    if (session.clarifyCount >= 2) {
      req.logger.warn('Too many clarification attempts', { sessionId, clarifyCount: session.clarifyCount });
      // Force a plan generation
    }
    
    // Build prompt
    const prompt = buildAssessmentPrompt(profile, userMessage, mode);
    
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
      
      // Increment clarify count
      session.clarifyCount += 1;
      
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
        clarifyCount: session.clarifyCount,
        duration: Date.now() - startTime 
      });
      
      return res.json({
        success: true,
        clarify: true,
        questions: questions
      });
    }
    
    // Handle plan generation
    const { topic, chatTitle, plan, nextPhase } = parsedResponse;
    
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
    session.plan = plan.map(module => ({
      id: module.moduleId,
      title: module.title,
      description: `Learn ${module.title.toLowerCase()}`,
      status: module.moduleId === '1' ? 'in_progress' : 'locked',
      milestones: [`Understand ${module.title.toLowerCase()}`, `Practice ${module.title.toLowerCase()}`, `Apply ${module.title.toLowerCase()}`],
      completedMilestones: [],
      points: module.points,
      difficulty: module.difficulty || 'core'
    }));
    session.activeModuleId = '1';
    session.phase = nextPhase;
    
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
      modulesCount: plan.length,
      sumPoints: plan.reduce((sum, m) => sum + m.points, 0),
      clarifyPathUsed: session.clarifyCount > 0,
      clarifyCount: session.clarifyCount,
      retryCount,
      duration: Date.now() - startTime,
      latencyMs: Date.now() - startTime
    });
    
    res.json({
      success: true,
      data: {
        topic,
        chatTitle,
        plan,
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
    
    if (error.message.includes('JSON_PARSE_FAILED')) {
      return res.status(502).json({
        success: false,
        error: 'Assessment JSON invalid',
        code: 'ASSESSMENT_JSON_INVALID',
        hint: 'Try rephrasing your topic'
      });
    }
    
    if (error.message.includes('GROQ_API_ERROR')) {
      return res.status(502).json({
        success: false,
        error: 'Assessment service unavailable'
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
