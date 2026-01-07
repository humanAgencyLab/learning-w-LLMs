const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { z } = require('zod');
const Session = require('../models/Session');
const { chatRequestSchema } = require('../validation/chatValidation');
const { validateInput } = require('../middleware/validationHardening');
const { contextControl } = require('../middleware/contextControl');
const { ERROR_RESPONSES } = require('../middleware/validationHardening');
const { buildTeacherPrompt } = require('../prompts/teacher_prompt');
const { getGroqClient } = require('../lib/llmClient');
const { buildIntentAnalysisPrompt } = require('../prompts/intent_analyzer');
const { buildAssessmentAnalysisPrompt } = require('../prompts/assessment_analyzer');
const { buildConversationDecisionPrompt } = require('../prompts/conversation_manager');
const { updateContextSummary } = require('../prompts/context_summarizer');
const { updateProgress } = require('../services/progressService');
const { callTeacherAPI } = require('../services/teacherService');
const { requireAuth, requireOwnership } = require('../middleware/auth');

// Extract question from assistant response
const extractQuestion = (response) => {
  const questionMatch = response.match(/([^.!?]*\?[^.!?]*)/);
  if (questionMatch) {
    return questionMatch[1].trim();
  }
  return null;
};

// POST /v1/chat - Teacher chat endpoint (requires authentication)
router.post('/v1/chat', requireAuth, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('Chat request received', { body: req.body });
    
    // Read sanitized message if available, otherwise use body
    const { sessionId, mode: requestedMode } = req.body;
    const userMessage = req.sanitized?.message || req.body.userMessage;
    
    // Validate sessionId exists
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Session ID is required',
        details: {
          sessionId: ['Session ID is required']
        }
      });
    }
    
    // Validate userMessage exists
    if (!userMessage || userMessage.trim().length === 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'User message is required',
        details: {
          userMessage: ['User message cannot be empty']
        }
      });
    }
    
    // Load session
    let session;
    try {
      // Validate MongoDB ObjectId format
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Invalid session ID format',
          details: {
            sessionId: ['Invalid session ID format']
          }
        });
      }
      
      session = await Session.findById(sessionId);
    } catch (error) {
      // Invalid ObjectId format or database error
      console.error('Error loading session:', error);
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Invalid session ID',
        details: {
          sessionId: ['Invalid session ID format']
        }
      });
    }
    
    if (!session) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Session not found'
      });
    }
    
    console.log('Session loaded successfully', { 
      sessionId, 
      phase: session.phase,
      topic: session.topic,
      mode: session.mode,
      requestedMode
    });
    
    // Update session mode if frontend requests a different mode
    if (requestedMode && requestedMode !== session.mode) {
      console.log('Updating session mode from', session.mode, 'to', requestedMode);
      session.mode = requestedMode;
      await session.save();
    }
    
    // Handle revision mode - if in revision mode and pre phase, generate revision quiz
    if (session.mode === 'reviewing' && session.phase === 'pre') {
      // Extract topic from user message
      // Remove common phrases like "I want to review", "I want to revise", "Review", etc.
      let topic = userMessage.trim();
      
      // Remove common revision-related prefixes (case-insensitive)
      const revisionPrefixes = [
        /^i\s+want\s+to\s+(review|revise|practice)\s+/i,
        /^i\s+(want\s+to\s+)?(review|revise|practice)\s+/i,
        /^(let\s+me\s+)?(review|revise|practice)\s+/i,
        /^(i\s+)?(review|revise|practice)\s+/i,
        /^revision\s+(of|for)?\s*/i,
        /^revise\s+(the\s+)?(topic\s+)?(of\s+)?/i,
        /^review\s+(the\s+)?(topic\s+)?(of\s+)?/i
      ];
      
      for (const prefix of revisionPrefixes) {
        if (prefix.test(topic)) {
          topic = topic.replace(prefix, '').trim();
          break;
        }
      }
      
      // Clean up any remaining articles or extra words at the start
      topic = topic.replace(/^(the\s+|a\s+|an\s+)/i, '').trim();
      
      if (topic && topic.length > 0) {
        // Capitalize first letter of topic
        const formattedTopic = topic.charAt(0).toUpperCase() + topic.slice(1);
        
        // Add user message to session
        const userMsg = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          metadata: { intent: 'revision', phaseAtSend: 'pre' }
        };
        session.messages.push(userMsg);
        session.topic = formattedTopic;
        // Set chatTitle to just the topic (without "Revision:" prefix - that's handled in UI)
        session.chatTitle = formattedTopic;
        // Don't set phase to 'quizzing' yet - let the revision quiz endpoint handle it
        // This ensures the revision quiz endpoint can properly validate and set up the quiz
        await session.save();
        
        return res.json({
          success: true,
          data: {
            message: `I'll generate a revision quiz for "${formattedTopic}".`,
            nextAction: 'START_REVISION_QUIZ',
            topic: formattedTopic,
            isRevision: true
          }
        });
      }
    }

    // Handle 'pre' phase - LLM analyzes intent and decides action
        if (session.phase === 'pre') {
        // If we've already entered quizzing or the user explicitly asks to start the quiz
        const wantsQuiz = typeof userMessage === 'string' && /start\s+quiz/i.test(userMessage);
        if ((session.phase === 'quizzing' || session.phase === 'quiz') && (wantsQuiz || !session.meta?.milestoneBeingTaught)) {
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'requesting_quiz', phaseAtSend: session.phase }
          };

          session.messages.push(userMessageObj);
          session.meta.milestoneBeingTaught = false;
          session.meta.outstandingCheck = null;
          session.meta.countSinceLastCheck = 0;
          session.phase = 'quizzing';
          await session.save();

          return res.json({
            success: true,
            data: {
              message: "Great! Let's test your understanding of this module.",
              nextAction: 'START_QUIZ',
              moduleId: session.activeModuleId,
              tokensIn: userMessage.length,
              tokensOut: 0,
              hadCheckInReply: false,
              followedUpOutstanding: false
            }
          });
        }

      console.log('Handling pre-phase chat with LLM intent analysis', { sessionId, userMessage });
      
      const groqClient = getGroqClient();
      
      // Build LLM prompt for intent analysis - include outstanding question context
      const intentPrompt = buildIntentAnalysisPrompt(userMessage, {
        phase: session.phase,
        messages: session.messages,
        profile: session.profile,
        meta: session.meta // Include meta to pass outstanding question
      });
      
      try {
        // Call LLM to analyze intent and decide action
        const intentResponse = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are an intelligent learning assistant. Analyze user messages and return ONLY valid JSON matching the required schema. No markdown, no code fences, no explanations outside the JSON.'
            },
            {
              role: 'user',
              content: intentPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 300,
          response_format: { type: "json_object" }
        });

        let intentAnalysis;
        try {
          const responseText = intentResponse.choices[0].message.content.trim();
          intentAnalysis = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse LLM intent analysis:', parseError);
          // Fallback: treat as learning intent if message contains common topics
          const lowerMsg = userMessage.toLowerCase();
          const hasCommonTopic = ['piano', 'guitar', 'python', 'javascript', 'data', 'structure', 'algorithm', 'react', 'piano', 'music'].some(topic => lowerMsg.includes(topic));
          intentAnalysis = {
            intent: hasCommonTopic ? 'learning' : 'general',
            action: hasCommonTopic ? 'trigger_assessment' : 'respond_naturally',
            topic: hasCommonTopic ? userMessage : '',
            confidence: 'low',
            isFollowUpToOutstanding: false, // Default to false in fallback
            response: hasCommonTopic ? '' : "Hi! I'm here to help you learn. What would you like to learn about today?"
          };
        }

        console.log('LLM Intent Analysis:', intentAnalysis);

        // Handle based on LLM's decision
        if (intentAnalysis.intent === 'learning' && intentAnalysis.action === 'trigger_assessment') {
          console.log('LLM detected learning intent, triggering assessment', { topic: intentAnalysis.topic });
          
          // Add user message to session
          const userMsg = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { intent: 'learning', phaseAtSend: 'pre', llmAnalyzed: true }
          };
          session.messages.push(userMsg);
          
          // Update phase and save
          session.phase = 'assessing';
          await session.save();
          
          // Return signal to frontend to call assessment
          return res.json({
            success: true,
            data: {
              message: "I'll create a personalized learning plan for you right away!",
              intent: 'triggers_assessment',
              phase: 'assessing',
              shouldTriggerAssessment: true,
              originalMessage: intentAnalysis.topic || userMessage // Use LLM-extracted topic if available
            }
          });
        }
        
        // Handle other intents (greeting, general, unclear)
        let assistantMessage = intentAnalysis.response || '';
        
        // If LLM didn't provide a response, generate one based on intent
        if (!assistantMessage || assistantMessage.trim() === '') {
          if (intentAnalysis.intent === 'greeting') {
            assistantMessage = "Hello! I'm here to help you learn. What would you like to learn about today?";
          } else if (intentAnalysis.intent === 'general') {
            assistantMessage = "I'm an AI learning assistant. I can help you create personalized learning plans and guide you through your studies. What would you like to learn?";
          } else if (intentAnalysis.intent === 'unclear') {
            assistantMessage = "I'd be happy to help you learn! Could you tell me what topic or subject you're interested in?";
          } else {
            assistantMessage = "Hi! I'm here to help you learn. What would you like to learn about today?";
          }
        }

        // Add messages to session
        const userMsg = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          metadata: { intent: intentAnalysis.intent, phaseAtSend: 'pre', llmAnalyzed: true }
        };
        
        const assistantMsg = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: assistantMessage,
          timestamp: new Date(),
          metadata: { intent: intentAnalysis.action, phaseAtSend: 'pre', llmAnalyzed: true }
        };

        session.messages.push(userMsg, assistantMsg);
        await session.save();

        return res.json({
          success: true,
          data: {
            message: assistantMessage,
            intent: intentAnalysis.action,
            phase: 'pre'
          }
        });

      } catch (error) {
        console.error('Pre-phase LLM intent analysis error:', error);
        
        // Check for rate limit
        if (error.status === 429 || error.message?.includes('rate_limit')) {
          return res.status(503).json({
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'API rate limit exceeded. Please try again in a few minutes.',
            retryAfter: 60
          });
        }
        
        // Fallback: treat as learning intent if message seems like a topic
        const lowerMsg = userMessage.toLowerCase();
        const mightBeLearning = lowerMsg.length < 50 && 
          !lowerMsg.includes('?') && 
          !['hello', 'hi', 'hey', 'what', 'how', 'why'].some(word => lowerMsg.includes(word));
        
        if (mightBeLearning) {
          console.log('Fallback: treating as learning intent due to LLM error');
          
          const userMsg = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { intent: 'learning', phaseAtSend: 'pre', llmFallback: true }
          };
          session.messages.push(userMsg);
          session.phase = 'assessing';
          await session.save();
          
          return res.json({
            success: true,
            data: {
              message: "I'll create a personalized learning plan for you right away!",
              intent: 'triggers_assessment',
              phase: 'assessing',
              shouldTriggerAssessment: true,
              originalMessage: userMessage
            }
          });
        }
        
        // Fallback response for other errors
        return res.json({
          success: true,
          data: {
            message: "Hi! I'm here to help you learn. What would you like to learn about today?",
            intent: 'pre_response',
            phase: 'pre'
          }
        });
      }
    }

    // Reject 'assessing' phase - use assessment endpoint for that
    if (session.phase === 'assessing') {
      console.log('Session in assessing phase, redirect to assessment', { sessionId });
      return res.status(409).json({
        success: false,
        error: 'Please complete assessment first',
        code: 'ILLEGAL_PHASE',
        currentPhase: 'assessing',
        hint: 'Use the assessment endpoint to answer clarification questions'
      });
    }
    
    // Handle 'quizzing' phase - user wants to start the quiz
    if (session.phase === 'quizzing' || session.phase === 'quiz') {
      const wantsQuiz = typeof userMessage === 'string' && /start\s+quiz/i.test(userMessage);
      if (wantsQuiz) {
        const userMessageObj = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'requesting_quiz', phaseAtSend: session.phase }
        };

        session.messages.push(userMessageObj);
        session.meta = session.meta || {};
        session.meta.milestoneBeingTaught = false;
        session.meta.outstandingCheck = null;
        session.meta.countSinceLastCheck = 0;
        await session.save();

        return res.json({
          success: true,
          data: {
            message: "Great! Let's test your understanding of this module.",
            nextAction: 'START_QUIZ',
            moduleId: session.activeModuleId,
            tokensIn: userMessage.length,
            tokensOut: 0,
            hadCheckInReply: false,
            followedUpOutstanding: false,
            phase: session.phase
          }
        });
      } else {
        // User sent a message in quizzing phase but didn't say "start quiz"
        return res.json({
          success: true,
          data: {
            message: "When you're ready, type 'start quiz' to begin the mastery check for this module.",
            tokensIn: userMessage.length,
            tokensOut: 0,
            phase: session.phase
          }
        });
      }
    }
    
    // Check if session is view-only (only hardcoded check we keep)
    if (session.isViewOnly) {
      return res.status(409).json({
        success: false,
        error: 'Chat not allowed for view-only sessions',
        code: 'ILLEGAL_PHASE'
      });
    }
    
    // For learning/feedback phases: Use LLM conversation manager to decide everything
    if (['learning', 'feedback'].includes(session.phase)) {
      // Initialize meta if not exists
      if (!session.meta) {
        session.meta = {};
      }
      
      // Handle reset module session - show message and wait for "ready"
      if (typeof userMessage === 'string' && userMessage.trim() === '_reset_module_session_') {
        const activeModule = session.plan.find(m => m.id === session.activeModuleId);
        if (activeModule) {
          // Reset module state
          session.meta.currentMilestoneIndex = 0;
          session.meta.milestoneBeingTaught = false;
          session.meta.outstandingCheck = null;
          session.meta.countSinceLastCheck = 0;
          session.phase = 'learning';
          
          // Reset all milestones in this module to incomplete
          if (activeModule.milestones) {
            activeModule.milestones.forEach((m, i) => {
              m.completed = false;
              if (!session.meta.milestoneRetryCount) {
                session.meta.milestoneRetryCount = {};
              }
              session.meta.milestoneRetryCount[i] = 0;
            });
          }
          activeModule.completedMilestones = [];
          activeModule.status = 'in_progress';
          
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: 'Close quiz',
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: 10, intent: 'reset_module_session', phaseAtSend: session.phase }
          };
          
          session.messages.push(userMessageObj);
          await session.save();
          
          // Return reset message
          const resetMessage = `Your session is reset. Let's start from the beginning of ${activeModule.title}. Say 'ready' when you are ready.`;
          const assistantMessageObj = {
            id: `msg_${Date.now() + 1}`,
            role: 'assistant',
            content: resetMessage,
            timestamp: new Date(),
            metadata: { type: 'system', tokensOut: resetMessage.length, phaseAtSend: session.phase }
          };
          
          session.messages.push(assistantMessageObj);
          await session.save();
          
          return res.json({
            success: true,
            data: {
              message: resetMessage,
              tokensIn: 10,
              tokensOut: resetMessage.length,
              hadCheckInReply: false,
              followedUpOutstanding: false,
              phase: session.phase,
              plan: session.plan,
              activeModuleId: session.activeModuleId
            }
          });
        }
      }
      
      // Handle "ready" message - reset to first milestone of current module
      if (typeof userMessage === 'string' && /^\s*ready\s*$/i.test(userMessage.trim())) {
        const activeModule = session.plan.find(m => m.id === session.activeModuleId);
        if (activeModule && activeModule.milestones && activeModule.milestones.length > 0) {
          // Reset to first milestone
          session.meta.currentMilestoneIndex = 0;
          session.meta.milestoneBeingTaught = false;
          session.meta.outstandingCheck = null;
          session.meta.countSinceLastCheck = 0;
          session.phase = 'learning';
          
          // Reset all milestones in this module to incomplete
          activeModule.milestones.forEach((m, i) => {
            m.completed = false;
            if (!session.meta.milestoneRetryCount) {
              session.meta.milestoneRetryCount = {};
            }
            session.meta.milestoneRetryCount[i] = 0;
          });
          activeModule.completedMilestones = [];
          activeModule.status = 'in_progress';
          
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'reset_to_first_milestone', phaseAtSend: session.phase }
          };
          
          session.messages.push(userMessageObj);
          await session.save();
          
          // Generate first teaching content for first milestone
          // Use trigger message that will be detected as first_teaching scenario
          const triggerMessage = `Let's start from the beginning of ${activeModule.title}`;
          const teacherPrompt = buildTeacherPrompt(session, triggerMessage, false);
          
          try {
            const teachingContent = await callTeacherAPI(teacherPrompt, 1500, session);
            const assistantMessageObj = {
              id: `msg_${Date.now() + 1}`,
              role: 'assistant',
              content: teachingContent,
              timestamp: new Date(),
              metadata: { type: 'teaching', tokensOut: teachingContent.length, phaseAtSend: session.phase }
            };
            
            session.messages.push(assistantMessageObj);
            session.meta.milestoneBeingTaught = true;
            session.meta.outstandingCheck = extractQuestion(teachingContent);
            await session.save();
            
            return res.json({
              success: true,
              data: {
                message: teachingContent,
                tokensIn: userMessage.length,
                tokensOut: teachingContent.length,
                hadCheckInReply: true,
                followedUpOutstanding: false,
                phase: session.phase,
                plan: session.plan,
                activeModuleId: session.activeModuleId
              }
            });
          } catch (teachingError) {
            req.logger.error('Failed to generate first teaching after reset', {
              sessionId,
              error: teachingError.message
            });
            // Fallback message
            const firstMilestone = activeModule.milestones[0];
            return res.json({
              success: true,
              data: {
                message: `Let's start from the beginning of ${activeModule.title}. ${firstMilestone.text}`,
                tokensIn: userMessage.length,
                tokensOut: 0,
                phase: session.phase,
                plan: session.plan,
                activeModuleId: session.activeModuleId
              }
            });
          }
        }
      }
      
      // Handle revision mode - after quiz completion, only allow restart commands
      if (session.mode === 'reviewing' && session.phase === 'feedback') {
        // Check if message is a restart command
        const isRestartCommand = typeof userMessage === 'string' && 
          /^\s*(restart\s+revision|restart|start\s+revision|revision)\s*$/i.test(userMessage.trim());
        
        if (!isRestartCommand) {
          // User sent a message that's not a restart command - show generic message
          const revisionTopic = session.topic || 'this topic';
          const genericMessage = `This thread is only for revision of "${revisionTopic}". To revise again, say "restart revision".`;
          
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'non_restart_after_revision_quiz', phaseAtSend: session.phase }
          };
          
          session.messages.push(userMessageObj);
          
          const assistantMessageObj = {
            id: `msg_${Date.now() + 1}`,
            role: 'assistant',
            content: genericMessage,
            timestamp: new Date(),
            metadata: { type: 'system', tokensOut: genericMessage.length, phaseAtSend: session.phase }
          };
          
          session.messages.push(assistantMessageObj);
          await session.save();
          
          return res.json({
            success: true,
            data: {
              message: genericMessage,
              tokensIn: userMessage.length,
              tokensOut: genericMessage.length,
              hadCheckInReply: false,
              followedUpOutstanding: false,
              phase: session.phase
            }
          });
        } else {
          // Handle restart revision command - automatically start quiz with thread's original topic
          const revisionTopic = session.topic || 'the topic';
          
          if (!revisionTopic || revisionTopic.trim().length === 0) {
            // Fallback if no topic found
            session.phase = 'pre';
            const restartMessage = `Revision quiz restarted. Please enter the topic you'd like to revise.`;
            
            const userMessageObj = {
              id: `msg_${Date.now()}`,
              role: 'user',
              content: userMessage,
              timestamp: new Date(),
              metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'restart_revision', phaseAtSend: session.phase }
            };
            
            session.messages.push(userMessageObj);
            
            const assistantMessageObj = {
              id: `msg_${Date.now() + 1}`,
              role: 'assistant',
              content: restartMessage,
              timestamp: new Date(),
              metadata: { type: 'system', tokensOut: restartMessage.length, phaseAtSend: session.phase }
            };
            
            session.messages.push(assistantMessageObj);
            await session.save();
            
            return res.json({
              success: true,
              data: {
                message: restartMessage,
                tokensIn: userMessage.length,
                tokensOut: restartMessage.length,
                hadCheckInReply: false,
                followedUpOutstanding: false,
                phase: session.phase
              }
            });
          }
          
          // Reset phase and clear previous revision attempts
          session.phase = 'quizzing';
          session.meta = session.meta || {};
          // Remove any previous revision quiz attempts for a clean restart
          session.quizAttempts = session.quizAttempts.filter(attempt => !attempt.isRevision);
          
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'restart_revision', phaseAtSend: session.phase }
          };
          
          session.messages.push(userMessageObj);
          await session.save();
          
          // Return response that triggers automatic quiz start
          return res.json({
            success: true,
            data: {
              message: `I'll generate a revision quiz for "${revisionTopic}".`,
              nextAction: 'START_REVISION_QUIZ',
              topic: revisionTopic.trim(),
              isRevision: true,
              tokensIn: userMessage.length,
              tokensOut: 0,
              hadCheckInReply: false,
              followedUpOutstanding: false,
              phase: session.phase
            }
          });
        }
      }
      
      // Handle "start" message - move to next module's first milestone (if passed)
      // NOTE: If quiz was passed, activeModuleId was already advanced during quiz submission
      // So we need to check if we're already on the next module before advancing
      if (typeof userMessage === 'string' && /^\s*start\s*$/i.test(userMessage.trim()) && session.phase === 'feedback') {
        // Find the last passed module to determine what the "next" module should be
        const lastPassedModuleIndex = session.plan.findLastIndex(m => m.status === 'passed');
        const expectedNextModuleIndex = lastPassedModuleIndex + 1;
        const expectedNextModule = session.plan[expectedNextModuleIndex];
        
        // Check if activeModuleId is already on the next module (quiz submission already advanced it)
        const currentActiveIndex = session.plan.findIndex(m => m.id === session.activeModuleId);
        const isAlreadyOnNextModule = currentActiveIndex === expectedNextModuleIndex;
        
        if (expectedNextModule) {
          // Only advance if we're not already on the next module
          if (!isAlreadyOnNextModule) {
            // Move to next module
            session.activeModuleId = expectedNextModule.id;
            expectedNextModule.status = 'in_progress';
          } else {
            // Already on next module - just ensure it's marked as in_progress
            if (expectedNextModule.status !== 'in_progress') {
              expectedNextModule.status = 'in_progress';
            }
          }
          
          session.meta.currentMilestoneIndex = 0;
          session.meta.milestoneBeingTaught = false;
          session.meta.outstandingCheck = null;
          session.meta.countSinceLastCheck = 0;
          session.phase = 'learning';
          
          // Reset retry counts for new module
          if (!session.meta.milestoneRetryCount) {
            session.meta.milestoneRetryCount = {};
          }
          
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'move_to_next_module', phaseAtSend: session.phase }
          };
          
          session.messages.push(userMessageObj);
          await session.save();
          
          // Generate first teaching content for next module's first milestone
          // Use expectedNextModule which is the correct module to start
          const firstMilestone = expectedNextModule.milestones?.[0];
          if (firstMilestone) {
            // Use trigger message that will be detected as first_teaching scenario
            const triggerMessage = `Let's start with ${expectedNextModule.title}`;
            const teacherPrompt = buildTeacherPrompt(session, triggerMessage, false);
            
            try {
              const teachingContent = await callTeacherAPI(teacherPrompt, 1500, session);
              const assistantMessageObj = {
                id: `msg_${Date.now() + 1}`,
                role: 'assistant',
                content: teachingContent,
                timestamp: new Date(),
                metadata: { type: 'teaching', tokensOut: teachingContent.length, phaseAtSend: session.phase }
              };
              
              session.messages.push(assistantMessageObj);
              session.meta.milestoneBeingTaught = true;
              session.meta.outstandingCheck = extractQuestion(teachingContent);
              await session.save();
              
              return res.json({
                success: true,
                data: {
                  message: teachingContent,
                  tokensIn: userMessage.length,
                  tokensOut: teachingContent.length,
                  hadCheckInReply: true,
                  followedUpOutstanding: false,
                  phase: session.phase,
                  plan: session.plan,
                  activeModuleId: session.activeModuleId
                }
              });
            } catch (teachingError) {
              req.logger.error('Failed to generate first teaching for next module', {
                sessionId,
                error: teachingError.message
              });
              // Fallback message
              return res.json({
                success: true,
                data: {
                  message: `Great! Let's start with ${expectedNextModule.title}. ${firstMilestone.text}`,
                  tokensIn: userMessage.length,
                  tokensOut: 0,
                  phase: session.phase,
                  plan: session.plan,
                  activeModuleId: session.activeModuleId
                }
              });
            }
          }
        }
      }
      
      // Initialize milestone tracking if not exists
      if (!session.meta.currentMilestoneIndex && session.activeModuleId) {
        session.meta.currentMilestoneIndex = 0;
      }
      
      // Capture state at turn start for safety checks later
      const hadOutstandingQuestionAtTurnStart = !!session.meta?.outstandingCheck;
      const wasMilestoneInProgressAtTurnStart = !!session.meta?.milestoneBeingTaught;
      
      // Use LLM to analyze the full context and decide what to do
      const groqClient = getGroqClient();
      const decisionPrompt = buildConversationDecisionPrompt(session, userMessage);
      
      try {
        const decisionResponse = await groqClient.chat.completions.create({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are an intelligent learning assistant. Analyze the conversation and return ONLY valid JSON matching the required schema. No markdown, no code fences, no explanations outside the JSON.'
            },
            {
              role: 'user',
              content: decisionPrompt
            }
          ],
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: 600,
          response_format: { type: "json_object" }
        });
        
        let llmDecision;
        try {
          const responseText = decisionResponse.choices[0].message.content.trim();
          // Extract JSON if wrapped in markdown
          let jsonText = responseText;
          const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            jsonText = jsonMatch[1];
          } else {
            const braceMatch = jsonText.match(/\{[\s\S]*\}/);
            if (braceMatch) {
              jsonText = braceMatch[0];
            }
          }
          llmDecision = JSON.parse(jsonText);
        } catch (parseError) {
          console.error('Failed to parse LLM decision JSON:', parseError);
          // Fallback: use teacher prompt for learning
          llmDecision = {
            intent: 'learning',
            action: 'teach',
            response: 'I apologize, but I encountered an issue processing your message. Please try again.',
            shouldAskQuestion: false,
            markMilestoneComplete: false,
            moveToNextMilestone: false,
            shouldStartQuiz: false,
            phaseChange: null
          };
        }
        
        console.log('LLM Conversation Decision:', {
          action: llmDecision.action,
          intent: llmDecision.intent,
          shouldAskQuestion: llmDecision.shouldAskQuestion,
          isFollowUpToOutstanding: llmDecision.isFollowUpToOutstanding,
          responseLength: llmDecision.response?.length || 0
        });

        const hasOutstandingQuestion = !!session.meta?.outstandingCheck;
        const isMilestoneInProgress = !!session.meta?.milestoneBeingTaught;
        const shouldForceFollowUp =
          userMessage?.trim().length &&
          (hasOutstandingQuestion || isMilestoneInProgress || hadOutstandingQuestionAtTurnStart || wasMilestoneInProgressAtTurnStart);
        
        if (shouldForceFollowUp || ['teach', 'respond_naturally', 'provide_guidance'].includes(llmDecision.action)) {
          if (!llmDecision.isFollowUpToOutstanding) {
            console.warn('Forcing milestone follow-up handling', {
              sessionId,
              userMessagePreview: userMessage.substring(0, 200),
              previousDecision: {
                intent: llmDecision.intent,
                action: llmDecision.action,
                hasOutstandingQuestion,
                isMilestoneInProgress,
                hadOutstandingQuestionAtTurnStart,
                wasMilestoneInProgressAtTurnStart
              }
            });
            llmDecision.isFollowUpToOutstanding = true;
          }
          
          if (llmDecision.intent === 'learning' || llmDecision.intent === 'asking_for_help' || llmDecision.intent === 'general') {
            llmDecision.intent = 'answering_question';
          }
          
          if (!['assess', 'clarify'].includes(llmDecision.action)) {
            llmDecision.action = hasOutstandingQuestion ? 'assess' : 'clarify';
          }
          
          llmDecision.shouldAskQuestion = false;
          llmDecision.questionToAsk = llmDecision.action === 'clarify' ? '' : llmDecision.questionToAsk || '';
        }
        
        // Handle quiz start request
        if (llmDecision.shouldStartQuiz || llmDecision.action === 'start_quiz') {
          const userMessageObj = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { type: 'chat', tokensIn: userMessage.length, intent: llmDecision.intent, phaseAtSend: session.phase }
          };
          
          session.messages.push(userMessageObj);
          await session.save();
          
          return res.json({
            success: true,
            data: {
              message: llmDecision.response || "Great! Let's test your understanding of this module.",
              nextAction: "START_QUIZ",
              moduleId: session.activeModuleId,
              tokensIn: userMessage.length,
              tokensOut: 0,
              hadCheckInReply: false,
              followedUpOutstanding: false
            }
          });
        }
        
        // Handle phase change
        if (llmDecision.phaseChange && llmDecision.phaseChange !== session.phase) {
          session.phase = llmDecision.phaseChange;
          console.log('Phase changed by LLM', { sessionId, from: session.phase, to: llmDecision.phaseChange });
        }
        
        // Get active module and current milestone info (needed for assessment analysis)
        const activeModule = session.plan.find(m => m.id === session.activeModuleId);
        let moduleJustCompleted = false;
        
        // CRITICAL: Ensure activeModuleId is set after plan approval
        // If plan is approved but activeModuleId is not set, use first module
        if (session.planApproved && !session.activeModuleId && session.plan && session.plan.length > 0) {
          session.activeModuleId = session.plan[0].id;
          session.meta.currentMilestoneIndex = 0;
          session.meta.milestoneBeingTaught = false;
          console.log('Set activeModuleId to first module after plan approval', { 
            sessionId, 
            activeModuleId: session.activeModuleId,
            moduleTitle: session.plan[0].title 
          });
        }
        
        // CRITICAL: Ensure currentMilestoneIndex is valid and within bounds
        const currentMilestoneIndex = session.meta.currentMilestoneIndex ?? 0;
        const activeModuleForMilestone = session.plan.find(m => m.id === session.activeModuleId);
        const totalMilestones = activeModuleForMilestone?.milestones?.length || 0;
        
        // Enforce milestone bounds - prevent invalid indices
        const validMilestoneIndex = Math.max(0, Math.min(currentMilestoneIndex, totalMilestones - 1));
        if (validMilestoneIndex !== currentMilestoneIndex) {
          console.warn('Milestone index out of bounds, correcting', {
            sessionId,
            currentMilestoneIndex,
            validMilestoneIndex,
            totalMilestones
          });
          session.meta.currentMilestoneIndex = validMilestoneIndex;
        }
        
        const currentMilestone = activeModuleForMilestone?.milestones?.[validMilestoneIndex];
        
        // CRITICAL: If no current milestone, we should be at index 0
        if (!currentMilestone && totalMilestones > 0) {
          session.meta.currentMilestoneIndex = 0;
          console.log('No current milestone found, resetting to index 0', {
            sessionId,
            activeModuleId: session.activeModuleId,
            totalMilestones
          });
        }
        
        // NOTE: Milestone completion handler moved to AFTER assessment analysis
        // because assessment analysis sets markMilestoneComplete
        
        // CRITICAL: DO NOT move milestone here - wait until after assessment analysis confirms it
        // The LLM decision might suggest moving, but we need to verify via assessment first
        // Store the decision for later processing after assessment
        
        // Store previous outstanding check BEFORE assessment analysis (might clear it)
        const previousOutstandingCheck = session.meta?.outstandingCheck || null;
        
        // Handle follow-up to outstanding question
        // CRITICAL: Use the CURRENT milestone (before any progression) for assessment
        if (llmDecision.isFollowUpToOutstanding && session.meta?.outstandingCheck) {
          // Use assessment analysis for follow-ups
          // CRITICAL: Use validMilestoneIndex (current milestone) for retry count, not the potentially incremented one
          const milestoneRetryCount = session.meta?.milestoneRetryCount?.[validMilestoneIndex] || 0;
          const assessmentPrompt = buildAssessmentAnalysisPrompt(
            session.meta.outstandingCheck,
            userMessage,
            currentMilestone, // This is the milestone the question was about
            milestoneRetryCount
          );
          
          try {
            const assessmentResponse = await groqClient.chat.completions.create({
              model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
              messages: [
                {
                  role: 'system',
                  content: 'You are an expert educational assessment AI. Return ONLY valid JSON matching the schema. No prose, no markdown blocks, no explanations outside the JSON.'
                },
                {
                  role: 'user',
                  content: assessmentPrompt
                }
              ],
              temperature: 0.3,
              top_p: 0.9,
              max_tokens: 400,
              response_format: { type: "json_object" }
            });
            
            const assessmentContent = assessmentResponse.choices[0].message.content.trim();
            let assessmentJson = assessmentContent;
            const jsonMatch = assessmentJson.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
              assessmentJson = jsonMatch[1];
            } else {
              const braceMatch = assessmentJson.match(/\{[\s\S]*\}/);
              if (braceMatch) {
                assessmentJson = braceMatch[0];
              }
            }
            
            const assessmentData = JSON.parse(assessmentJson);
            
            // Validate responseType field exists and is valid
            const validResponseTypes = ['clarification_request', 'wrong_answer', 'correct_answer', 'incomplete_answer'];
            const responseType = validResponseTypes.includes(assessmentData.responseType) 
              ? assessmentData.responseType 
              : 'wrong_answer'; // Default fallback if missing or invalid
            
            // ⚠️⚠️⚠️ CRITICAL SAFETY CHECK: If responseType indicates correct answer, force understood = true
            // This prevents the LLM from incorrectly marking correct answers as wrong
            let understood;
            if (responseType === 'correct_answer' || responseType === 'incomplete_answer') {
              // Force understood = true for correct/incomplete answers (they demonstrate understanding)
              understood = true;
              // Also ensure recommendation is move_forward for correct answers
              if (assessmentData.recommendation !== 'move_forward') {
                assessmentData.recommendation = 'move_forward';
              }
            } else {
              // For wrong answers or clarification requests, use LLM's assessment
              understood = assessmentData.understood === true || 
                          (milestoneRetryCount >= 1 && assessmentData.recommendation === 'move_forward_anyway');
            }
            
            // ⚠️ Use LLM classification instead of keyword matching
            const isClarificationRequest = responseType === 'clarification_request';
            const isWrongAnswer = responseType === 'wrong_answer';
            const isCorrectAnswer = responseType === 'correct_answer' || responseType === 'incomplete_answer';
            
            // Store assessment result for teacher prompt to structure response
            llmDecision.assessmentResult = {
              understood,
              responseType, // ⚠️ NEW: Explicit LLM classification
              isClarificationRequest, // ⚠️ NEW: Derived from LLM classification
              isCorrectAnswer, // ⚠️ NEW: Flag for correct answers
              confidence: assessmentData.confidence || 'medium',
              recommendation: assessmentData.recommendation || 'move_forward',
              reasoning: assessmentData.reasoning || '',
              milestoneRetryCount
            };
            
            // Log assessment result for debugging
            req.logger.info('Assessment analysis result', {
              sessionId,
              responseType,
              understood,
              isCorrectAnswer,
              recommendation: assessmentData.recommendation,
              studentAnswer: userMessage.substring(0, 100), // First 100 chars for debugging
              reasoning: assessmentData.reasoning?.substring(0, 200) // First 200 chars
            });
            
            if (understood) {
              // Check if recommendation is to clarify or move forward
              const needsMoreClarification = assessmentData.recommendation === 'clarify_again';
              
              if (needsMoreClarification) {
                // Correct but needs more - don't move milestone yet
                llmDecision.markMilestoneComplete = false;
                llmDecision.moveToNextMilestone = false;
                llmDecision.assessmentResult.needsMoreClarification = true;
              } else {
                // Correct and milestone achieved - move forward
                llmDecision.markMilestoneComplete = true;
                llmDecision.moveToNextMilestone = true;
                session.meta.milestoneBeingTaught = false;
                session.meta.outstandingCheck = null;
              }
            } else {
              // Negative assessment
              // ⚠️⚠️⚠️ CRITICAL: Clarification requests should NEVER advance milestones
              // They should always stay on the same milestone and keep clarifying
              if (isClarificationRequest) {
                // Clarification request - stay on same milestone, don't increment retry count
                llmDecision.assessmentResult.isClarificationRequest = true;
                llmDecision.markMilestoneComplete = false;
                llmDecision.moveToNextMilestone = false;
                // Don't increment retry count for clarification requests - they're not wrong answers
              } else if (isWrongAnswer) {
                // Wrong answer - check retry count
                if (milestoneRetryCount < 1) {
                  if (!session.meta.milestoneRetryCount) {
                    session.meta.milestoneRetryCount = {};
                  }
                  // CRITICAL: Use validMilestoneIndex (the milestone being assessed)
                  session.meta.milestoneRetryCount[validMilestoneIndex] = (session.meta.milestoneRetryCount[validMilestoneIndex] || 0) + 1;
                  llmDecision.assessmentResult.isFirstIncorrect = true;
                  llmDecision.markMilestoneComplete = false;
                  llmDecision.moveToNextMilestone = false;
                } else {
                  // Already retried wrong answer - move forward anyway
                  llmDecision.markMilestoneComplete = true;
                  llmDecision.moveToNextMilestone = true;
                  llmDecision.assessmentResult.isSecondIncorrect = true;
                }
              } else {
                // Fallback: unknown response type, treat as wrong answer
                if (milestoneRetryCount < 1) {
                  if (!session.meta.milestoneRetryCount) {
                    session.meta.milestoneRetryCount = {};
                  }
                  session.meta.milestoneRetryCount[validMilestoneIndex] = (session.meta.milestoneRetryCount[validMilestoneIndex] || 0) + 1;
                  llmDecision.assessmentResult.isFirstIncorrect = true;
                  llmDecision.markMilestoneComplete = false;
                  llmDecision.moveToNextMilestone = false;
                } else {
                  llmDecision.markMilestoneComplete = true;
                  llmDecision.moveToNextMilestone = true;
                  llmDecision.assessmentResult.isSecondIncorrect = true;
                }
              }
            }
          } catch (assessmentError) {
            console.error('Assessment analysis failed', { sessionId, error: assessmentError.message });
            // Continue with LLM's response
          }
        }
        
        // CRITICAL: Handle milestone completion AFTER assessment analysis
        // (Assessment analysis sets markMilestoneComplete)
        // ONLY move milestone AFTER we've confirmed it should be marked complete
        // AND BEFORE generating the teacher response (so teacher knows which milestone to teach)
        if (llmDecision.markMilestoneComplete && currentMilestone && activeModule) {
          // Mark current milestone as completed
          currentMilestone.completed = true;
          if (!activeModule.completedMilestones) {
            activeModule.completedMilestones = [];
          }
          if (!activeModule.completedMilestones.includes(validMilestoneIndex)) {
            activeModule.completedMilestones.push(validMilestoneIndex);
          }
          
          console.log('Milestone marked as complete', {
            sessionId,
            milestoneIndex: validMilestoneIndex,
            milestoneText: currentMilestone.text,
            moveToNextMilestone: llmDecision.moveToNextMilestone
          });
          
          // CRITICAL: Only move to next milestone AFTER marking current as complete
          // AND only if moveToNextMilestone is true
          // This happens BEFORE teacher prompt generation, so teacher knows which milestone to teach
          if (llmDecision.moveToNextMilestone && activeModule) {
            const nextIndex = validMilestoneIndex + 1;
            if (nextIndex < (activeModule.milestones?.length || 0)) {
              // CRITICAL: Ensure sequential progression (next milestone must be current + 1)
              const expectedNextIndex = validMilestoneIndex + 1;
              if (nextIndex !== expectedNextIndex) {
                console.warn('Milestone progression violation', {
                  sessionId,
                  currentMilestoneIndex: validMilestoneIndex,
                  nextIndex,
                  expectedNextIndex,
                  activeModule: activeModule.title
                });
                // Force sequential progression
                session.meta.currentMilestoneIndex = expectedNextIndex;
              } else {
                session.meta.currentMilestoneIndex = nextIndex;
              }
              session.meta.milestoneBeingTaught = false;
              console.log('Moved to next milestone AFTER completion confirmed (BEFORE teacher prompt)', { 
                sessionId, 
                from: validMilestoneIndex, 
                to: session.meta.currentMilestoneIndex,
                completedMilestone: currentMilestone.text,
                nextMilestoneText: activeModule.milestones[session.meta.currentMilestoneIndex]?.text,
                note: 'Teacher prompt will now use the NEW milestone index'
              });
            } else {
              console.log('Cannot move to next milestone - already at last milestone', {
                sessionId,
                currentMilestoneIndex: validMilestoneIndex,
                totalMilestones: activeModule.milestones?.length
              });
              // Mark milestone teaching state as complete and prepare for quiz transition
              session.meta.milestoneBeingTaught = false;
              session.meta.currentMilestoneIndex = validMilestoneIndex;
              session.meta.outstandingCheck = null;
              session.meta.countSinceLastCheck = 0;
              if (!llmDecision.response) {
                llmDecision.response = `Outstanding work! You've completed every milestone in ${activeModule.title}. Let me queue up a quick quiz to lock it in.`;
              }
              llmDecision.action = 'start_quiz';
              llmDecision.moveToNextMilestone = false;
              llmDecision.shouldStartQuiz = true;
              moduleJustCompleted = true;
            }
          }
          
          // Check if all milestones done
          const allMilestonesDone = activeModule.milestones.every(m => m.completed);
          if (allMilestonesDone) {
            llmDecision.shouldStartQuiz = true;
            session.phase = 'quizzing';
            moduleJustCompleted = true;
          }
        }
        
        // CRITICAL: ALWAYS recalculate progress based on actual milestone completion status
        // This ensures progress is always up-to-date, regardless of how milestone was marked
        const recalculateProgress = async () => {
          try {
            if (!session.plan || session.plan.length === 0) {
              return;
            }
            
            // Calculate overall progress across all modules based on completed milestones
            let totalMilestonesInPlan = 0;
            let totalCompletedMilestones = 0;
            
            session.plan.forEach(module => {
              if (module.milestones && Array.isArray(module.milestones)) {
                totalMilestonesInPlan += module.milestones.length;
                totalCompletedMilestones += module.milestones.filter(m => m.completed === true).length;
              }
            });
            
            const overallProgressPct = totalMilestonesInPlan > 0 
              ? Math.round((totalCompletedMilestones / totalMilestonesInPlan) * 100) 
              : 0;
            
            // Update session progress
            session.progressPct = overallProgressPct;
            
            // Calculate points based on module progress (milestone completion)
            // Each module contributes points proportionally to its milestone completion
            let previousPoints = session.points || 0;
            let calculatedPoints = 0;
            session.plan.forEach(module => {
              if (module.milestones && Array.isArray(module.milestones) && module.milestones.length > 0) {
                const moduleCompleted = module.milestones.filter(m => m.completed === true).length;
                const moduleProgress = moduleCompleted / module.milestones.length;
                calculatedPoints += Math.round((module.points || 0) * moduleProgress);
              }
            });
            
            session.points = Math.min(100, Math.max(0, calculatedPoints));
            session.gems = Math.floor(session.points / 20);
            
            // Calculate points earned from milestone completion
            const pointsEarned = calculatedPoints - previousPoints;
            
            // Update user's global pointsTotal when points are earned from milestone completion
            if (session.userId && pointsEarned > 0) {
              try {
                const User = require('../models/User');
                const user = await User.findById(session.userId);
                if (user) {
                  // Add earned points to global pointsTotal (accumulative, never decreases)
                  const previousPointsTotal = user.stats.pointsTotal || 0;
                  user.stats.pointsTotal = previousPointsTotal + pointsEarned;
                  
                  // Calculate gems from pointsTotal: 1 gem per 20 points
                  const totalGems = Math.floor(user.stats.pointsTotal / 20);
                  user.stats.gemsTotal = totalGems;
                  
                  await user.save();
                  
                  req.logger.info({
                    userId: session.userId,
                    sessionId,
                    pointsEarned,
                    previousPointsTotal,
                    newPointsTotal: user.stats.pointsTotal,
                    totalGems,
                    previousGemsTotal: Math.floor(previousPointsTotal / 20)
                  }, 'Updated user global pointsTotal and gems from milestone completion');
                }
              } catch (userUpdateError) {
                req.logger.error({
                  userId: session.userId,
                  error: userUpdateError.message
                }, 'Failed to update user global pointsTotal and gems from milestone completion');
                // Don't fail the request if user update fails
              }
            }
            
            console.log('Progress recalculated', {
              sessionId,
              totalMilestonesInPlan,
              totalCompletedMilestones,
              overallProgressPct,
              calculatedPoints: session.points,
              previousPoints,
              pointsEarned,
              gems: session.gems,
              activeModuleId: session.activeModuleId,
              currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0
            });
          } catch (progressError) {
            console.error('Failed to recalculate progress', { sessionId, error: progressError.message, stack: progressError.stack });
            // Continue anyway - don't fail the request
          }
        };
        
        // Recalculate progress after milestone completion check
        await recalculateProgress();
        
        // Generate response using teacher prompt if needed
        let assistantResponse = '';
        let extractedQuestion = null;

        // If milestone completion finished the module, transition to quiz without re-teaching
        if (moduleJustCompleted && !assistantResponse) {
          const quizMessage = `Fantastic work finishing every milestone in ${activeModule?.title || 'this module'}! When you're ready, say “start quiz” and I'll launch a quick mastery check for this module.`;
          assistantResponse = quizMessage;
          llmDecision.response = quizMessage;
          // Clear outstanding state since we're moving away from milestone teaching
          if (session.meta) {
            session.meta.outstandingCheck = null;
            session.meta.milestoneBeingTaught = false;
          }
        }
        
        // CRITICAL: For teaching actions, ALWAYS use teacher prompt, ignore llmDecision.response
        // The teacher prompt enforces the complete structure (introduction + teaching + assessment)
        if (!assistantResponse && (llmDecision.action === 'teach' || llmDecision.action === 'assess' || llmDecision.action === 'clarify')) {
          // CRITICAL: Get current milestone info AFTER potential progression
          // If we just moved to next milestone (moveToNextMilestone), the index has been updated
          // So we need to use the NEW milestone index (the one we're teaching now)
          const activeModuleForTeacher = session.plan.find(m => m.id === session.activeModuleId);
          // Use the CURRENT milestone index (which may have been updated if we moved)
          const milestoneIndexForTeacher = session.meta.currentMilestoneIndex ?? 0;
          const milestoneForTeacher = activeModuleForTeacher?.milestones?.[milestoneIndexForTeacher];
          
          // CRITICAL: If we just moved to next milestone, milestoneForTeacher is the NEW milestone
          // If we're still on the same milestone, milestoneForTeacher is the current one
          const milestoneInfo = {
            moveToNextMilestone: llmDecision.moveToNextMilestone,
            markMilestoneComplete: llmDecision.markMilestoneComplete
          };
          console.log('Teacher Prompt - Milestone Context:', {
            milestoneIndexForTeacher,
            milestoneText: milestoneForTeacher?.text,
            justMoved: milestoneInfo.moveToNextMilestone && milestoneInfo.markMilestoneComplete,
            isFollowUp: llmDecision.isFollowUpToOutstanding
          });
          
          // Pass assessment result to teacher prompt for structured responses
          const assessmentResult = llmDecision.assessmentResult || null;
          const teacherPrompt = buildTeacherPrompt(session, userMessage, llmDecision.isFollowUpToOutstanding, assessmentResult, milestoneInfo);
          
          // Prepare validation context for response structure validation
          let validationContext = null;
          if (assessmentResult && llmDecision.isFollowUpToOutstanding) {
            // Use milestone that was being assessed (before moving)
            const currentMilestoneForValidation = milestoneForTeacher;
            const nextMilestoneForValidation = activeModuleForTeacher?.milestones?.[milestoneIndexForTeacher + 1];
            
            if (assessmentResult.understood && !assessmentResult.needsMoreClarification && milestoneInfo?.moveToNextMilestone) {
              validationContext = {
                scenario: 'A',
                currentMilestone: currentMilestoneForValidation?.text || '',
                nextMilestone: nextMilestoneForValidation?.text || ''
              };
            } else if (!assessmentResult.understood && assessmentResult.isFirstIncorrect) {
              validationContext = {
                scenario: 'C',
                currentMilestone: currentMilestoneForValidation?.text || '',
                nextMilestone: null
              };
            }
          }
          
          assistantResponse = await callTeacherAPI(teacherPrompt, req.maxTokens || 1500, session, validationContext);
          
          // Extract question if LLM asked one
          if (llmDecision.shouldAskQuestion && llmDecision.questionToAsk) {
            extractedQuestion = llmDecision.questionToAsk;
          } else {
            extractedQuestion = extractQuestion(assistantResponse);
          }
        } else {
          // For non-teaching actions, use the response from conversation manager
          assistantResponse = llmDecision.response || '';
        }
        
        // CRITICAL: Update outstanding check intelligently to prevent redundant questions
        // Logic:
        // 1. If user just answered correctly and milestone is complete → clear old outstanding question
        // 2. Only set a new outstanding question if we're teaching a NEW milestone (not the same one)
        // 3. Don't set a new question if we just completed a milestone (wait for next teaching turn)
        // Note: previousOutstandingCheck was already captured before assessment analysis
        
        // If user just answered correctly and milestone is complete, clear outstanding question
        // (This happens in assessment analysis, but we also handle it here for safety)
        if (llmDecision.isFollowUpToOutstanding && llmDecision.markMilestoneComplete && llmDecision.moveToNextMilestone) {
          // User answered correctly, milestone complete, moving to next milestone
          // Clear the old outstanding question - it was answered
          session.meta.outstandingCheck = null;
          session.meta.countSinceLastCheck = 0;
          console.log('Cleared outstanding question after correct answer and milestone completion', {
            sessionId,
            previousQuestion: previousOutstandingCheck?.substring(0, 100) || 'none',
            movedToNextMilestone: true
          });
        }
        
        // Only set a new outstanding question if:
        // 1. We extracted a question from the response
        // 2. We're NOT in a follow-up to a completed milestone (we just cleared it above)
        // 3. The question is different from the previous one (to prevent duplicates)
        if (extractedQuestion) {
          const movedToNextMilestone =
            llmDecision.markMilestoneComplete &&
            (llmDecision.moveToNextMilestone || session.meta.currentMilestoneIndex !== validMilestoneIndex);
          // Check if this is a follow-up to a completed milestone that is staying on the same milestone
          const isFollowUpToCompleted =
            llmDecision.isFollowUpToOutstanding &&
            llmDecision.markMilestoneComplete &&
            !movedToNextMilestone;
          
          // Check if the question is the same as the previous one (prevent duplicates)
          const isSameQuestion = previousOutstandingCheck && 
            extractedQuestion.toLowerCase().trim() === previousOutstandingCheck.toLowerCase().trim();
          
          // Only set new question if:
          // 1. We're not in a follow-up to a completed milestone (we already cleared it)
          // 2. The question is different from the previous one
          // 3. We're teaching (not just acknowledging)
          if (!isFollowUpToCompleted && !isSameQuestion) {
            session.meta.outstandingCheck = extractedQuestion;
            session.meta.countSinceLastCheck = 0;
            session.meta.milestoneBeingTaught = true;
            console.log('Outstanding question set', {
              sessionId,
              question: extractedQuestion.substring(0, 100),
              currentMilestoneIndex: session.meta.currentMilestoneIndex,
              isNewMilestone: llmDecision.moveToNextMilestone
            });
          } else {
            if (isFollowUpToCompleted) {
              session.meta.outstandingCheck = null;
              session.meta.countSinceLastCheck = 0;
            }
            // Don't set a new question if:
            // - We just completed a milestone (wait for next teaching)
            // - The question is the same as before (redundant)
            console.log('Skipping new question', {
              sessionId,
              reason: isFollowUpToCompleted ? 'milestone just completed' : 'same question as before',
              extractedQuestion: extractedQuestion.substring(0, 100),
              previousQuestion: previousOutstandingCheck?.substring(0, 100) || 'none',
              markMilestoneComplete: llmDecision.markMilestoneComplete
            });
          }
        } else {
          // No question extracted - clear if we're not in follow-up
          if (!llmDecision.isFollowUpToOutstanding && session.meta?.outstandingCheck) {
            // Keep the outstanding check if we're still teaching the same milestone
            console.log('Keeping outstanding question for follow-up', {
              sessionId,
              outstandingCheck: session.meta.outstandingCheck.substring(0, 100)
            });
          } else if (!llmDecision.isFollowUpToOutstanding) {
            // Clear outstanding check if we're not in follow-up and no question was asked
            session.meta.outstandingCheck = null;
            session.meta.countSinceLastCheck = (session.meta.countSinceLastCheck || 0) + 1;
          }
        }
        
        // If we aren't generating a structured teaching response (e.g., transitioning to quiz),
        // reuse any provided LLM response if available
        if (!assistantResponse) {
          assistantResponse = llmDecision.response || 'Thanks for your update! Let me think about the best next step.';
        }

        // Save session
        await session.save();
        
        // Add messages
        const userMessageObj = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          metadata: { 
            type: 'chat', 
            tokensIn: userMessage.length,
            intent: llmDecision.intent,
            phaseAtSend: session.phase
          }
        };
        
        const assistantMessage = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: assistantResponse,
          timestamp: new Date(),
          metadata: { 
            type: 'chat', 
            tokensOut: assistantResponse.length,
            intent: llmDecision.action,
            phaseAtSend: session.phase,
            hadCheckInReply: !!extractedQuestion,
            followedUpOutstanding: llmDecision.isFollowUpToOutstanding || false
          }
        };
        
        session.messages.push(userMessageObj, assistantMessage);
        
        // Update context summary after interaction (token-efficient, Cursor IDE-style)
        try {
          await updateContextSummary(session, userMessage, assistantResponse, groqClient);
        } catch (summaryError) {
          console.warn('Context summary update failed', { sessionId, error: summaryError.message });
          // Continue even if summary update fails
        }
        
        // CRITICAL: Recalculate progress one final time before returning response
        // This ensures progress is always accurate, even if milestone was marked elsewhere
        recalculateProgress();
        
        await session.save();
        
        const tokensIn = Math.ceil(userMessage.length / 4);
        const tokensOut = Math.ceil(assistantResponse.length / 4);
        
        return res.json({
          success: true,
          data: {
            message: assistantResponse,
            tokensIn,
            tokensOut,
            hadCheckInReply: !!extractedQuestion,
            followedUpOutstanding: llmDecision.isFollowUpToOutstanding || false,
            phase: session.phase,
            milestoneCompleted: llmDecision.markMilestoneComplete || false,
            moduleCompleted: llmDecision.shouldStartQuiz || false,
            shouldGenerateQuiz: llmDecision.shouldStartQuiz || false,
            currentMilestoneIndex: session.meta.currentMilestoneIndex ?? 0,
            totalMilestones: activeModule?.milestones?.length || 0,
            plan: session.plan,
            activeModuleId: session.activeModuleId,
            progressPct: session.progressPct || 0,
            points: session.points || 0
          }
        });
        
      } catch (error) {
        console.error('LLM conversation decision failed', { sessionId, error: error.message, stack: error.stack });
        
        // Fallback: use teacher prompt
        const teacherPrompt = buildTeacherPrompt(session, userMessage, false);
        const assistantResponse = await callTeacherAPI(teacherPrompt, req.maxTokens || 1100, session);
        
        const userMessageObj = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          metadata: { type: 'chat', tokensIn: userMessage.length, intent: 'learning', phaseAtSend: session.phase }
        };
        
        const assistantMessage = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: assistantResponse,
          timestamp: new Date(),
          metadata: { type: 'chat', tokensOut: assistantResponse.length, intent: 'teach', phaseAtSend: session.phase }
        };
        
        session.messages.push(userMessageObj, assistantMessage);
        
        // Update context summary after interaction
        try {
          await updateContextSummary(session, userMessage, assistantResponse, groqClient);
        } catch (summaryError) {
          console.warn('Context summary update failed', { sessionId, error: summaryError.message });
        }
        
        await session.save();
        
        return res.json({
          success: true,
          data: {
            message: assistantResponse,
            tokensIn: Math.ceil(userMessage.length / 4),
            tokensOut: Math.ceil(assistantResponse.length / 4),
            hadCheckInReply: false,
            followedUpOutstanding: false,
            phase: session.phase
          }
        });
      }
    }
    
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

// Export callTeacherAPI for use in other routes
module.exports = router;
module.exports.callTeacherAPI = callTeacherAPI;
