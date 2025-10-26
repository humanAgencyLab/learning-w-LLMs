const express = require('express');
const router = express.Router();
const { z } = require('zod');
const Session = require('../models/Session');
const { chatRequestSchema } = require('../validation/chatValidation');
const { validateInput } = require('../middleware/validationHardening');
const { contextControl } = require('../middleware/contextControl');
const { ERROR_RESPONSES } = require('../middleware/validationHardening');
const { classifyIntent } = require('../utils/intentClassifier');
const { buildTeacherPrompt } = require('../prompts/teacher_prompt');
const { handleNeutralMessage } = require('../prompts/neutral_prompt');
// const logger = require('../utils/logger'); // Not used

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

// Teacher prompt now imported from teacher_prompt.js module

// Check if user wants to start a quiz
const hasQuizIntent = (message) => {
  const quizKeywords = [
    'quiz me', 'start test', 'short check', 'test me', 'quiz', 'assessment',
    'check my knowledge', 'test my understanding', 'give me a quiz'
  ];
  
  const lowerMessage = message.toLowerCase();
  return quizKeywords.some(keyword => lowerMessage.includes(keyword));
};

// Neutral message handling now imported from neutral_prompt.js module

// Check if user wants to continue from feedback phase
const hasContinueIntent = (message) => {
  const continueKeywords = [
    'continue', 'keep going', 'next', 'proceed', 'let\'s continue',
    'move on', 'go ahead', 'yes', 'sure'
  ];
  
  const lowerMessage = message.toLowerCase();
  return continueKeywords.some(keyword => lowerMessage.includes(keyword));
};

// Extract question from assistant response
const extractQuestion = (response) => {
  // Simple regex to find any question mark followed by optional text
  const questionMatch = response.match(/([^.!?]*\?[^.!?]*)/);
  if (questionMatch) {
    return questionMatch[1].trim();
  }
  
  return null;
};

// Call Groq API for teacher response
const callTeacherAPI = async (prompt, maxTokens = 1100, session = null) => {
  try {
    const groqClient = getGroqClient();
    
    // Build messages array with conversation history
    const messages = [
      {
        role: 'system',
        content: 'You are an expert programming tutor. Provide clear, helpful explanations with specific questions. Be encouraging and concise.'
      }
    ];
    
    // Add conversation history if session has messages
    if (session.messages && session.messages.length > 0) {
      // Convert session messages to LLM format
      const conversationHistory = session.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      messages.push(...conversationHistory);
    } else {
      // No conversation history - use the prompt as user message
      messages.push({
        role: 'user',
        content: prompt
      });
    }
    
    const response = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: maxTokens
    });

    return response.choices[0].message.content;
  } catch (error) {
    throw new Error(`GROQ_API_ERROR: ${error.message}`);
  }
};

// POST /v1/chat - Teacher chat endpoint
router.post('/v1/chat', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('Chat request received', { body: req.body });
    
    // Read sanitized message if available, otherwise use body
    const { sessionId } = req.body;
    const userMessage = req.sanitized?.message || req.body.userMessage;
    
    // Load session
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    console.log('Session loaded successfully', { 
      sessionId, 
      phase: session.phase,
      topic: session.topic 
    });
    
    // Enforce session boundaries - reject if in pre/assessing phase or plan is empty
    if (['pre', 'assessing'].includes(session.phase) || !session.plan || session.plan.length === 0) {
      console.log('Session not ready for chat', { sessionId, phase: session.phase, hasPlan: !!session.plan });
      return res.status(409).json({
        success: false,
        error: 'Session not ready for chat',
        code: 'ILLEGAL_PHASE',
        currentPhase: session.phase,
        hint: 'Please complete assessment first to create a learning plan'
      });
    }
    
    // Classify message intent
    const intent = classifyIntent(userMessage, session.phase);
    console.log('Message intent classified:', { intent, phase: session.phase, messagePreview: userMessage.substring(0, 50) });
    
    // Phase guard - validate phase is allowed for chat
    if (!['learning', 'feedback'].includes(session.phase)) {
      return res.status(409).json({
        success: false,
        error: 'Chat not allowed in current phase',
        code: 'ILLEGAL_PHASE',
        currentPhase: session.phase,
        allowedPhases: ['learning', 'feedback']
      });
    }
    
    // Check if session is view-only
    if (session.isViewOnly) {
      return res.status(409).json({
        success: false,
        error: 'Chat not allowed for view-only sessions',
        code: 'ILLEGAL_PHASE'
      });
    }
    
    // Check if activeModuleId is null (only required for learning phase)
    if (session.phase !== 'pre' && !session.activeModuleId) {
      console.warn('No active module for chat', { sessionId });
      return res.status(409).json({
        success: false,
        error: 'No active module. Please re-run assessment to set up learning plan.',
        code: 'ILLEGAL_PHASE'
      });
    }
    
    // Handle feedback phase continue intent
    let phaseChanged = false;
    if (session.phase === 'feedback' && hasContinueIntent(userMessage)) {
      session.phase = 'learning';
      phaseChanged = true;
      await session.save();
      console.log('Phase changed from feedback to learning', { sessionId });
    }
    
    // Check for quiz intent (highest priority after phase guards)
    const wantsQuiz = hasQuizIntent(userMessage);
    if (wantsQuiz) {
      console.log('Quiz intent detected', { sessionId, activeModuleId: session.activeModuleId });
      
      // Add user message
      const userMessageObj = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'learning', phaseAtSend: session.phase }
      };
      
      session.messages.push(userMessageObj);
      await session.save();
      
      return res.json({
        success: true,
        data: {
          message: "Great! Let's test your understanding of this module.",
          nextAction: "START_QUIZ",
          moduleId: session.activeModuleId,
          tokensIn: userMessage.length,
          tokensOut: 0,
          hadCheckInReply: false,
          followedUpOutstanding: false
        }
      });
    }
    
    // Handle non-learning intents
    if (intent === 'admin') {
      const neutralResponse = handleNeutralMessage(session, userMessage, intent, session.phase);
      
      // Add user message with intent tracking
      const userMessageObj = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        metadata: { 
          type: 'chat', 
          tokensIn: userMessage.length,
          intent: 'admin',
          phaseAtSend: session.phase
        }
      };
      
      // Add assistant message
      const assistantMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: neutralResponse.message,
        timestamp: new Date(),
        metadata: { 
          type: 'chat', 
          tokensOut: neutralResponse.message.length,
          intent: 'admin',
          phaseAtSend: session.phase,
          hadCheckInReply: false,
          followedUpOutstanding: false
        }
      };
      
      session.messages.push(userMessageObj, assistantMessage);
      await session.save();
      
      return res.json({
        success: true,
        data: {
          message: neutralResponse.message,
          tokensIn: Math.ceil(userMessage.length / 4),
          tokensOut: Math.ceil(neutralResponse.message.length / 4),
          hadCheckInReply: false,
          followedUpOutstanding: false,
          phase: session.phase,
          intent: 'admin'
        }
      });
    }
    
    if (intent === 'general') {
      const neutralResponse = handleNeutralMessage(session, userMessage, intent, session.phase);
      
      // Check if there's an outstanding check
      if (session.meta.outstandingCheck && intent === 'general') {
        // Don't force the check for general messages
        // Keep it parked
      } else {
        // Normal general message handling
      }
      
      // Add user message with intent tracking
      const userMessageObj = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        metadata: { 
          type: 'chat', 
          tokensIn: userMessage.length,
          intent: 'general',
          phaseAtSend: session.phase
        }
      };
      
      // Add assistant message
      const assistantMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: neutralResponse.message,
        timestamp: new Date(),
        metadata: { 
          type: 'chat', 
          tokensOut: neutralResponse.message.length,
          intent: 'general',
          phaseAtSend: session.phase,
          hadCheckInReply: false,
          followedUpOutstanding: false
        }
      };
      
      session.messages.push(userMessageObj, assistantMessage);
      await session.save();
      
      return res.json({
        success: true,
        data: {
          message: neutralResponse.message,
          tokensIn: Math.ceil(userMessage.length / 4),
          tokensOut: Math.ceil(neutralResponse.message.length / 4),
          hadCheckInReply: false,
          followedUpOutstanding: false,
          phase: session.phase,
          intent: 'general'
        }
      });
    }
    
    // Only learning intent gets teacher prompt below
    if (intent !== 'learning') {
      // This shouldn't happen after the above checks, but safety fallback
      return res.json({
        success: true,
        data: {
          message: "I'm here to help you learn. What would you like to know?",
          tokensIn: Math.ceil(userMessage.length / 4),
          tokensOut: 30,
          hadCheckInReply: false,
          followedUpOutstanding: false,
          phase: session.phase,
          intent: 'general'
        }
      });
    }
    
    // Learning intent: use teacher prompt
    // Only proceed with teacher prompt for learning intent and learning/feedback phases
    if (!['learning', 'feedback'].includes(session.phase)) {
      // For pre phase with learning intent, wait for assessment
      return res.status(409).json({
        success: false,
        error: 'Learning phase not started. Please complete assessment first.',
        code: 'ILLEGAL_PHASE',
        currentPhase: session.phase
      });
    }
    
    // Determine if this is a follow-up to outstanding check
    const isFollowUp = session.meta.outstandingCheck && !wantsQuiz;
    
    // Build teacher prompt (for learning intent only)
    const prompt = buildTeacherPrompt(session, userMessage, isFollowUp);
    
    // Call teacher API - let errors propagate to error handler
    const assistantResponse = await callTeacherAPI(prompt, req.maxTokens || 1100, session);
    
    // Extract question from response
    const extractedQuestion = extractQuestion(assistantResponse);
    const hadCheckInReply = !!extractedQuestion;
    
    // Debug logging
    console.log('Question extraction debug', {
      sessionId,
      response: assistantResponse,
      extractedQuestion,
      hadCheckInReply
    });
    
    // Update cadence tracking
    let followedUpOutstanding = false;
    
    if (isFollowUp) {
      // User answered the outstanding question
      session.meta.outstandingCheck = null;
      session.meta.countSinceLastCheck = 0;
      followedUpOutstanding = true;
      console.log('Outstanding question answered', { sessionId });
      
      // If assistant asked a new question, set it as outstanding
      if (hadCheckInReply) {
        session.meta.outstandingCheck = extractedQuestion;
        console.log('New question asked after follow-up', { sessionId, question: extractedQuestion });
      }
    } else if (hadCheckInReply) {
      // Assistant asked a new question
      session.meta.outstandingCheck = extractedQuestion;
      session.meta.countSinceLastCheck = 0;
      console.log('New question asked', { sessionId, question: extractedQuestion });
    } else {
      // No question in this response, increment counter
      session.meta.countSinceLastCheck += 1;
      console.log('No question in response', { sessionId, countSinceLastCheck: session.meta.countSinceLastCheck });
    }
    
    // Add user message with intent and phase tracking
    const userMessageObj = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      metadata: { 
        type: 'chat', 
        tokensIn: userMessage.length,
        intent: intent,
        phaseAtSend: session.phase
      }
    };
    
    // Add assistant message with intent and phase tracking
    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date(),
      metadata: { 
        type: 'chat', 
        tokensOut: assistantResponse.length,
        intent: intent,
        phaseAtSend: session.phase,
        hadCheckInReply,
        followedUpOutstanding,
        phaseChanged
      }
    };
    
    session.messages.push(userMessageObj, assistantMessage);
    await session.save();
    
    // Calculate tokens (rough estimation)
    const tokensIn = Math.ceil(userMessage.length / 4);
    const tokensOut = Math.ceil(assistantResponse.length / 4);
    
    console.log('Chat response generated', {
      sessionId,
      activeModuleId: session.activeModuleId,
      hadCheckInReply,
      followedUpOutstanding,
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startTime,
      phaseChanged
    });
    
    // Prepare response data
    const responseData = {
      message: assistantResponse,
      tokensIn,
      tokensOut,
      hadCheckInReply,
      followedUpOutstanding,
      phase: session.phase // Include current phase
    };

    // Add context summary if available
    if (req.contextSummary) {
      responseData.summarized = req.contextSummary.summarized;
      responseData.summaryNote = req.contextSummary.summaryNote;
    }

    console.log('Sending response data:', responseData);
    
    res.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('Chat failed:', {
      requestId: req.requestId || 'unknown',
      sessionId: req.body?.sessionId || 'unknown',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      duration: Date.now() - startTime
    });
    
    if (error instanceof z.ZodError) {
      const fieldErrors = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        fieldErrors[path] = err.message;
      });
      
      const { statusCode, response } = ERROR_RESPONSES.VALIDATION_ERROR(fieldErrors);
      return res.status(statusCode).json(response);
    }
    
    if (error.message.includes('GROQ_API_ERROR')) {
      const { statusCode, response } = ERROR_RESPONSES.LLM_PROVIDER_ERROR(error.message);
      return res.status(statusCode).json(response);
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
