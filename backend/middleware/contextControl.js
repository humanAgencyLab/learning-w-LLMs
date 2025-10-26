const { Groq } = require('groq-sdk');
const Session = require('../models/Session');
const logger = require('../utils/logger');

// Environment-driven thresholds with sane defaults
const SUMMARIZE_EVERY_N_TURNS = parseInt(process.env.SUMMARIZE_EVERY_N_TURNS) || 40;
const SUMMARIZE_CHUNK_SIZE = parseInt(process.env.SUMMARIZE_CHUNK_SIZE) || 20;
const SUMMARY_MAX_TOKENS = parseInt(process.env.SUMMARY_MAX_TOKENS) || 200;
const TEACHER_MAX_TOKENS = parseInt(process.env.TEACHER_MAX_TOKENS) || 1100;
const ASSESSMENT_MAX_TOKENS = parseInt(process.env.ASSESSMENT_MAX_TOKENS) || 500;

// Groq client setup (lazy initialization to avoid test conflicts)
let groq;
const getGroqClient = () => {
  // Force reload in test environment to pick up new mocks
  if (process.env.NODE_ENV === 'test') {
    groq = undefined;
  }
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY || 'test-key'
    });
  }
  return groq;
};

// Export reset function for testing
const resetGroqClient = () => {
  groq = undefined;
};

/**
 * Context control middleware for chat endpoints
 * Handles summarization and token management
 */
const contextControl = async (req, res, next) => {
  const startTime = Date.now();
  const requestId = req.requestId;
  console.log('Context control middleware called with path:', req.path);
  
  try {
    // Only apply to chat endpoints
    if (!req.path.includes('/v1/chat')) {
      console.log('Not a chat endpoint, skipping context control');
      return next();
    }

    // Load session from request body
    const { sessionId } = req.body;
    if (!sessionId) {
      return next();
    }

    const session = await Session.findById(sessionId);
    if (!session || !session.messages) {
      return next();
    }

    // Pass session to request object for chat route
    req.session = session;

    const messages = session.messages;
    const turnsBefore = messages.length;
    
    // Filter out general/admin messages when summarizing to maintain learning context
    const learningMessages = messages.filter(msg => {
      const intent = msg.metadata?.intent;
      // Include learning messages and messages without intent metadata (legacy)
      return intent === 'learning' || !intent;
    });
    
    // Check if we need to summarize (using learning messages only)
    const shouldSummarize = shouldTriggerSummarization(session, learningMessages);
    console.log('Should summarize:', shouldSummarize, 'Learning messages length:', learningMessages.length, 'Total messages:', messages.length, 'SUMMARIZE_EVERY_N_TURNS:', SUMMARIZE_EVERY_N_TURNS);
    
    if (shouldSummarize) {
      logger.info({
        requestId,
        sessionId: session._id,
        turnsBefore,
        reason: 'Triggering summarization'
      }, 'Context control: Summarizing conversation');

      // Perform summarization
      const summaryResult = await summarizeConversation(session, learningMessages, requestId);
      
      console.log('Summarization result:', summaryResult.success, 'messages after:', summaryResult.summarizedMessages?.length);
      
      if (summaryResult.success) {
        console.log('Summarization successful, updating session...');
        // Combine summarized learning messages with non-learning messages
        const generalMessages = messages.filter(msg => {
          const intent = msg.metadata?.intent;
          return intent === 'general' || intent === 'admin';
        });
        
        // Build final message array: [summary, ...remaining learning messages, ...general messages in chronological order]
        const remainingLearningMessages = learningMessages.slice(SUMMARIZE_CHUNK_SIZE);
        session.messages = [
          summaryResult.summarizedMessages[0], // The summary
          ...remainingLearningMessages, // Remaining learning messages
          ...generalMessages // General messages (preserve chronology)
        ];
        
        console.log('Final session.messages length:', session.messages.length, 'summary message:', session.messages[0]?.role);
        
        // Ensure meta exists and set summaryVersion starting at 1
        session.meta = session.meta || {};
        session.meta.summaryVersion = session.meta.summaryVersion || 0;
        session.meta.summaryVersion += 1; // Start at 1 if first summary
        session.meta.summarizedUpToIndex = summaryResult.summarizedUpToIndex;

        // Save the updated session
        await session.save();
        console.log('Session saved successfully');

        // Add summary note to response
        req.contextSummary = {
          summarized: true,
          summaryNote: "Context compressed for continuity",
          turnsReduced: turnsBefore - summaryResult.summarizedMessages.length
        };

        logger.info({
          requestId,
          sessionId: session._id,
          turnsBefore,
          turnsAfter: summaryResult.summarizedMessages.length,
          summarizedChunk: summaryResult.summarizedChunk,
          summaryVersion: session.meta.summaryVersion
        }, 'Context control: Summarization completed');
      } else {
        logger.warn({
          requestId,
          sessionId: session._id,
          error: summaryResult.error
        }, 'Context control: Summarization failed, continuing with original messages');
      }
    }

    // Check for context limits and apply safety clamps
    const contextCheck = await checkContextLimits(session, req.route?.path, requestId);
    
    if (contextCheck.exceeded) {
      logger.warn({
        requestId,
        sessionId: session._id,
        contextCheck
      }, 'Context control: Context limit exceeded');

      return res.status(507).json({
        success: false,
        code: 'CONTEXT_LIMIT',
        message: 'Context window exceeded',
        hint: 'Your conversation is too long. Try starting a new session.'
      });
    }

    // Set appropriate max_tokens based on route
    req.maxTokens = contextCheck.maxTokens;
    
    next();
  } catch (error) {
    console.error('Context control middleware error:', error);
    logger.error({
      requestId,
      sessionId: req.body?.sessionId,
      error: error.message,
      stack: error.stack
    }, 'Context control: Middleware error');

    next(error);
  }
};

/**
 * Determine if summarization should be triggered
 */
function shouldTriggerSummarization(session, messages) {
  // Don't summarize if there's an outstanding check
  if (session.meta?.outstandingCheck) {
    return false;
  }

  // Check if we have enough turns to summarize
  if (messages.length < SUMMARIZE_EVERY_N_TURNS) {
    return false;
  }

  // Check if we've already summarized recently
  const lastSummaryIndex = session.meta?.summarizedUpToIndex || 0;
  const newTurnsSinceLastSummary = messages.length - lastSummaryIndex;
  
  return newTurnsSinceLastSummary >= SUMMARIZE_CHUNK_SIZE;
}

/**
 * Summarize a chunk of conversation turns
 */
async function summarizeConversation(session, messages, requestId) {
  try {
    // Get the oldest chunk to summarize
    const chunkToSummarize = messages.slice(0, SUMMARIZE_CHUNK_SIZE);
    const remainingMessages = messages.slice(SUMMARIZE_CHUNK_SIZE);
    
    // Find the current module info
    const currentModule = session.plan?.find(m => m.id === session.activeModuleId);
    const moduleTitle = currentModule?.title || 'Current Module';
    
    // Build summarization prompt
    const summarizationPrompt = buildSummarizationPrompt(
      chunkToSummarize,
      session.topic,
      session.activeModuleId,
      moduleTitle
    );

    // Call LLM for summarization
    const groqClient = getGroqClient();
    console.log('Calling Groq API for summarization...');
    const summaryResponse = await groqClient.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: summarizationPrompt
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: SUMMARY_MAX_TOKENS,
      top_p: 0.9
    });

    const summaryContent = summaryResponse.choices[0]?.message?.content?.trim();
    
    if (!summaryContent) {
      throw new Error('Empty summary response from LLM');
    }

    // Create system summary message with stable schema
    const uuid = require('uuid');
    const summaryMessage = {
      id: uuid.v4(),
      role: 'system',
      content: summaryContent,
      timestamp: Date.now(), // Number in milliseconds
      metadata: {
        tokens: summaryResponse.usage?.completion_tokens || 0,
        summaryVersion: (session.meta?.summaryVersion || 0) + 1
      }
    };

    // Normalize remaining messages to match schema
    const normalizedRemainingMessages = remainingMessages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || new Date(msg.ts || Date.now()),
      metadata: msg.metadata || {}
    }));

    // Combine summary with remaining messages
    const summarizedMessages = [summaryMessage, ...normalizedRemainingMessages];

    return {
      success: true,
      summarizedMessages,
      summarizedChunk: SUMMARIZE_CHUNK_SIZE,
      summarizedUpToIndex: SUMMARIZE_CHUNK_SIZE
    };
  } catch (error) {
    logger.error({
      requestId,
      sessionId: session._id,
      error: error.message
    }, 'Context control: Summarization failed');

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Build the summarization prompt
 */
function buildSummarizationPrompt(messages, topic, activeModuleId, moduleTitle) {
  const conversationText = messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n');

  return `You are summarizing a learning conversation to preserve context while reducing token usage.

Topic: ${topic}
Current Module: ${moduleTitle} (${activeModuleId})

Conversation to summarize:
${conversationText}

Create a concise system summary with these exact bullet points (≤200 tokens total):

• Concepts mastered: [list key concepts the student has learned]
• Misconceptions resolved: [list any misconceptions that were corrected]
• Open questions: [list any unanswered questions or areas of confusion]
• Next micro-goal: [suggest the next small learning objective]

Be factual and concise. Avoid re-teaching content. No placeholders like "TBD".`;
}

/**
 * Check context limits and determine max tokens
 */
async function checkContextLimits(session, routePath, requestId) {
  const messages = session.messages || [];
  const totalTokens = messages.reduce((sum, msg) => sum + (msg.metadata?.tokens || 0), 0);
  
  // Determine max tokens based on route
  let maxTokens;
  if (routePath?.includes('/v1/assessment')) {
    maxTokens = ASSESSMENT_MAX_TOKENS;
  } else if (routePath?.includes('/v1/chat')) {
    maxTokens = TEACHER_MAX_TOKENS;
  } else {
    maxTokens = 1000; // Default
  }

  // Estimate prompt size (rough calculation)
  const estimatedPromptTokens = Math.ceil(totalTokens * 1.2); // 20% overhead
  const estimatedTotalTokens = estimatedPromptTokens + maxTokens;

  // Check against model limits (assuming 8K context for llama-3.1-8b-instant)
  const modelContextLimit = 8000;
  const safetyMargin = 1000; // Leave room for system prompts
  const effectiveLimit = modelContextLimit - safetyMargin;

  const exceeded = estimatedTotalTokens > effectiveLimit;

  if (exceeded) {
    logger.warn({
      requestId,
      sessionId: session._id,
      estimatedTotalTokens,
      effectiveLimit,
      totalTokens,
      maxTokens
    }, 'Context control: Context limit exceeded');
  }

  return {
    exceeded,
    maxTokens,
    estimatedTotalTokens,
    effectiveLimit,
    totalTokens
  };
}

module.exports = {
  contextControl,
  resetGroqClient,
  SUMMARIZE_EVERY_N_TURNS,
  SUMMARIZE_CHUNK_SIZE,
  SUMMARY_MAX_TOKENS,
  TEACHER_MAX_TOKENS,
  ASSESSMENT_MAX_TOKENS
};
