const express = require('express');
const router = express.Router();
const pino = require('pino');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const Session = require('../models/Session');
const { 
  quizStartRequestSchema, 
  quizSubmitRequestSchema,
  quizGenerationSchema 
} = require('../validation/quizValidation');
const { updateProgress } = require('../services/progressService');

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

// Quiz generation prompt builder
const buildQuizPrompt = (moduleTitle, difficulty = 'core', questionCount = 4) => {
  return `Generate ${questionCount} multiple choice questions for the module "${moduleTitle}" (difficulty: ${difficulty}).

Requirements:
- Each question must have exactly 4 options (A, B, C, D)
- One correct answer per question
- No "All of the above" or "None of the above" options
- Concise, clear question stems
- Beginner-appropriate difficulty
- Avoid trick wording or ambiguous phrasing
- Focus on practical understanding, not memorization

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "text": "What is the primary purpose of variables in programming?",
      "options": [
        "To store and manipulate data",
        "To display text on screen", 
        "To create loops",
        "To define functions"
      ],
      "correctIndex": 0
    }
  ]
}

Generate exactly ${questionCount} questions.`;
};

// Generate quiz using LLM
const generateQuiz = async (moduleTitle, difficulty, questionCount) => {
  try {
    const groqClient = getGroqClient();
    const prompt = buildQuizPrompt(moduleTitle, difficulty, questionCount);
    
    const response = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert quiz generator. Return only valid JSON matching the provided schema. No prose, no explanations, no markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 800
    });

    const content = response.choices[0].message.content;
    
    // Parse JSON with retry logic
    try {
      const parsed = JSON.parse(content);
      return quizGenerationSchema.parse(parsed);
    } catch (parseError) {
      // Retry with stricter instructions
      const retryPrompt = `Return ONLY valid JSON in this exact format. No prose, no explanations:

{
  "questions": [
    {
      "id": "q1", 
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0
    }
  ]
}

Generate ${questionCount} questions for "${moduleTitle}".`;

      const retryResponse = await groqClient.chat.completions.create({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Return only valid JSON. No prose, no explanations, no markdown.'
          },
          {
            role: 'user',
            content: retryPrompt
          }
        ],
        temperature: 0.3,
        top_p: 0.8,
        max_tokens: 800
      });

      const retryContent = retryResponse.choices[0].message.content;
      const retryParsed = JSON.parse(retryContent);
      return quizGenerationSchema.parse(retryParsed);
    }
  } catch (error) {
    throw new Error(`QUIZ_GENERATION_ERROR: ${error.message}`);
  }
};


// POST /v1/quiz/start - Start a quiz for a module
router.post('/v1/quiz/start', addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    req.logger.info('Quiz start request received', { body: req.body });
    
    // Validate request body
    const validatedData = quizStartRequestSchema.parse(req.body);
    const { sessionId, moduleId: requestedModuleId } = validatedData;
    
    // Load session
    const session = await Session.findById(sessionId);
    if (!session) {
      req.logger.warn('Session not found', { sessionId });
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Phase guard
    if (!['learning', 'feedback'].includes(session.phase)) {
      req.logger.warn('Illegal phase for quiz start', { 
        sessionId, 
        phase: session.phase 
      });
      return res.status(409).json({
        success: false,
        error: 'Quiz not allowed in current phase',
        currentPhase: session.phase,
        allowedPhases: ['learning', 'feedback']
      });
    }

    // Resolve module ID
    const moduleId = requestedModuleId || session.activeModuleId;
    if (!moduleId) {
      req.logger.warn('No module ID provided or active', { sessionId, requestedModuleId });
      return res.status(409).json({
        success: false,
        error: 'No module ID provided and no active module'
      });
    }
    
    // Find module in plan
    const module = session.plan.find(m => m.id === moduleId);
    if (!module) {
      req.logger.warn('Module not found in plan', { sessionId, moduleId });
      return res.status(409).json({
        success: false,
        error: 'Module not found in session plan'
      });
    }
    
    // Phase guard
    if (!['learning', 'feedback'].includes(session.phase)) {
      req.logger.warn('Illegal phase for quiz', { sessionId, phase: session.phase });
      return res.status(409).json({
        success: false,
        error: 'Quiz not allowed in current phase',
        currentPhase: session.phase,
        allowedPhases: ['learning', 'feedback']
      });
    }
    
    // Check for existing draft attempt
    const existingDraft = session.quizAttempts.find(
      attempt => attempt.moduleId === moduleId && attempt.status === 'draft'
    );
    
    if (existingDraft) {
      req.logger.info('Returning existing draft quiz', { sessionId, moduleId, attemptId: existingDraft.id });
      return res.json({
        success: true,
        questions: existingDraft.items
      });
    }
    
    // Generate new quiz
    const questionCount = Math.floor(Math.random() * 3) + 3; // 3-5 questions
    const difficulty = module.difficulty || 'core';
    
    req.logger.info('Generating new quiz', { sessionId, moduleId, questionCount, difficulty });
    
    const quizData = await generateQuiz(module.title, difficulty, questionCount);
    
    // Calculate attempt number
    const previousAttempts = session.quizAttempts.filter(
      attempt => attempt.moduleId === moduleId
    );
    const attemptNo = previousAttempts.length + 1;
    
    // Create draft attempt
    const attemptId = uuidv4();
    const draftAttempt = {
      id: attemptId,
      moduleId,
      attemptNo,
      status: 'draft',
      items: quizData.questions,
      answers: [],
      createdAt: new Date()
    };
    
    session.quizAttempts.push(draftAttempt);
    session.phase = 'quizzing';
    await session.save();
    
    req.logger.info('Quiz generated successfully', {
      sessionId,
      moduleId,
      attemptNo,
      questionCount: quizData.questions.length,
      duration: Date.now() - startTime
    });
    
    res.json({
      success: true,
      questions: quizData.questions
    });
    
  } catch (error) {
    req.logger.error('Quiz start failed', {
      sessionId: req.body.sessionId,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    if (error.message.includes('QUIZ_GENERATION_ERROR')) {
      return res.status(502).json({
        success: false,
        error: 'Quiz generation service unavailable'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'test' ? error.message : undefined
    });
  }
});

// POST /v1/quiz/submit - Submit quiz answers
router.post('/v1/quiz/submit', addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    req.logger.info('Quiz submit request received', { body: req.body });
    
    // Validate request body
    const validatedData = quizSubmitRequestSchema.parse(req.body);
    const { sessionId, moduleId, answers } = validatedData;
    
    // Load session
    const session = await Session.findById(sessionId);
    if (!session) {
      req.logger.warn('Session not found', { sessionId });
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Phase guard
    if (session.phase !== 'quizzing') {
      req.logger.warn('Illegal phase for quiz submit', { 
        sessionId, 
        phase: session.phase 
      });
      return res.status(409).json({
        success: false,
        error: 'Quiz submit not allowed in current phase',
        currentPhase: session.phase,
        requiredPhase: 'quizzing'
      });
    }
    
    // Find the latest draft attempt for this module
    const latestAttempt = session.quizAttempts
      .filter(attempt => attempt.moduleId === moduleId && attempt.status === 'draft')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    
    if (!latestAttempt) {
      req.logger.warn('No draft attempt found', { sessionId, moduleId });
      return res.status(409).json({
        success: false,
        error: 'No draft quiz found for this module. Please start a new quiz.'
      });
    }
    
    // Validate answers match the quiz items
    const quizItemIds = latestAttempt.items.map(item => item.id);
    const answerIds = answers.map(answer => answer.id);
    
    if (quizItemIds.length !== answerIds.length || 
        !quizItemIds.every(id => answerIds.includes(id))) {
      req.logger.warn('Answer mismatch with quiz items', { sessionId, moduleId });
      return res.status(409).json({
        success: false,
        error: 'Answers do not match quiz questions. Please restart the quiz.'
      });
    }
    
    // Score the quiz
    let numCorrect = 0;
    const feedbackItems = [];
    
    answers.forEach(answer => {
      const item = latestAttempt.items.find(item => item.id === answer.id);
      if (item && answer.userIndex === item.correctIndex) {
        numCorrect++;
      } else if (item) {
        feedbackItems.push({
          question: item.text,
          correctAnswer: item.options[item.correctIndex],
          userAnswer: item.options[answer.userIndex] || 'No answer'
        });
      }
    });
    
    const total = answers.length;
    const scorePct = Math.round((numCorrect / total) * 100);
    const passed = scorePct >= 70;
    
    // Find module to get points
    const module = session.plan.find(m => m.id === moduleId);
    const modulePoints = module ? module.points : 0;
    
    req.logger.info('Module points debug', {
      sessionId,
      moduleId,
      module,
      modulePoints
    });
    
    // Check if this module was already passed (for idempotency)
    const previousPassedAttempts = session.quizAttempts.filter(
      attempt => attempt.moduleId === moduleId && 
                attempt.status === 'submitted' && 
                attempt.passed
    );
    
    const pointsEarned = (passed && previousPassedAttempts.length === 0) ? modulePoints : 0;
    
    // Debug logging
    req.logger.info('Points calculation debug', {
      sessionId,
      moduleId,
      passed,
      previousPassedAttempts: previousPassedAttempts.length,
      modulePoints,
      pointsEarned
    });
    
    // Update the attempt
    latestAttempt.status = 'submitted';
    latestAttempt.answers = answers;
    latestAttempt.scorePct = scorePct;
    latestAttempt.passed = passed;
    latestAttempt.pointsEarned = pointsEarned;
    latestAttempt.submittedAt = new Date();
    
    // Update module status if passed (before progress update)
    if (passed) {
      module.status = 'passed';
      
      // Advance to next module
      const currentIndex = session.plan.findIndex(m => m.id === moduleId);
      const nextModule = session.plan[currentIndex + 1];
      
      if (nextModule) {
        nextModule.status = 'in_progress';
        session.activeModuleId = nextModule.id;
      } else {
        session.activeModuleId = null;
      }
    }
    
    // Update progress using the new service (after marking module as passed)
    // If all modules are passed, force recalculation
    const allModulesPassed = session.plan.every(m => m.status === 'passed');
    const progressResult = updateProgress(session, { 
      moduleId, 
      pointsDelta: pointsEarned,
      forceRecalc: allModulesPassed
    });
    
    // Only set phase to feedback if not completed
    if (!progressResult.completed) {
      session.phase = 'feedback';
    }
    
    await session.save();
    
    // Generate feedback
    let feedbackMarkdown = '';
    
    if (feedbackItems.length > 0) {
      feedbackMarkdown += feedbackItems.map(item => 
        `**Incorrect:** ${item.question}\n- Correct answer: ${item.correctAnswer}\n- Your answer: ${item.userAnswer}`
      ).join('\n\n') + '\n\n';
    }
    
    if (passed) {
      feedbackMarkdown += `**You passed — move on to the next module.**`;
    } else {
      feedbackMarkdown += `**Not yet — retry this module.**`;
    }
    
    req.logger.info('Quiz submitted successfully', {
      sessionId,
      moduleId,
      attemptNo: latestAttempt.attemptNo,
      scorePct,
      passed,
      pointsEarned,
      duration: Date.now() - startTime
    });
    
    const responseData = {
      success: true,
      data: {
        passed,
        scorePct,
        pointsEarned,
        feedbackMarkdown
      }
    };
    
    
    req.logger.info('Quiz submit response', {
      sessionId,
      responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    req.logger.error('Quiz submit failed', {
      sessionId: req.body.sessionId,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'test' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'test' ? error.stack : undefined
    });
  }
});

module.exports = router;
