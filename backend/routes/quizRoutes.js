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
const { buildQuizFailureAnalysisPrompt } = require('../prompts/assessment_analyzer');
const { getGroqClient } = require('../lib/llmClient');

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

// Quiz generation prompt builder
const buildQuizPrompt = (moduleTitle, difficulty = 'core', questionCount = 7) => {
  return `Generate ${questionCount} questions for the module "${moduleTitle}" (difficulty: ${difficulty}).

Requirements:
- Mix question types: Multiple Choice (MCQ), True/False, and Short Answer
- MCQ questions: exactly 4 options (A, B, C, D), one correct answer
- True/False questions: simple true or false format
- Short Answer questions: open-ended questions that test understanding
- No "All of the above" or "None of the above" options for MCQ
- Concise, clear question stems
- Difficulty-appropriate questions
- Avoid trick wording or ambiguous phrasing
- Focus on practical understanding, not memorization
- Generate 5-10 questions total (you have ${questionCount} questions to generate)

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "text": "What is the primary purpose of variables in programming?",
      "options": ["To store and manipulate data", "To display text on screen", "To create loops", "To define functions"],
      "correctIndex": 0
    },
    {
      "id": "q2",
      "type": "true_false",
      "text": "Python is a dynamically typed language.",
      "correctAnswer": true
    },
    {
      "id": "q3",
      "type": "short_answer",
      "text": "Explain the difference between a list and a tuple in Python.",
      "correctAnswer": "A list is mutable (can be modified) while a tuple is immutable (cannot be modified)."
    }
  ]
}

Generate exactly ${questionCount} questions with a good mix of question types.`;
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
      try {
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
      } catch (retryError) {
        // Schema validation or retry parse failed → treat as LLM output invalid
        throw new Error(`QUIZ_LLM_OUTPUT_INVALID: ${retryError.message}`);
      }
    }
  } catch (error) {
    // Re-throw LLM output errors, wrap API errors
    if (error.message.includes('QUIZ_LLM_OUTPUT_INVALID')) {
      throw error;
    }
    throw new Error(`QUIZ_API_ERROR: ${error.message}`);
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
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }
    
    // Enforce session boundaries - reject if in pre/assessing phase or plan is empty
    if (['pre', 'assessing'].includes(session.phase) || !session.plan || session.plan.length === 0) {
      req.logger.warn('Session not ready for quiz', { 
        sessionId, 
        phase: session.phase,
        hasPlan: !!session.plan
      });
      return res.status(409).json({
        success: false,
        error: 'Quiz not allowed in current phase',
        code: 'ILLEGAL_PHASE',
        currentPhase: session.phase,
        allowedPhases: ['learning', 'feedback'],
        hint: 'Please complete assessment first to create a learning plan'
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
        code: 'ILLEGAL_PHASE',
        currentPhase: session.phase,
        allowedPhases: ['learning', 'feedback']
      });
    }

    // Resolve module ID
    const moduleId = requestedModuleId || session.activeModuleId;
    if (!moduleId) {
      req.logger.warn('No module ID provided or active', { sessionId, requestedModuleId });
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          moduleId: ['Module ID is required']
        }
      });
    }
    
    // Find module in plan
    const module = session.plan.find(m => m.id === moduleId);
    if (!module) {
      req.logger.warn('Module not found in plan', { sessionId, moduleId });
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found',
        details: {
          moduleId: ['Module not found in session plan']
        }
      });
    }
    
    // Phase guard
    if (!['learning', 'feedback'].includes(session.phase)) {
      req.logger.warn('Illegal phase for quiz', { sessionId, phase: session.phase });
      return res.status(409).json({
        success: false,
        error: 'Quiz not allowed in current phase',
        code: 'ILLEGAL_PHASE',
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
    
    // Generate new quiz - 5-10 dynamic questions
    const questionCount = Math.floor(Math.random() * 6) + 5; // 5-10 questions
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
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors
      });
    }
    
    // LLM output validation failures → 502 LLM_PROVIDER_ERROR
    if (error.message.includes('QUIZ_LLM_OUTPUT_INVALID') || 
        error.message.includes('QUIZ_API_ERROR')) {
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
        code: 'NOT_FOUND',
        message: 'Resource not found'
      });
    }

    // Enforce session boundaries
    if (['pre', 'assessing'].includes(session.phase) || !session.plan || session.plan.length === 0) {
      req.logger.warn('Session not ready for quiz submit', { 
        sessionId, 
        phase: session.phase,
        hasPlan: !!session.plan
      });
      return res.status(409).json({
        success: false,
        error: 'Quiz not allowed in current phase',
        code: 'ILLEGAL_PHASE',
        currentPhase: session.phase,
        allowedPhases: ['learning', 'feedback']
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
        code: 'ILLEGAL_PHASE',
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
        code: 'ILLEGAL_PHASE',
        message: 'No draft quiz found for this module. Please start a new quiz.'
      });
    }
    
    // Validate answers match the quiz items
    const quizItemIds = latestAttempt.items.map(item => item.id);
    const answerIds = answers.map(answer => answer.id);
    
    if (quizItemIds.length !== answerIds.length || 
        !quizItemIds.every(id => answerIds.includes(id))) {
      req.logger.warn('Answer mismatch with quiz items', { sessionId, moduleId });
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          answers: ['Answers do not match quiz questions. Please restart the quiz.']
        }
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
        
        // Reset milestone tracking for new module
        if (!session.meta) {
          session.meta = {};
        }
        session.meta.currentMilestoneIndex = 0;
        session.meta.milestoneBeingTaught = false;
        session.meta.outstandingCheck = null;
        session.meta.milestoneRetryCount = {}; // Clear retry counts for new module
        
        req.logger.info('Moving to next module', { 
          sessionId, 
          previousModuleId: moduleId,
          nextModuleId: nextModule.id,
          nextModuleTitle: nextModule.title
        });
      } else {
        session.activeModuleId = null;
        // All modules completed
        req.logger.info('All modules completed', { sessionId });
      }
    } else {
      // Quiz failed - use LLM to identify which milestones need review
      try {
        const groqClient = getGroqClient();
        
        // Prepare quiz results for analysis
        const quizResults = answers.map(answer => {
          const item = latestAttempt.items.find(item => item.id === answer.id);
          return {
            question: item?.text || '',
            correct: answer.userIndex === item?.correctIndex,
            correctAnswer: item ? item.options[item.correctIndex] : '',
            userAnswer: item ? (item.options[answer.userIndex] || 'No answer') : 'No answer'
          };
        });
        
        const analysisPrompt = buildQuizFailureAnalysisPrompt(quizResults, module.milestones || []);
        
        const analysisResponse = await groqClient.chat.completions.create({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are an expert educational assessment AI. Return ONLY valid JSON matching the schema. No prose, no markdown blocks, no explanations outside the JSON.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: 400,
          response_format: { type: "json_object" }
        });
        
        const analysisData = JSON.parse(analysisResponse.choices[0].message.content);
        const milestonesToReview = analysisData.milestonesToReview || [];
        
        // Store milestones to review in meta
        if (!session.meta) {
          session.meta = {};
        }
        session.meta.milestonesToReview = milestonesToReview;
        
        req.logger.info('LLM quiz failure analysis', {
          sessionId,
          moduleId,
          scorePct,
          milestonesToReview,
          reasoning: analysisData.reasoning,
          focusAreas: analysisData.focusAreas
        });
        
        // Reset only the specific milestones that need review
        if (milestonesToReview.length > 0 && module.milestones) {
          if (!session.meta.milestoneRetryCount) {
            session.meta.milestoneRetryCount = {};
          }
          
          milestonesToReview.forEach(milestoneIndex => {
            if (module.milestones[milestoneIndex]) {
              // Mark milestone as incomplete
              module.milestones[milestoneIndex].completed = false;
              
              // Remove from completed milestones array
              if (module.completedMilestones) {
                const index = module.completedMilestones.indexOf(milestoneIndex);
                if (index > -1) {
                  module.completedMilestones.splice(index, 1);
                }
              }
              
              // Reset retry count for these milestones
              session.meta.milestoneRetryCount[milestoneIndex] = 0;
            }
          });
          
          // Set current milestone to the first milestone that needs review
          const firstMilestoneToReview = Math.min(...milestonesToReview);
          session.meta.currentMilestoneIndex = firstMilestoneToReview;
          session.meta.milestoneBeingTaught = false;
          session.meta.outstandingCheck = null;
          
          req.logger.info('Reset milestones for review', {
            sessionId,
            moduleId,
            milestonesToReview,
            currentMilestoneIndex: session.meta.currentMilestoneIndex
          });
        } else {
          // If LLM couldn't identify specific milestones, reset all (fallback)
          if (module.milestones) {
            module.milestones.forEach((m, i) => {
              m.completed = false;
              if (!session.meta) {
                session.meta = {};
              }
              if (!session.meta.milestoneRetryCount) {
                session.meta.milestoneRetryCount = {};
              }
              session.meta.milestoneRetryCount[i] = 0;
            });
            session.meta.currentMilestoneIndex = 0;
            session.meta.milestoneBeingTaught = false;
            session.meta.outstandingCheck = null;
            
            if (module.completedMilestones) {
              module.completedMilestones = [];
            }
            
            req.logger.info('LLM analysis failed - reset all milestones (fallback)', {
              sessionId,
              moduleId
            });
          }
        }
      } catch (error) {
        req.logger.error('LLM quiz failure analysis failed', {
          sessionId,
          moduleId,
          error: error.message
        });
        
        // Fallback: Reset all milestones if LLM analysis fails
        if (module.milestones) {
          module.milestones.forEach(m => {
            m.completed = false;
          });
          if (!session.meta) {
            session.meta = {};
          }
          session.meta.currentMilestoneIndex = 0;
          session.meta.milestoneBeingTaught = false;
          session.meta.outstandingCheck = null;
          
          if (module.completedMilestones) {
            module.completedMilestones = [];
          }
          
          req.logger.info('Fallback: reset all milestones', {
            sessionId,
            moduleId
          });
        }
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
    
    // Set phase based on quiz result
    if (passed) {
      // If passed, move to feedback phase (brief feedback before next module)
      if (!progressResult.completed) {
        session.phase = 'feedback';
      }
    } else {
      // If failed, go back to learning phase to retry specific milestones
      session.phase = 'learning';
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
      // Include which milestones need review if LLM identified them
      const milestonesToReview = session.meta?.milestonesToReview || [];
      if (milestonesToReview.length > 0 && module.milestones) {
        const milestoneNames = milestonesToReview
          .map(i => `${i + 1}. ${module.milestones[i]?.text || 'Milestone ' + (i + 1)}`)
          .join(', ');
        feedbackMarkdown += `**Score: ${scorePct}% - Need to review the following milestones:**\n${milestoneNames}\n\nWe'll go through these topics again with the feedback and assessment loop, then retake the quiz.`;
      } else {
        feedbackMarkdown += `**Score: ${scorePct}% - Need to review this module. Let's go through the milestones again.**`;
      }
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
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
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
