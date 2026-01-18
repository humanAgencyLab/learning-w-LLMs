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
const { callTeacherAPI } = require('../services/teacherService');
const { validateFirstTeaching } = require('../utils/responseValidator');
const { requireAuth } = require('../middleware/auth');

// Initialize Pino logger (no transport in production - pino-pretty is dev-only)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

// Middleware to add request ID to logger
const addRequestId = (req, res, next) => {
  req.logger = logger.child({ requestId: req.requestId });
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
      max_tokens: 1200,
      response_format: { type: "json_object" } // Force JSON mode
    });

    return response.choices[0].message.content;
  } catch (error) {
    const responseData = error.response?.data || error.data || null;
    const providerError = responseData?.error || null;
    const wrappedError = new Error(
      `GROQ_API_ERROR: ${providerError?.code || error.code || error.message}`
    );
    wrappedError.status = error.status || error.response?.status;
    wrappedError.code = providerError?.code || error.code;
    wrappedError.response = responseData;
    wrappedError.failedGeneration = providerError?.failed_generation || responseData?.failed_generation;
    wrappedError.original = error;
    throw wrappedError;
  }
};

// POST /v1/assessment - Assessment endpoint
router.post('/v1/assessment', requireAuth, addRequestId, contextControl, async (req, res) => {
  const startTime = Date.now();
  let retryCount = 0;
  let session = null; // Declare session outside try block for catch block access
  
  try {
    req.logger.info('Assessment request received', { body: req.body });
    
    // Validate request body
    const validatedData = assessmentRequestSchema.parse(req.body);
    const { sessionId, mode, profile: bodyProfile } = validatedData;
    // Use sanitized message if available, otherwise use original
    const userMessage = req.sanitized?.message || validatedData.userMessage;
    
    // Load session
    session = await Session.findById(sessionId);
    if (!session) {
      req.logger.warn('Session not found', { sessionId });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    // Verify session belongs to authenticated user
    if (session.userId.toString() !== req.userId) {
      req.logger.warn('Access denied - session ownership mismatch', { 
        sessionId, 
        sessionUserId: session.userId, 
        reqUserId: req.userId 
      });
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Access denied. You do not have permission to access this session.'
      });
    }
    
    // Resolve profile
    const profile = bodyProfile || session.profile;
    if (!profile || !profile.name || profile.name.trim() === '') {
      req.logger.warn('Profile missing or empty', { sessionId });
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          profile: ['Profile is required for assessment']
        }
      });
    }
    
    // Check phase state machine (allow 'planning' for modifications)
    if (!['pre', 'assessing', 'planning'].includes(session.phase)) {
      req.logger.warn('Illegal phase transition', { 
        sessionId, 
        currentPhase: session.phase 
      });
      return res.status(409).json({
        success: false,
        code: 'ILLEGAL_PHASE',
        message: 'Session not ready'
      });
    }
    
    // Set phase to assessing
    session.phase = 'assessing';
    
    // Initialize meta if undefined
    if (!session.meta) {
      session.meta = {};
    }
    
    await session.save();
    
    // Always generate plan directly (no user interaction, no clarification questions)
    // Extract key context from recent messages (last 4 messages max)
    const conversationHistory = (session.messages || [])
      .slice(-4)
      .map(m => ({ role: m.role, content: m.content }));
    
    // Build prompt with conversation history (will be retry version if needed)
    const prompt = buildAssessmentPrompt(profile, userMessage, mode, conversationHistory, false);
    
    // Call API with retry logic
    let response;
    let parsedResponse;
    
    try {
      response = await callAssessmentAPI(prompt, false);
      parsedResponse = await parseAssessmentResponse(response, false);
    } catch (error) {
      req.logger.error('LLM call failed', {
        sessionId,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        response: error.response || error.original?.response?.data || 'no response data',
        failedGeneration: error.failedGeneration || error.original?.response?.data?.failed_generation
      });
      
      // Check for rate limit - return special error
      if (error.status === 429 || error.message?.includes('rate_limit')) {
        req.logger.warn('Rate limit reached', { sessionId });
        return res.status(503).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'API rate limit exceeded. Please try again in a few minutes.',
          retryAfter: 60 // seconds
        });
      }
      
      const isJsonFailure =
        error.message?.includes('JSON_PARSE') ||
        error.message?.includes('JSON_PARSE_RETRY') ||
        error.code === 'json_validate_failed' ||
        error.code === 'json_schema_violation' ||
        error.code === 'json_validation_failed';

      if (isJsonFailure) {
        req.logger.info('JSON parse failed, retrying with stricter instructions', { sessionId });
        retryCount = 1;
        
        try {
          const retryPrompt = buildAssessmentPrompt(profile, userMessage, mode, conversationHistory, true);
          response = await callAssessmentAPI(retryPrompt, true);
          parsedResponse = await parseAssessmentResponse(response, true);
        } catch (retryError) {
          // Check if retry also hit rate limit
          if (retryError.status === 429 || retryError.message?.includes('rate_limit')) {
            req.logger.warn('Rate limit reached on retry', { sessionId });
            return res.status(503).json({
              success: false,
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'API rate limit exceeded. Please try again in a few minutes.',
              retryAfter: 60
            });
          }
          
          req.logger.error('Retry also failed', {
            sessionId,
            error: retryError.message,
            errorCode: retryError.code,
            failedGeneration: retryError.failedGeneration
          });
          
          // If retry also fails, throw LLM_FAILED_USE_DEFAULT to trigger fallback
          throw new Error('LLM_FAILED_USE_DEFAULT');
        }
      } else {
        // If not a JSON parse error, throw LLM_FAILED_USE_DEFAULT to trigger fallback
        throw new Error('LLM_FAILED_USE_DEFAULT');
      }
    }
    
    // Always generate plan (no clarification questions)
    // Handle plan generation
    const { topic, chatTitle, rationale, plan, nextPhase } = parsedResponse;
    
    // Backfill missing rationale
    const finalRationale = rationale && rationale.length > 0 
      ? rationale 
      : 'Personalized learning path based on your profile and goals';
    
    // Backfill missing targets for each module
    let finalPlan = plan.map(module => {
      const targets = module.targets && module.targets.length > 0
        ? module.targets
        : [`Master ${module.title}`]; // Minimal backfill
      return { ...module, targets };
    });
    
    // ⚠️ CRITICAL: Enforce 2-3 modules limit - ask LLM to regenerate if 4+ modules
    if (finalPlan.length > 3) {
      req.logger.warn('LLM generated too many modules, requesting correction', {
        sessionId,
        originalCount: finalPlan.length,
        topic
      });
      
      // Create corrective prompt asking LLM to regenerate with exactly 3 modules
      const planSummary = finalPlan.map((m, i) => `${i + 1}. ${m.title} (${m.points} points): ${m.targets.join('; ')}`).join('\n');
      const correctiveMessage = `${userMessage}\n\n⚠️ CORRECTION REQUIRED: You generated ${finalPlan.length} modules, but the plan must have EXACTLY 3 modules (not 4, not 5, not more). Please regenerate the plan with EXACTLY 3 modules by consolidating/merging the content from the following modules:\n\n${planSummary}\n\nMerge related topics and consolidate the content into EXACTLY 3 well-structured modules. Keep all important learning objectives but organize them into 3 modules instead of ${finalPlan.length}.`;
      
      try {
        const correctivePrompt = buildAssessmentPrompt(profile, correctiveMessage, mode, conversationHistory, true);
        const correctiveResponse = await callAssessmentAPI(correctivePrompt, true);
        const correctiveParsed = await parseAssessmentResponse(correctiveResponse, true);
        
        // Use the corrected plan
        const correctedPlan = correctiveParsed.plan.map(module => {
          const targets = module.targets && module.targets.length > 0
            ? module.targets
            : [`Master ${module.title}`];
          return { ...module, targets };
        });
        
        // If still wrong, fall back to default (but log it)
        if (correctedPlan.length > 3) {
          req.logger.error('LLM still generated too many modules after correction, using fallback', {
            sessionId,
            originalCount: finalPlan.length,
            correctedCount: correctedPlan.length,
            topic
          });
          throw new Error('LLM_FAILED_USE_DEFAULT');
        }
        
        finalPlan = correctedPlan;
        req.logger.info('LLM successfully corrected module count', {
          sessionId,
          originalCount: plan.length,
          correctedCount: finalPlan.length,
          topic
        });
      } catch (correctiveError) {
        req.logger.error('Corrective prompt failed, using fallback', {
          sessionId,
          error: correctiveError.message,
          topic
        });
        throw new Error('LLM_FAILED_USE_DEFAULT');
      }
    }
    
    // Also ensure minimum of 2 modules
    if (finalPlan.length < 2) {
      req.logger.warn('LLM generated too few modules, using default plan', {
        sessionId,
        originalCount: finalPlan.length,
        topic
      });
      throw new Error('LLM generated plan with fewer than 2 modules - using fallback');
    }
    
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
    
    // Update session with plan (stay in planning phase, not learning)
    session.topic = topic;
    // Always set chatTitle to match topic for consistency
    session.chatTitle = topic;
    session.plan = finalPlan.map(module => ({
      id: module.moduleId,
      title: module.title,
      description: `Learn ${module.title.toLowerCase()}`,
      status: 'locked', // All modules locked until plan is approved
      milestones: module.targets.map(target => ({
        text: target,
        completed: false
      })),
      completedMilestones: [],
      points: module.points,
      difficulty: module.difficulty || 'core'
    }));
    session.activeModuleId = null; // No active module until plan approved
    session.phase = 'planning'; // Always stay in planning phase until approved
    session.planApproved = false; // Plan needs approval
    
    // Clear any legacy assessment clarification count (not used anymore)
    if (session.meta) {
      session.meta.assessClarifyCount = undefined;
    }
    
    // Check if user message was already added (from shouldTriggerAssessment in chat route)
    const lastUserMsg = session.messages
      .filter(m => m.role === 'user')
      .slice(-1)[0];
    
    const isDuplicate = lastUserMsg && lastUserMsg.content === userMessage;
    
    if (!isDuplicate) {
      // Add user message if not already present
      const userMessageObj = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        metadata: { type: 'assessment_request' }
      };
      session.messages.push(userMessageObj);
    }
    
    // Add assistant message with plan approval request
    const planSummary = finalPlan.map((m, i) => `${i + 1}. ${m.title} (${m.points} points)`).join('\n');
    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: `I've created a personalized learning plan for "${topic}" with ${finalPlan.length} modules:\n\n${planSummary}\n\nPlease review and let me know if you'd like to approve this plan or request any modifications.`,
      timestamp: new Date(),
      metadata: { 
        type: 'assessment_plan', 
        moduleCount: finalPlan.length,
        totalPoints: finalPlan.reduce((sum, m) => sum + m.points, 0),
        requiresApproval: true
      }
    };
    
    session.messages.push(assistantMessage);
    await session.save();
    
    req.logger.info('Assessment plan generated successfully', {
      sessionId,
      topic,
      modulesCount: finalPlan.length,
      sumPoints: finalPlan.reduce((sum, m) => sum + m.points, 0),
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
      duration: Date.now() - startTime,
      errorName: error.name
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors
      });
    }
    
    // If LLM fails, use default plan instead of error
    if (error.message === 'LLM_FAILED_USE_DEFAULT') {
      req.logger.info('Using default plan due to LLM failure', { sessionId: req.body.sessionId });
      
      // Extract topic from session messages or request
      let extractedTopic = 'Web Development';
      try {
        // Get userMessage from request or session
        const requestUserMessage = req.body.userMessage;
        const sessionUserMessages = session?.messages
          ?.filter(m => m.role === 'user')
          ?.map(m => m.content)
          ?.slice(-3)
          ?.join(' ') || '';
        
        extractedTopic = requestUserMessage || sessionUserMessages || 'Web Development';
        
        // Extract meaningful topic (max 40 chars)
        const meaningfulWords = extractedTopic.toLowerCase().split(' ')
          .filter(w => w.length > 3 && 
            !['want', 'learn', 'teaching', 'about', 'help', 'need', 'basic', 'from', 'scratch'].includes(w))
          .slice(0, 3);
        
        if (meaningfulWords.length > 0) {
          extractedTopic = meaningfulWords.join(' ');
        }
        
        if (extractedTopic.length > 40) {
          extractedTopic = extractedTopic.substring(0, 37) + '...';
        }
      } catch (extractError) {
        req.logger.warn('Failed to extract topic', { error: extractError.message });
      }
      
      // Generate dynamic default plan when LLM fails
      // For simple topics, use 2 modules; for complex topics, use 3 modules
      const topicLower = extractedTopic.toLowerCase();
      const isComplexTopic = topicLower.includes('full stack') || topicLower.includes('full-stack') || 
                             topicLower.includes('machine learning') || topicLower.includes('web development') ||
                             topicLower.includes('software engineering') || topicLower.includes('data science') ||
                             topicLower.includes('full stack') || topicLower.includes('full-stack');
      
      const moduleCount = isComplexTopic ? 3 : 2; // Dynamic: 2 for simple, 3 for complex
      
      // Dynamic point distribution based on module complexity
      const getDynamicPoints = (moduleNum, totalModules) => {
        if (totalModules === 3) {
          // Intro: 20, Core: 35, Advanced: 45
          return moduleNum === 1 ? 20 : moduleNum === 2 ? 35 : 45;
        } else {
          // For 2 modules: Intro: 35, Advanced: 65
          // Intro: 35, Advanced: 65
          if (moduleNum === 1) return 35;
          return 65;
        }
      };
      
      const defaultPlan = {
        topic: extractedTopic,
        chatTitle: `Learn ${extractedTopic}`,
        rationale: `Personalized learning path for ${extractedTopic} based on your goals`,
        plan: Array.from({ length: moduleCount }, (_, i) => {
          const moduleNum = i + 1;
          const points = getDynamicPoints(moduleNum, moduleCount);
          // Dynamic: 3-5 milestones per module based on module complexity
          // First module: 3-4, Middle modules: 3-5, Last module: 4-5
          let milestonesPerModule;
          if (moduleNum === 1) {
            milestonesPerModule = 3 + Math.floor(Math.random() * 2); // 3-4 for first module
          } else if (moduleNum === moduleCount) {
            milestonesPerModule = 4 + Math.floor(Math.random() * 2); // 4-5 for last module
          } else {
            milestonesPerModule = 3 + Math.floor(Math.random() * 3); // 3-5 for middle modules
          }
          
          // Simple, meaningful milestones - no repetition
          const milestoneTemplates = [
            ["Learn basic concepts and terminology", "Understand core principles", "Practice with simple examples", "Identify key features", "Recognize common patterns"],
            ["Master intermediate features", "Build practical projects", "Apply concepts to solve problems", "Create interactive applications", "Optimize code structure"],
            ["Explore advanced features", "Create complex applications", "Master expert-level skills", "Optimize performance", "Implement best practices"]
          ];
          
          const templateIndex = moduleNum === 1 ? 0 : moduleNum === moduleCount ? 2 : 1;
          const template = milestoneTemplates[templateIndex];
          const targets = template.slice(0, milestonesPerModule).map(t => t.replace('concepts', `${extractedTopic} concepts`).replace('features', `${extractedTopic} features`));
          
          return {
            moduleId: String(moduleNum),
            title: moduleNum === 1 ? "Getting Started" : 
                   moduleNum === moduleCount ? "Advanced Topics" : 
                   `Core Concepts ${moduleNum > 2 ? `Part ${moduleNum - 1}` : ''}`,
            targets: targets,
            points: points,
            difficulty: moduleNum === 1 ? "intro" : moduleNum === moduleCount ? "apply" : "core"
          };
        }),
        nextPhase: "planning"
      };
      
      // Apply the plan to session (same as normal flow) - only if session exists
      if (session) {
        session.topic = defaultPlan.topic;
        // Use default chatTitle from plan (or fallback to topic)
        session.chatTitle = defaultPlan.chatTitle || defaultPlan.topic;
        session.plan = defaultPlan.plan.map(module => ({
          id: module.moduleId,
          title: module.title,
          description: `Learn ${module.title.toLowerCase()}`,
          status: 'locked', // All modules locked until plan approved
          milestones: module.targets.map(target => ({
            text: target,
            completed: false
          })),
          completedMilestones: [],
          points: module.points,
          difficulty: module.difficulty || 'core'
        }));
        session.activeModuleId = null;
        session.phase = 'planning';
        session.planApproved = false;
        if (session.meta) {
          session.meta.assessClarifyCount = undefined;
        }
        
        // Add user message if not already present
        const lastUserMsg = session.messages.filter(m => m.role === 'user').slice(-1)[0];
        const isDuplicate = lastUserMsg && lastUserMsg.content === req.body.userMessage;
        if (!isDuplicate) {
          session.messages.push({
            id: `msg_${Date.now()}`,
            role: 'user',
            content: req.body.userMessage,
            timestamp: new Date(),
            metadata: { type: 'assessment_request' }
          });
        }
        
        // Add plan announcement with approval request
        const defaultPlanSummary = defaultPlan.plan.map((m, i) => `${i + 1}. ${m.title} (${m.points} points)`).join('\n');
        session.messages.push({
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: `I've created a learning plan for "${defaultPlan.topic}" with ${defaultPlan.plan.length} modules:\n\n${defaultPlanSummary}\n\nPlease review and let me know if you'd like to approve this plan or request any modifications.`,
          timestamp: new Date(),
          metadata: { type: 'assessment_plan', moduleCount: defaultPlan.plan.length, requiresApproval: true }
        });
        
        await session.save();
      }
      
      req.logger.info('Default plan generated successfully', {
        sessionId: req.body.sessionId,
        topic: defaultPlan.topic,
        modulesCount: defaultPlan.plan.length
      });
      
      return res.json({
        success: true,
        data: defaultPlan
      });
    }
    
    // All other LLM output/validation failures → 502 LLM_PROVIDER_ERROR
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

// POST /v1/assessment/approve - Approve plan and move to learning phase
router.post('/v1/assessment/approve', requireAuth, addRequestId, async (req, res) => {
  const startTime = Date.now();
  let session;
  
  try {
    req.logger.info('Plan approval request received', { body: req.body });
    
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Session ID required'
      });
    }
    
    session = await Session.findById(sessionId);
    if (!session) {
      req.logger.warn('Session not found', { sessionId });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Session not found'
      });
    }
    
    // Verify session belongs to authenticated user
    if (session.userId.toString() !== req.userId) {
      req.logger.warn('Access denied - session ownership mismatch', { 
        sessionId, 
        sessionUserId: session.userId, 
        reqUserId: req.userId 
      });
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Access denied. You do not have permission to access this session.'
      });
    }
    
    // Check if in planning phase
    if (session.phase !== 'planning') {
      req.logger.warn('Illegal phase for approval', { 
        sessionId, 
        currentPhase: session.phase 
      });
      return res.status(409).json({
        success: false,
        code: 'ILLEGAL_PHASE',
        message: 'Plan must be in planning phase to approve'
      });
    }
    
    // Check if plan exists
    if (!session.plan || session.plan.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'No plan to approve'
      });
    }
    
    // Approve plan and move to learning phase
    session.planApproved = true;
    session.phase = 'learning';
    session.activeModuleId = session.plan[0]?.id || null;
    
    // Initialize milestone tracking
    if (!session.meta) {
      session.meta = {};
    }
    session.meta.currentMilestoneIndex = 0;
    session.meta.milestoneBeingTaught = false;
    
    // Set first module to in_progress
    if (session.plan.length > 0 && session.plan[0]) {
      session.plan[0].status = 'in_progress';
    }
    
    // CRITICAL: IMMEDIATELY start teaching the first milestone after approval
    // User already confirmed by clicking approve - no need to wait for additional message
    // Generate ONE COMBINED message: Approval + Module intro + Teaching content + Assessment
    let teacherPrompt = '';
    try {
      const { buildTeacherPrompt } = require('../prompts/teacher_prompt');
      
      // Get first module and first milestone
      const firstModule = session.plan[0];
      const firstMilestone = firstModule?.milestones?.[0];
      
      if (firstModule && firstMilestone) {
        // Build teacher prompt for first milestone teaching
        // Use a trigger message that indicates we're starting
        const triggerMessage = "Let's start learning";
        teacherPrompt = buildTeacherPrompt(session, triggerMessage, false);
        console.log('Initial teaching prompt generated', {
          sessionId,
          promptLength: teacherPrompt ? teacherPrompt.length : 0,
          hasActiveModule: !!firstModule,
          hasMilestone: !!firstMilestone
        });
        
        // Call teacher API to generate teaching content
        const teachingContentRaw = await callTeacherAPI(teacherPrompt, 1500, session);
        console.log('Teaching response raw', {
          sessionId,
          contentLength: teachingContentRaw?.length || 0
        });
        
        let teachingContent = teachingContentRaw;
        let teachingValidation = validateFirstTeaching(teachingContent, firstMilestone.text);
        
        if (!teachingValidation.isValid) {
          req.logger.warn('Initial teaching validation failed, retrying with stricter instructions', {
            sessionId,
            missingParts: teachingValidation.missingParts,
            step2WordCount: teachingValidation.step2WordCount
          });
          
          const structureFixDirectives = [
            '- Write three paragraphs separated by blank lines (DO NOT use step labels like "STEP 1:", "STEP 2:", "STEP 3:").',
            '- First paragraph: Context (1-3 sentences) - "Thank you for approving the study plan. Let\'s begin our learning journey for **topic**. We\'ll start with **moduleName** module, focusing on **milestoneName**. [One sentence explaining why this milestone matters]." (Use **text** for bold formatting of topic, module, and milestone names).',
            '- Second paragraph: Teaching content (150-200 words) with focused explanation of the milestone topic.',
            '- Third paragraph: Exactly ONE question related to the milestone topic ending with a question mark.',
            '- Do not stop early; produce the full response before finishing.'
          ];
          
          const reinforcementPrompt = `${teacherPrompt}\n\nCRITICAL STRUCTURE FIX – follow ALL items exactly:\n${structureFixDirectives.join('\n')}`;
          const retryContent = await callTeacherAPI(reinforcementPrompt, 1500, session);
          const retryValidation = validateFirstTeaching(retryContent, firstMilestone.text);
          
          if (!retryValidation.isValid) {
            req.logger.error('Initial teaching retry still failed validation', {
              sessionId,
              missingParts: retryValidation.missingParts,
              step2WordCount: retryValidation.step2WordCount
            });
            teachingContent = retryContent || teachingContent;
            teachingValidation = retryValidation;
          } else {
            teachingContent = retryContent;
            teachingValidation = retryValidation;
            req.logger.info('Initial teaching validation succeeded on retry', {
              sessionId,
              step2WordCount: retryValidation.step2WordCount
            });
          }
        }
        
        if (teachingContent) {
          // Remove redundant "On Module X..." introduction from teaching content
          // The LLM generates this, but we're already providing context in our combined message
          teachingContent = teachingContent.replace(/^On\s+Module\s+\d+.*?\.\s*/i, '');
          teachingContent = teachingContent.replace(/^Let'?s\s+start\s+with\s+["']?[^"']+["']?\.\s*/i, '');
          
          // Build the combined message: Approval + Module intro + Teaching content
          const combinedMessage = teachingContent.trim();
          
          // Extract question from combined message
          const questionMatch = combinedMessage.match(/([^.!?]*\?[^.!?]*)/);
          const extractedQuestion = questionMatch ? questionMatch[1].trim() : null;
          
          // Set outstanding check
          if (extractedQuestion) {
            session.meta.outstandingCheck = extractedQuestion;
            session.meta.milestoneBeingTaught = true;
          }
          
          // Add single combined message (approval + teaching)
          const combinedTeachingMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: combinedMessage,
            timestamp: new Date(),
            metadata: {
              type: 'plan_approved_and_teaching',
              moduleId: firstModule.id,
              moduleTitle: firstModule.title,
              milestoneIndex: 0,
              milestoneText: firstMilestone.text,
              moduleCount: session.plan.length
            }
          };
          
          session.messages.push(combinedTeachingMessage);
          
          req.logger.info('Initial teaching generated after approval', {
            sessionId,
            moduleId: firstModule.id,
            milestoneIndex: 0,
            teachingLength: teachingContent.length,
            hasQuestion: !!extractedQuestion
          });
        }
      }
    } catch (teachingError) {
        console.error('Initial teaching generation failed', {
        sessionId,
        error: teachingError.message,
        stack: teachingError.stack,
          promptLength: teacherPrompt?.length || 0,
          promptPreview: teacherPrompt ? teacherPrompt.slice(0, 200) : null
      });
      req.logger.error('Failed to generate initial teaching after approval', {
        sessionId,
        error: teachingError.message,
        stack: teachingError.stack
      });
      // Continue anyway - user can still interact and teaching will trigger on next message
    }
    
    // Update chatTitle to match topic when plan is approved
    session.chatTitle = session.topic;
    
    await session.save();
    
    req.logger.info('Plan approved successfully and teaching started', {
      sessionId,
      topic: session.topic,
      chatTitle: session.chatTitle,
      modulesCount: session.plan.length,
      activeModuleId: session.activeModuleId,
      currentMilestoneIndex: session.meta.currentMilestoneIndex,
      duration: Date.now() - startTime
    });
    
    // Get the last message (combined approval + teaching message)
    const lastMessage = session.messages[session.messages.length - 1];
    
    res.json({
      success: true,
      data: {
        topic: session.topic,
        chatTitle: session.chatTitle,
        plan: session.plan,
        phase: 'learning',
        planApproved: true,
        message: lastMessage?.content || 'Plan approved. Ready to start learning.',
        nextAction: lastMessage?.metadata?.type === 'plan_approved_and_teaching' ? 'TEACH' : 'APPROVED',
        messages: session.messages.slice(-1) // Return only the combined message
      }
    });
    
  } catch (error) {
    req.logger.error('Plan approval failed', {
      sessionId: req.body?.sessionId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'test' ? error.message : undefined
    });
  }
});

// POST /v1/assessment/modify - Request plan modifications
router.post('/v1/assessment/modify', requireAuth, addRequestId, contextControl, async (req, res) => {
  const startTime = Date.now();
  let session = null;
  let sessionId = null;
  let modificationRequest = null;
  let lastError = null;
  let retryCount = 0;
  
  try {
    req.logger.info('Plan modification request received', { body: req.body });
    
    sessionId = req.body?.sessionId;
    modificationRequest = req.body?.modificationRequest;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Session ID required'
      });
    }
    
    if (!modificationRequest || modificationRequest.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Modification request required'
      });
    }
    
    session = await Session.findById(sessionId);
    if (!session) {
      req.logger.warn('Session not found', { sessionId });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Session not found'
      });
    }
    
    // Verify session belongs to authenticated user
    if (session.userId.toString() !== req.userId) {
      req.logger.warn('Access denied - session ownership mismatch', { 
        sessionId, 
        sessionUserId: session.userId, 
        reqUserId: req.userId 
      });
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Access denied. You do not have permission to access this session.'
      });
    }
    
    // Check if in planning phase
    if (session.phase !== 'planning') {
      req.logger.warn('Illegal phase for modification', { 
        sessionId, 
        currentPhase: session.phase 
      });
      return res.status(409).json({
        success: false,
        code: 'ILLEGAL_PHASE',
        message: 'Plan must be in planning phase to modify'
      });
    }
    
    // Get profile
    const profile = session.profile;
    if (!profile || !profile.name || profile.name.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Profile required for plan modification'
      });
    }
    
    // Get conversation history (last few messages)
    const conversationHistory = session.messages.slice(-10);
    
    // Build modification prompt using buildAssessmentPrompt with modification context
    // Include the existing plan in the modification request for context
    const existingPlanSummary = session.plan.map((m, i) => 
      `${i + 1}. ${m.title} (${m.points} pts): ${(m.milestones || []).slice(0, 2).map(ms => typeof ms === 'string' ? ms : ms.text).join(', ')}`
    ).join('\n');
    
    const userMessageWithModification = `${session.topic} - User wants to modify the plan. Current plan:\n${existingPlanSummary}\n\nModification request: "${modificationRequest}"\n\nPlease generate a NEW plan that incorporates this feedback while keeping the topic: "${session.topic}".`;
    const prompt = buildAssessmentPrompt(profile, userMessageWithModification, session.mode, conversationHistory, false);
    
    // Add modification context to prompt
    const modificationPrompt = prompt + `\n\nCRITICAL MODIFICATION INSTRUCTIONS:
1. The user wants to MODIFY the existing plan based on their feedback: "${modificationRequest}"
2. Keep the same topic: "${session.topic}"
3. Generate a COMPLETE NEW plan that addresses their modification request
4. **DYNAMIC MODULE COUNT: Generate EXACTLY 2-3 modules based on topic complexity - simple topics get 2 modules, complex topics get 3 modules. NEVER generate 4 or more modules.**
5. **DYNAMIC POINT DISTRIBUTION: Distribute points based on module complexity (not equal like 33, 33, 34)**
   * Introductory modules → 15-25 points
   * Core modules → 25-40 points
   * Advanced modules → 20-35 points
6. **DYNAMIC MILESTONE COUNT: Each module should have 3-5 targets (milestones) based on the module's scope**
7. **Each target should be simple and meaningful (8-15 words) - avoid repetition and verbosity**
8. **AVOID generic targets** like "Learn basics", "Master fundamentals", "Apply key concepts"
9. If the user requests "less elaboration" or "make it simpler", make milestones shorter (8-15 words) and more concise
10. If the user requests "more modules" or "more milestones", increase the module count or milestone count per module accordingly
11. The user has explicitly requested a modification, so you MUST use the LLM to generate a proper modified plan
12. Return ONLY valid JSON matching the schema exactly`;
    
    // Call LLM to generate modified plan - MUST use LLM for modifications
    // Try up to 3 times (initial + 2 retries) with progressively stricter instructions
    let llmResponse = null;
    let parsedResponse = null;
    const maxRetries = 2; // Allow up to 2 retries (3 total attempts)
    
    // Attempt 1: Initial call with full context
    let success = false;
    try {
      llmResponse = await callAssessmentAPI(modificationPrompt, false);
      parsedResponse = await parseAssessmentResponse(llmResponse, false);
      success = true;
      req.logger.info('LLM modification succeeded on first attempt', { sessionId });
    } catch (error) {
      lastError = error;
      req.logger.error('LLM modification attempt 1 failed', {
        sessionId,
        error: error.message,
        errorStack: error.stack,
        errorStatus: error.status,
        errorCode: error.code,
        errorType: error.message.includes('JSON_PARSE') ? 'JSON_PARSE' : error.message.includes('GROQ_API') ? 'API_ERROR' : 'OTHER'
      });
      
      // If JSON parse failed, retry with stricter instructions
      if (error.message.includes('JSON_PARSE_RETRY') || error.message.includes('JSON_PARSE_FAILED')) {
        // Attempt 2: Retry with stricter instructions
        if (retryCount < maxRetries) {
          retryCount++;
          try {
            const retryUserMessage = `${session.topic} - Modification: ${modificationRequest}`;
            const retryPrompt = buildAssessmentPrompt(profile, retryUserMessage, session.mode, conversationHistory, true);
            const retryModificationPrompt = retryPrompt + `\n\nCRITICAL MODIFICATION INSTRUCTIONS:
1. The user wants to MODIFY the existing plan based on their feedback: "${modificationRequest}"
2. Keep the same topic: "${session.topic}"
3. Generate a COMPLETE NEW plan that addresses their modification request
4. **MANDATORY: Each target MUST be elaborate and specific (50+ words each)**
5. **STRICTLY FORBIDDEN: Do NOT use generic targets**
6. **CRITICAL: Return ONLY valid JSON - no markdown, no code fences, no prose before or after the JSON**
7. The JSON must be a single valid JSON object, nothing else`;

            llmResponse = await callAssessmentAPI(retryModificationPrompt, true);
            parsedResponse = await parseAssessmentResponse(llmResponse, true);
            success = true;
            req.logger.info('LLM modification succeeded on retry attempt', { sessionId, retryCount });
          } catch (retryError) {
            lastError = retryError;
            req.logger.warn('LLM modification attempt 2 failed, trying final attempt', {
              sessionId,
              error: retryError.message,
              retryCount
            });
            
            // Attempt 3: Final attempt with minimal, strict prompt
            if (retryCount < maxRetries) {
              retryCount++;
              try {
                // Use a very simple, direct prompt for the final attempt
                const finalPrompt = JSON.stringify({
                  topic: session.topic,
                  chatTitle: `Learn ${session.topic}`,
                  rationale: `Modified plan based on user feedback: ${modificationRequest}`,
                  plan: [
                    {
                      moduleId: "1",
                      title: "Getting Started",
                      targets: [
                        `Master the fundamental concepts of ${session.topic}: understand core principles, terminology, and basic operations; learn essential skills needed to build a strong foundation; practice with hands-on examples to reinforce understanding and gain confidence`,
                        `Build a solid foundation in ${session.topic}: develop familiarity with key tools and techniques; learn best practices and common patterns; create your first practical project to apply what you've learned`,
                        `Establish core competencies in ${session.topic}: understand how different components work together; learn to troubleshoot common issues; gain confidence through guided practice exercises`
                      ],
                      points: 25,
                      difficulty: "intro"
                    }
                  ],
                  nextPhase: "planning"
                });

                // For final attempt, try to parse the response more leniently
                llmResponse = await callAssessmentAPI(`Generate a modified learning plan for topic "${session.topic}" based on this modification request: "${modificationRequest}". Return ONLY valid JSON matching this structure: ${finalPrompt}`, true);
                
                // Try to parse with more lenient handling
                try {
                  parsedResponse = await parseAssessmentResponse(llmResponse, true);
                  success = true;
                  req.logger.info('LLM modification succeeded on final attempt', { sessionId, retryCount });
                } catch (parseErr) {
                  // If parsing still fails, try to extract JSON manually
                  let jsonText = llmResponse.trim();
                  const jsonStart = jsonText.indexOf('{');
                  const jsonEnd = jsonText.lastIndexOf('}');
                  if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
                    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
                    try {
                      const manualParsed = JSON.parse(jsonText);
                      // Validate it matches our schema
                      parsedResponse = assessmentResponseSchema.parse(manualParsed);
                      success = true;
                      req.logger.info('LLM modification succeeded on final attempt with manual parsing', { sessionId, retryCount });
                    } catch (manualErr) {
                      lastError = parseErr; // Keep original parse error
                      throw parseErr; // Re-throw original parse error
                    }
                  } else {
                    lastError = parseErr;
                    throw parseErr;
                  }
                }
              } catch (finalError) {
                lastError = finalError;
                req.logger.error('All LLM modification attempts failed', {
                  sessionId,
                  error: finalError.message,
                  allAttempts: retryCount + 1
                });
                throw new Error('LLM_FAILED_AFTER_RETRIES');
              }
            } else {
              req.logger.error('LLM modification retries exhausted', {
                sessionId,
                error: retryError.message
              });
              throw new Error('LLM_FAILED_AFTER_RETRIES');
            }
          }
        } else {
          req.logger.error('LLM modification failed, no retries available', {
            sessionId,
            error: error.message
          });
          throw new Error('LLM_FAILED_AFTER_RETRIES');
        }
      } else {
        // For non-JSON errors (API errors, etc.), retry once
        if (retryCount < maxRetries) {
          retryCount++;
          req.logger.info('Retrying modification due to API error', { sessionId, retryCount, error: error.message });
          try {
            llmResponse = await callAssessmentAPI(modificationPrompt, true);
            parsedResponse = await parseAssessmentResponse(llmResponse, true);
            success = true;
            req.logger.info('LLM modification succeeded on API error retry', { sessionId });
          } catch (retryApiError) {
            lastError = retryApiError;
            throw new Error('LLM_FAILED_AFTER_RETRIES');
          }
        } else {
          throw new Error('LLM_FAILED_AFTER_RETRIES');
        }
      }
    }
    
    // Ensure we have a valid response before proceeding
    if (!success || !parsedResponse) {
      req.logger.error('Modification failed - no valid response', { sessionId });
      throw new Error('LLM_FAILED_AFTER_RETRIES');
    }
    
    // Handle plan generation
    const { topic, chatTitle, rationale, plan } = parsedResponse;
    
    const finalRationale = rationale && rationale.length > 0 
      ? rationale 
      : 'Modified learning path based on your feedback';
    
    let finalPlan = plan.map(module => {
      const targets = module.targets && module.targets.length > 0
        ? module.targets
        : [`Master ${module.title}`];
      return { ...module, targets };
    });
    
    // ⚠️ CRITICAL: Enforce 2-3 modules limit - ask LLM to regenerate if 4+ modules
    if (finalPlan.length > 3) {
      req.logger.warn('LLM generated too many modules in modification, requesting correction', {
        sessionId,
        originalCount: finalPlan.length,
        topic
      });
      
      // Create corrective prompt asking LLM to regenerate with exactly 3 modules
      const planSummary = finalPlan.map((m, i) => `${i + 1}. ${m.title} (${m.points} points): ${m.targets.join('; ')}`).join('\n');
      const correctiveMessage = `${modificationRequest}\n\n⚠️ CORRECTION REQUIRED: You generated ${finalPlan.length} modules, but the plan must have EXACTLY 3 modules (not 4, not 5, not more). Please regenerate the plan with EXACTLY 3 modules by consolidating/merging the content from the following modules:\n\n${planSummary}\n\nMerge related topics and consolidate the content into EXACTLY 3 well-structured modules. Keep all important learning objectives but organize them into 3 modules instead of ${finalPlan.length}.`;
      
      try {
        const correctivePrompt = buildAssessmentPrompt(profile, correctiveMessage, session.mode, conversationHistory, true);
        const correctiveResponse = await callAssessmentAPI(correctivePrompt, true);
        const correctiveParsed = await parseAssessmentResponse(correctiveResponse, true);
        
        // Use the corrected plan
        const correctedPlan = correctiveParsed.plan.map(module => {
          const targets = module.targets && module.targets.length > 0
            ? module.targets
            : [`Master ${module.title}`];
          return { ...module, targets };
        });
        
        // If still wrong, reject the modification
        if (correctedPlan.length > 3) {
          req.logger.error('LLM still generated too many modules after correction in modification', {
            sessionId,
            originalCount: finalPlan.length,
            correctedCount: correctedPlan.length,
            topic
          });
          throw new Error('LLM_FAILED_AFTER_RETRIES');
        }
        
        finalPlan = correctedPlan;
        req.logger.info('LLM successfully corrected module count in modification', {
          sessionId,
          originalCount: plan.length,
          correctedCount: finalPlan.length,
          topic
        });
      } catch (correctiveError) {
        req.logger.error('Corrective prompt failed in modification', {
          sessionId,
          error: correctiveError.message,
          topic
        });
        throw new Error('LLM_FAILED_AFTER_RETRIES');
      }
    }
    
    // Also ensure minimum of 2 modules
    if (finalPlan.length < 2) {
      req.logger.warn('LLM generated too few modules in modification, rejecting', {
        sessionId,
        originalCount: finalPlan.length,
        topic
      });
      throw new Error('LLM generated plan with fewer than 2 modules');
    }
    
    // Update session with modified plan
    session.topic = topic;
    // chatTitle must always match topic (both generated by LLM)
    session.chatTitle = topic;
    session.plan = finalPlan.map(module => ({
      id: module.moduleId,
      title: module.title,
      description: `Learn ${module.title.toLowerCase()}`,
      status: 'locked',
      milestones: module.targets.map(target => ({
        text: target,
        completed: false
      })),
      completedMilestones: [],
      points: module.points,
      difficulty: module.difficulty || 'core'
    }));
    session.planApproved = false; // Reset approval status
    
    // Add user modification request message
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: modificationRequest,
      timestamp: new Date(),
      metadata: { type: 'plan_modification_request' }
    };
    
    // Add assistant message with modified plan
    const planSummary = finalPlan.map((m, i) => `${i + 1}. ${m.title} (${m.points} points)`).join('\n');
    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: `I've updated your learning plan based on your feedback:\n\n${planSummary}\n\nPlease review and let me know if you'd like to approve this modified plan or request further changes.`,
      timestamp: new Date(),
      metadata: { 
        type: 'assessment_plan_modified', 
        moduleCount: finalPlan.length,
        totalPoints: finalPlan.reduce((sum, m) => sum + m.points, 0),
        requiresApproval: true
      }
    };
    
    session.messages.push(userMessage, assistantMessage);
    await session.save();
    
    req.logger.info('Plan modified successfully', {
      sessionId,
      topic,
      modulesCount: finalPlan.length,
      duration: Date.now() - startTime
    });
    
    res.json({
      success: true,
      data: {
        topic,
        chatTitle,
        rationale: finalRationale,
        plan: finalPlan,
        nextPhase: 'planning'
      }
    });
    
  } catch (error) {
    // Ensure we have safe access to variables
    const safeSessionId = sessionId || req.body?.sessionId || 'unknown';
    const safeModificationRequest = modificationRequest || req.body?.modificationRequest || 'unknown';
    
    req.logger.error('Plan modification failed', {
      sessionId: safeSessionId,
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      modificationRequest: safeModificationRequest,
      errorName: error?.name,
      lastError: lastError?.message
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors
      });
    }
    
    // Handle LLM failure after retries - return specific error message
    if (error?.message === 'LLM_FAILED_AFTER_RETRIES') {
      // Log detailed error information
      req.logger.error('LLM failed after all retries for modification', {
        sessionId: safeSessionId,
        modificationRequest: safeModificationRequest,
        error: error?.message || 'Unknown error',
        lastError: lastError?.message,
        lastErrorStack: lastError?.stack,
        lastErrorStatus: lastError?.status,
        retryCount: retryCount || 0
      });
      
      // Check if it's a rate limit issue
      if (lastError?.status === 429 || lastError?.message?.includes('rate_limit') || lastError?.message?.includes('429')) {
        return res.status(503).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'API rate limit exceeded. Please try again in a few minutes.',
          retryAfter: 60
        });
      }
      
      // Check if it's an API key issue
      if (lastError?.message?.includes('GROQ_API_KEY') || lastError?.message?.includes('apiKey') || lastError?.message?.includes('authentication')) {
        return res.status(502).json({
          success: false,
          code: 'LLM_PROVIDER_ERROR',
          message: 'AI service configuration error. Please contact support.',
          details: process.env.NODE_ENV === 'development' ? lastError?.message : undefined
        });
      }
      
      return res.status(502).json({
        success: false,
        code: 'LLM_PROVIDER_ERROR',
        message: 'Unable to generate modified plan. The AI service is temporarily unavailable. Please try again in a moment, or try rephrasing your modification request.',
        details: process.env.NODE_ENV === 'development' ? `LLM failed after ${retryCount || 0} retries: ${lastError?.message || error.message}` : undefined
      });
    }
    
    // Handle LLM API errors
    if (error?.message?.includes('GROQ_API_ERROR') || error?.message?.includes('JSON_PARSE_FAILED')) {
      return res.status(502).json({
        success: false,
        code: 'LLM_PROVIDER_ERROR',
        message: 'Unable to process modification request. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      });
    }
    
    // Generic error handler - ensure we always return a response
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while processing your modification request. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
    
    if (error?.message === 'LLM_FAILED_USE_DEFAULT') {
      // Fallback: Modify existing plan based on user request
      req.logger.info('Using fallback plan modification due to LLM failure', { sessionId: safeSessionId });
      
      // Ensure modificationRequest is available
      const modReqText = (safeModificationRequest || '').toLowerCase();
      
      if (session && session.plan && session.plan.length > 0 && modReqText) {
        // Try to modify existing plan based on keywords in modification request
        const modReq = modReqText;
        
        // Simple heuristic-based modifications
        let modifiedPlan = session.plan.map((module, index) => {
          // Handle both Mongoose documents and plain objects
          const moduleObj = module.toObject ? module.toObject() : (typeof module === 'object' ? { ...module } : module);
          return {
            ...moduleObj,
            title: modReq.includes('add') || modReq.includes('more') 
              ? `${moduleObj.title} (Enhanced)` 
              : modReq.includes('remove') || modReq.includes('less')
              ? moduleObj.title
              : moduleObj.title,
            status: 'locked', // Reset all to locked
            milestones: moduleObj.milestones || [],
            completedMilestones: [],
            points: moduleObj.points || 0,
            difficulty: moduleObj.difficulty || 'core'
          };
        });
        
        // If user asks for more fundamentals, add emphasis to first module
        if (modReq.includes('fundamental') || modReq.includes('basic') || modReq.includes('start')) {
          if (modifiedPlan[0]) {
            modifiedPlan[0].title = `${modifiedPlan[0].title} (Extended)`;
            modifiedPlan[0].points = (modifiedPlan[0].points || 25) + 5;
          }
        }
        
        // If user asks for more practice, add emphasis to middle modules
        if (modReq.includes('practice') || modReq.includes('project') || modReq.includes('hands-on')) {
          modifiedPlan.forEach((module, idx) => {
            if (idx > 0 && idx < modifiedPlan.length - 1) {
              module.points = (module.points || 30) + 5;
            }
          });
        }
        
        // Update session with modified plan
        session.plan = modifiedPlan;
        session.planApproved = false;
        
        // Add user modification request message
        const userMessage = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: req.body?.modificationRequest || modificationRequest || 'Request plan modification',
          timestamp: new Date(),
          metadata: { type: 'plan_modification_request' }
        };
        
        // Add assistant message with modified plan
        const planSummary = modifiedPlan.map((m, i) => `${i + 1}. ${m.title} (${m.points || 0} points)`).join('\n');
        const assistantMessage = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: `I've updated your learning plan based on your feedback. Here's the revised plan:\n\n${planSummary}\n\nPlease review and let me know if you'd like to approve this modified plan or request further changes.`,
          timestamp: new Date(),
          metadata: { 
            type: 'assessment_plan_modified', 
            moduleCount: modifiedPlan.length,
            requiresApproval: true,
            fallback: true // Mark as fallback modification
          }
        };
        
        session.messages.push(userMessage, assistantMessage);
        await session.save();
        
        req.logger.info('Fallback plan modification completed', {
          sessionId,
          topic: session.topic,
          modulesCount: modifiedPlan.length
        });
        
        return res.json({
          success: true,
          data: {
            topic: session.topic,
            chatTitle: session.chatTitle,
            rationale: 'Modified learning path based on your feedback',
            plan: modifiedPlan
          }
        });
      }
      
      // If no existing plan or LLM failed multiple times, return error asking user to try again
      return res.status(502).json({
        success: false,
        code: 'LLM_PROVIDER_ERROR',
        message: 'Unable to generate modified plan using AI. The modification feature requires the AI to understand your request. Please try again with a more specific modification request, or refresh the page and try again.'
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
