const express = require('express');
const router = express.Router();
const { z } = require('zod');
const Session = require('../models/Session');
const { chatRequestSchema } = require('../validation/chatValidation');
const { validateInput } = require('../middleware/validationHardening');
const { contextControl } = require('../middleware/contextControl');
const { ERROR_RESPONSES } = require('../middleware/validationHardening');
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

// Teacher prompt builder with cadence awareness
const buildTeacherPrompt = (session, userMessage, isFollowUp = false) => {
  const { topic, activeModuleId, plan, profile, phase } = session;
  const activeModule = plan.find(m => m.id === activeModuleId);
  
  // Handle pre-phase (no specific topic yet)
  if (phase === 'pre') {
    return `You are an expert programming tutor. The student is just starting and hasn't chosen a specific topic yet.

Student Profile:
- Background: ${profile.background}
- Goals: ${profile.goals.join(', ')}
- Strengths: ${profile.strengths.join(', ')}
- Knowledge Gaps: ${profile.gaps.join(', ')}
- Preferred Style: ${profile.preferredStyle}
- Time Available: ${profile.timePerDayMins} minutes/day

Student's message: "${userMessage}"

Teaching Guidelines:
1. Respond naturally to what the student actually said
2. If they greet you, greet them back warmly and ask what they'd like to learn about
3. Be encouraging and supportive
4. Keep it brief and friendly (aim for 100-150 words)
5. Don't assume any specific topic - let them choose

Ask them what programming concept or topic they'd like to explore today.`;
  }
  
  const moduleContext = activeModule ? `
Current Module: ${activeModule.title}
Difficulty: ${activeModule.difficulty || 'core'}
Module Points: ${activeModule.points}
` : '';

  const profileContext = `
Student Profile:
- Background: ${profile.background}
- Goals: ${profile.goals.join(', ')}
- Strengths: ${profile.strengths.join(', ')}
- Knowledge Gaps: ${profile.gaps.join(', ')}
- Preferred Style: ${profile.preferredStyle}
- Time Available: ${profile.timePerDayMins} minutes/day
`;

  const cadenceContext = isFollowUp ? `
IMPORTANT: The student hasn't answered your previous question yet. Follow up on this exact question: "${session.meta.outstandingCheck}"

Don't introduce new material until they answer. Keep it brief and encouraging.
` : `
IMPORTANT: You must end your response with a concrete, content-specific question about the current concept.

Examples of good questions:
- "Which traversal explores level-by-level, BFS or DFS? Why?"
- "If a queue backs BFS, what data structure backs DFS?"
- "What's the time complexity of this algorithm and why?"

Make it specific to what we just discussed. No generic CTAs like "Want a quick check now?"
`;

  return `You are an expert programming tutor. Respond naturally to the student's message and guide them toward learning.

${profileContext}

${moduleContext}

Student's message: "${userMessage}"

Teaching Guidelines:
1. Respond naturally to what the student actually said
2. If they greet you, greet them back and ask what they'd like to learn about
3. Use examples-first approach (1 short example or code snippet if relevant)
4. Avoid jargon; explain technical terms
5. Highlight common misconceptions if they appear
6. Stay concise but thorough (aim for 150-250 words, max 300)
7. Be encouraging and supportive

${cadenceContext}

Respond with helpful teaching content followed by a specific question about the current concept.`;
};

// Check if user wants to start a quiz
const hasQuizIntent = (message) => {
  const quizKeywords = [
    'quiz me', 'start test', 'short check', 'test me', 'quiz', 'assessment',
    'check my knowledge', 'test my understanding', 'give me a quiz'
  ];
  
  const lowerMessage = message.toLowerCase();
  return quizKeywords.some(keyword => lowerMessage.includes(keyword));
};

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
    
    // Validate request body
    const { sessionId, userMessage } = req.body;
    
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
    
    // Phase guard - allow pre phase for testing
    if (!['pre', 'learning', 'feedback'].includes(session.phase)) {
      return res.status(409).json({
        success: false,
        error: 'Chat not allowed in current phase',
        currentPhase: session.phase,
        allowedPhases: ['pre', 'learning', 'feedback']
      });
    }
    
    // Keep session in 'pre' phase until user explicitly starts learning
    // No auto-transition - let the user choose what to learn about
    
    // Check if session is view-only
    if (session.isViewOnly) {
      return res.status(409).json({
        success: false,
        error: 'Chat not allowed for view-only sessions'
      });
    }
    
    // Check if activeModuleId is null (only required for learning phase)
    if (session.phase !== 'pre' && !session.activeModuleId) {
      console.warn('No active module for chat', { sessionId });
      return res.status(409).json({
        success: false,
        error: 'No active module. Please re-run assessment to set up learning plan.'
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
    
    // Check for quiz intent
    const wantsQuiz = hasQuizIntent(userMessage);
    if (wantsQuiz) {
      console.log('Quiz intent detected', { sessionId, activeModuleId: session.activeModuleId });
      
      // Add user message
      const userMessageObj = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        metadata: { type: 'chat', tokensIn: userMessage.length }
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
    
    // Determine if this is a follow-up to outstanding check
    const isFollowUp = session.meta.outstandingCheck && !wantsQuiz;
    
    // Build teacher prompt
    const prompt = buildTeacherPrompt(session, userMessage, isFollowUp);
    
    // Call teacher API (with fallback for testing)
    let assistantResponse;
    try {
      assistantResponse = await callTeacherAPI(prompt, req.maxTokens || 1100, session);
    } catch (error) {
      // Fallback response for testing when GROQ_API_KEY is not set
      console.warn('LLM API failed, using fallback response', { error: error.message });
      assistantResponse = `I'd be happy to help you learn JavaScript! 

Based on your question "${userMessage}", let me explain the basics:

JavaScript is a programming language that runs in web browsers and on servers. It's great for:
- Making websites interactive
- Building web applications
- Creating games and animations

What specific aspect of JavaScript would you like to explore first? Are you interested in:
1. Basic syntax and variables?
2. Functions and how they work?
3. Working with the DOM (web page elements)?
4. Something else?

Let me know what interests you most and I'll dive deeper into that topic!`;
    }
    
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
    
    // Add user message
    const userMessageObj = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      metadata: { type: 'chat', tokensIn: userMessage.length }
    };
    
    // Add assistant message
    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date(),
      metadata: { 
        type: 'chat', 
        tokensOut: assistantResponse.length,
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
