const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { z } = require('zod');
const Session = require('../models/Session');
const Course = require('../models/Course');
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
const { recordMilestoneAttempt } = require('../services/milestoneAttemptService');
const { callTeacherAPI, callTeacherAPIStream } = require('../services/teacherService');
const { requireAuth, requireOwnership } = require('../middleware/auth');
const { useMultiAgent, useStreaming } = require('../agents/framework/featureFlag');
const { runIntentAgent } = require('../agents/intentAgent');
const { runStudyGraph } = require('../agents/graph/runGraph');
const { runEngagementAgent } = require('../agents/engagementAgent');
const { runTeachingAgent, mapAssessmentForTeacher } = require('../agents/teachingAgent');
const { evaluateConstraints, buildRefusalMessage, recordRefusal } = require('../services/constraintGateService');

// Extract question from assistant response
/**
 * The check-in question the student is expected to answer.
 *
 * The unified teaching structure mandates exactly ONE question, at the END of
 * the response, so the LAST question sentence is the assessment question. The
 * previous implementation took the FIRST '?'-span with `[^.!?]*` on either
 * side, which back-scans across fenced code (no sentence terminators in it) and
 * handed the grader a question prefixed with code garbage — measured on real
 * transcripts, that polluted the graded question in the multi-question minority
 * of turns. Newlines and code fences now bound the span.
 */
const extractQuestion = (response) => {
  const text = String(response || '');
  if (!text.includes('?')) return null;
  const withoutCode = text.replace(/```[\s\S]*?```/g, ' ');
  // Split on sentence terminators followed by whitespace, or on line breaks.
  // A bare '.' between digits (3.14) is NOT a terminator, so decimals survive.
  const candidates = withoutCode
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\*\*/g, '').trim())
    .filter((s) => s.endsWith('?') && s.split(/\s+/).filter(Boolean).length >= 3);
  if (candidates.length) return candidates[candidates.length - 1];
  // Fall back to the original behaviour rather than losing the check entirely.
  const questionMatch = text.match(/([^.!?]*\?[^.!?]*)/);
  return questionMatch ? questionMatch[1].trim() : null;
};

// Safety: override obviously-correct short answers to prevent LLM misgrading.
// This is intentionally narrow (high precision) to avoid false positives.
const overrideAssessmentIfObviouslyCorrect = (question, answer, assessmentPayload) => {
  const q = String(question || '').toLowerCase();
  const a = String(answer || '').toLowerCase();

  // Swift/JS-style var vs let (mutable vs constant/immutable)
  const asksVarLet =
    (q.includes('difference') && q.includes('var') && q.includes('let')) ||
    (q.includes('main difference') && q.includes('var') && q.includes('let'));
  const mentionsVar = /\bvar\b/.test(a);
  const mentionsLet = /\blet\b/.test(a);
  const mentionsMutable = a.includes('change') || a.includes('mutable') || a.includes('modify') || a.includes('reassign');
  const mentionsConstant = a.includes('constant') || a.includes('immutable') || a.includes('fixed') || a.includes('cannot change') || a.includes("can't change");

  if (asksVarLet && mentionsVar && mentionsLet && (mentionsMutable || mentionsConstant)) {
    return {
      ...assessmentPayload,
      responseType: 'correct_answer',
      understood: true,
      confidence: 'high',
      recommendation: 'move_forward',
      reasoning: 'Heuristic override: correct var vs let distinction.',
    };
  }

  return assessmentPayload;
};

const buildAssessmentFeedback = ({ responseType, understood, recommendation, retryCount }) => {
  // Always return a short feedback line (1 sentence) for assessment follow-ups.
  const rt = responseType || 'wrong_answer';
  if (rt === 'clarification_request') {
    return `Good catch — let’s clarify that first.`;
  }
  if (understood) {
    if (recommendation === 'clarify_again') {
      return `You’re on the right track — let’s tighten it up with one more quick clarification.`;
    }
    return `Nice work — that’s correct.`;
  }
  if ((retryCount || 0) >= 1) {
    return `Not quite — I’ll show a clearer way to think about it, then we’ll keep moving.`;
  }
  return `Close, but not quite — let’s correct it together.`;
};

/** Build meta object for chat responses so frontend StudyPanelNav can show correct active milestone. */
const buildChatMeta = (session) => {
  const meta = session.meta || {};
  return {
    currentMilestoneIndex: meta.currentMilestoneIndex ?? 0,
    outstandingCheck: meta.outstandingCheck ?? null,
    milestoneBeingTaught: meta.milestoneBeingTaught ?? false,
  };
};

/**
 * Exact-match UI control commands, the only messages the gate may skip.
 *
 * Every pattern is ANCHORED (^...$) on purpose. The quizzing branch used to test
 * `/start\s+quiz/i` as a SUBSTRING, so "give me the working exploit code and
 * then start quiz" satisfied it and reached START_QUIZ with no guardrail. An
 * anchored match means the entire message is the command and carries no
 * free-text payload for the gate to evaluate.
 *
 * Keep this list minimal. Anything admitted here is, by construction, never
 * checked against the instructor's rules or the safety floor.
 */
const CONTROL_COMMANDS = [
  /^\s*start\s+quiz\s*$/i,
  /^\s*ready\s*$/i,
  /^\s*start\s*$/i,
  /^\s*(restart\s+revision|restart|start\s+revision|revision)\s*$/i,
  /^\s*_reset_module_session_\s*$/,
];

const isControlCommand = (msg) =>
  typeof msg === 'string' && CONTROL_COMMANDS.some((re) => re.test(msg));

/**
 * Single enforcement point for the constraint gate (pilot finding 1b).
 *
 * Encapsulates evaluate → refuse → record → persist → respond, so protecting a
 * response path costs one call instead of forty copied lines. The duplication is
 * what let the quizzing-phase path drift ungated for the whole pilot.
 *
 * Returns true when it has ALREADY answered the request; the caller must then
 * return immediately and do nothing else. A refused turn must not grade, record
 * an attempt, increment a retry count, advance a milestone, or change phase —
 * refusing a student must never be a way to move them forward.
 */
async function enforceConstraints({ session, userMessage, globalInstructions, res, pathTag }) {
  // The control-command skip lives HERE rather than at the call site, so the
  // call site can be an unconditional `if (await enforceConstraints(...)) return;`.
  // That matters beyond tidiness: scripts/auditChatGuardrails.js only credits a
  // gate that is unconditionally evaluated, so wrapping this call in
  // `if (!isControlCommand(...))` would — correctly — stop it counting as
  // protection for everything downstream.
  if (isControlCommand(userMessage)) return false;

  const verdict = await evaluateConstraints({ userMessage, globalInstructions });
  if (!verdict.violates) return false;

  const activeModule = session.plan?.find((m) => m.id === session.activeModuleId);
  const milestone = activeModule?.milestones?.[session.meta?.currentMilestoneIndex ?? 0];
  const refusalText = buildRefusalMessage(verdict, {
    outstandingCheck: session.meta?.outstandingCheck,
  });

  await recordRefusal(verdict, {
    courseId: session.courseId,
    courseTopicId: session.courseTopicId,
    sessionId: session._id,
    userId: session.userId,
    userMessage,
    milestoneText: milestone?.text || '',
  });

  session.messages.push(
    {
      id: `msg_${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date(),
      metadata: { intent: 'refused', phaseAtSend: session.phase, refusalPath: pathTag },
    },
    {
      id: `msg_${Date.now() + 1}`, role: 'assistant', content: refusalText, timestamp: new Date(),
      metadata: {
        intent: 'refusal', phaseAtSend: session.phase, refusal: true,
        refusalCategory: verdict.category, refusalPath: pathTag,
      },
    }
  );
  await session.save();

  res.json({
    success: true,
    data: {
      message: refusalText,
      phase: session.phase, // deliberately unchanged
      refusal: true,
      refusalCategory: verdict.category,
      currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0,
      plan: session.plan,
      activeModuleId: session.activeModuleId,
      progressPct: session.progressPct || 0,
      points: session.points || 0,
      meta: buildChatMeta(session),
    },
  });
  return true;
}

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

    // Load course-level instructor guidelines if this session is scoped to a
    // course. Null for student-driven (non-course) sessions — in which case
    // every downstream buildTeacherPrompt call just receives an empty string,
    // which the prompt builder treats as "no instructor block".
    let courseGlobalInstructions = '';
    if (session.courseId) {
      try {
        const course = await Course.findById(session.courseId)
          .select('globalInstructions')
          .lean();
        if (course && typeof course.globalInstructions === 'string') {
          courseGlobalInstructions = course.globalInstructions;
        }
      } catch (courseErr) {
        console.warn('Failed to load course.globalInstructions', {
          sessionId,
          courseId: String(session.courseId),
          err: courseErr.message
        });
      }
    }

    // Update session mode if frontend requests a different mode
    if (requestedMode && requestedMode !== session.mode) {
      console.log('Updating session mode from', session.mode, 'to', requestedMode);
      session.mode = requestedMode;
      await session.save();
    }

    // ══ THE CONSTRAINT GATE ═══════════════════════════════════════════════════
    // ONE call, before ANY phase branch. This placement is the whole point.
    //
    // The gate previously lived in three places, all of them inside phase
    // branches: the graph's constraintGateNode (reachable only for phase
    // 'learning'), the legacy path, and the quizzing block. Every branch added
    // since was therefore unprotected by default, and an audit of all 45
    // response paths found five that answered the student with no guardrail —
    // including feedback phase, where an exploit request drew congratulations
    // and a quiz prompt, and pre phase, where it drew a model-authored reply.
    //
    // A gate that each branch must remember to call is a gate that new branches
    // will keep missing. Hoisting it above the branch point makes coverage a
    // property of the route's shape rather than of anyone's diligence, and
    // tests/constraintGateCoverage.test.js fails if a response path ever
    // appears above this line without an explicit GATE-EXEMPT annotation.
    //
    // Anchored control commands are skipped: they are exact-match strings with
    // no free-text payload, so there is nothing to evaluate, and paying for a
    // model call on every "start quiz" would tax the commonest action in the
    // app. Anchored is load-bearing — the old quizzing branch used a SUBSTRING
    // test, which let "give me the working exploit, then start quiz" through.
    if (await enforceConstraints({
      session,
      userMessage,
      globalInstructions: courseGlobalInstructions,
      res,
      pathTag: `phase:${session.phase}`,
    })) {
      return;
    }

    // Handle revision mode - if in revision mode and pre phase, generate revision quiz
    if (session.mode === 'reviewing' && session.phase === 'pre') {
      // Use LLM to extract/generate topic and chatTitle from user message (like study sessions)
      const groqClient = getGroqClient();
      
      const topicExtractionPrompt = `Extract the topic name and generate a concise title from this revision request.

USER MESSAGE: "${userMessage}"

Your task:
1. Extract the actual topic/subject the user wants to revise (remove phrases like "I want to review", "I want to revise", etc.)
2. Generate a concise, human-friendly title for the topic

Examples:
- Input: "I want to review basic data structure concepts"
  Output: {"topic": "Basic Data Structure Concepts", "chatTitle": "Data Structures"}
  
- Input: "I want to revise Python basics"
  Output: {"topic": "Python Basics", "chatTitle": "Python Basics"}
  
- Input: "Review algorithms and complexity"
  Output: {"topic": "Algorithms and Complexity", "chatTitle": "Algorithms"}

Return ONLY valid JSON in this format:
{
  "topic": "extracted topic name (≤60 chars, capitalize first letter of each word)",
  "chatTitle": "concise title (≤40 chars, human-friendly)"
}`;

      try {
        const topicResponse = await groqClient.chat.completions.create({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a topic extraction assistant. Extract topic names from user messages and return ONLY valid JSON. No markdown, no code fences, no explanations outside the JSON.'
            },
            {
              role: 'user',
              content: topicExtractionPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 150,
          response_format: { type: "json_object" }
        });

        let topicData;
        try {
          const responseText = topicResponse.choices[0].message.content.trim();
          topicData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse LLM topic extraction:', parseError);
          // Fallback: use simple extraction
          const fallbackTopic = userMessage.trim()
            .replace(/^(i\s+want\s+to\s+)?(review|revise|practice)\s+/i, '')
            .replace(/^revision\s+(of|for)?\s*/i, '')
            .trim();
          const formattedTopic = fallbackTopic.charAt(0).toUpperCase() + fallbackTopic.slice(1);
          topicData = {
            topic: formattedTopic,
            chatTitle: formattedTopic // Same as topic
          };
        }

        const topic = topicData.topic || userMessage.trim();
        // chatTitle must always match topic (both generated by LLM)
        const chatTitle = topic;

        if (topic && topic.length > 0) {
          // Add user message to session
          const userMsg = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { intent: 'revision', phaseAtSend: 'pre' }
          };
          session.messages.push(userMsg);
          session.topic = topic;
          // chatTitle must always match topic
          session.chatTitle = topic;
          // Don't set phase to 'quizzing' yet - let the revision quiz endpoint handle it
          // This ensures the revision quiz endpoint can properly validate and set up the quiz
          await session.save();
          
          return res.json({
            success: true,
            data: {
              message: `I'll generate a revision quiz for "${topic}".`,
              nextAction: 'START_REVISION_QUIZ',
              topic: topic,
              chatTitle: chatTitle,
              isRevision: true
            }
          });
        }
      } catch (llmError) {
        console.error('LLM topic extraction failed:', llmError);
        // Fallback to simple extraction if LLM fails
        const fallbackTopic = userMessage.trim()
          .replace(/^(i\s+want\s+to\s+)?(review|revise|practice)\s+/i, '')
          .replace(/^revision\s+(of|for)?\s*/i, '')
          .trim();
        
        if (fallbackTopic && fallbackTopic.length > 0) {
          const formattedTopic = fallbackTopic.charAt(0).toUpperCase() + fallbackTopic.slice(1);
          
          const userMsg = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { intent: 'revision', phaseAtSend: 'pre' }
          };
          session.messages.push(userMsg);
          session.topic = formattedTopic;
          session.chatTitle = formattedTopic;
          await session.save();
          
          return res.json({
            success: true,
            data: {
              message: `I'll generate a revision quiz for "${formattedTopic}".`,
              nextAction: 'START_REVISION_QUIZ',
              topic: formattedTopic,
              chatTitle: formattedTopic,
              isRevision: true
            }
          });
        }
      }
    }

    // Handle 'pre' phase - LangGraph orchestrated intent classification
        if (session.phase === 'pre' && useMultiAgent()) {
      try {
        const graphResult = await runStudyGraph({ session, userMessage, requestType: 'chat', globalInstructions: courseGlobalInstructions });
        if (graphResult.success && graphResult.state?.intentResult) {
          const { payload } = graphResult.state.intentResult;

          if (payload.intent === 'learning' && payload.action === 'trigger_assessment') {
            session.messages.push({
              id: `msg_${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date(),
              metadata: { intent: 'learning', phaseAtSend: 'pre', agentPath: true, graphPath: true },
            });
            session.phase = 'assessing';
            await session.save();
            return res.json({
              success: true,
              data: {
                message: "I'll create a personalized learning plan for you right away!",
                intent: 'triggers_assessment', phase: 'assessing',
                shouldTriggerAssessment: true, originalMessage: payload.topic || userMessage,
              },
            });
          }

          const assistantText = payload.response || "Hi! I'm here to help you learn. What would you like to learn about today?";
          const engagement = await runEngagementAgent({
            session,
            baseMessage: assistantText,
            context: { action: payload.action, phase: 'pre' },
          });
          const decorated =
            engagement?.payload?.include && engagement.payload.prefix
              ? `${engagement.payload.prefix}\n\n${assistantText}`
              : assistantText;
          session.messages.push(
            { id: `msg_${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date(), metadata: { intent: payload.intent, phaseAtSend: 'pre', agentPath: true, graphPath: true } },
            { id: `msg_${Date.now() + 1}`, role: 'assistant', content: decorated, timestamp: new Date(), metadata: { intent: payload.action, phaseAtSend: 'pre', agentPath: true, graphPath: true } },
          );
          await session.save();
          return res.json({ success: true, data: { message: decorated, intent: payload.action, phase: 'pre' } });
        }
        console.warn('Graph pre-phase returned no intent, falling through to legacy');
      } catch (agentErr) {
        console.error('Graph intent path failed, falling back to legacy', agentErr.message);
      }
    }

    if (session.phase === 'pre') {
        // If we've already entered quizzing or the user explicitly asks to start the quiz
        const wantsQuiz = typeof userMessage === 'string' && /start\s+quiz/i.test(userMessage);
        // NOTE: unreachable. This sits inside `if (session.phase === 'pre')`, so the
        // phase can never also be quizzing/quiz. Dead since the pre-phase refactor; kept
        // only because deleting it is a behaviour change to verify separately.
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

    /**
     * 'planning' — the student has a draft plan awaiting approval.
     *
     * This branch did not exist, and planning matched no other branch, so the
     * request fell out of the handler with the socket never written: the client
     * spun until it timed out, and nothing was logged because nothing threw.
     *
     * Answered with 200 + the plan rather than the 409 ILLEGAL_PHASE its
     * 'assessing' sibling uses, deliberately, for two reasons:
     *
     * 1. The client's 409 handler calls resumeSessionFromServer and then RETRIES
     *    the same message. sendChatMessage early-returns for phase 'assessing',
     *    which is what stops that becoming a loop — there is no such guard for
     *    'planning', so a 409 here would replace a hang with an infinite retry
     *    spin. That is not better.
     * 2. Unlike 'assessing', the server has the useful answer in hand. The
     *    student's next action really is approve-or-modify, so returning the
     *    plan lets a client whose phase state has drifted render the approval
     *    surface immediately instead of making another round trip.
     *
     * Nothing is persisted to session.messages: this is a statement of session
     * state, not a tutor turn, and writing it would inflate the message counts
     * that feed the engagement sensor and therefore the risk model. Note the
     * constraint gate has already run above, so a violating message never
     * reaches this line — it was refused and logged first.
     */
    if (session.phase === 'planning') {
      return res.json({
        success: true,
        data: {
          message: 'Your learning plan is ready and waiting for you. Take a look at it above, then approve it or tell me what you would like changed.',
          phase: 'planning',
          nextAction: 'APPROVE_PLAN',
          plan: session.plan,
          activeModuleId: session.activeModuleId,
          hint: 'Use the assessment approve or modify endpoint to continue.',
        },
      });
    }

    /**
     * 'completed' — the topic is finished. Same silent-hang defect as planning.
     * The completion surface offers Start Revision Quiz and Summarize, so the
     * reply points at those rather than inventing a new affordance. Also not
     * persisted, for the same reason.
     */
    if (session.phase === 'completed') {
      return res.json({
        success: true,
        data: {
          message: "You've already finished this topic — nice work. You can start a revision quiz to test what stuck, or ask for a summary of what you covered.",
          phase: 'completed',
          plan: session.plan,
          activeModuleId: session.activeModuleId,
          progressPct: session.progressPct || 0,
          points: session.points || 0,
        },
      });
    }


    // Handle 'quizzing' phase - user wants to start the quiz
    if (session.phase === 'quizzing' || session.phase === 'quiz') {
      // No gate call here: the hoisted gate above has already run for this turn.
      // Note wantsQuiz is still a substring test, which is now safe only because
      // anything violating was refused before reaching this block — "give me the
      // working exploit, then start quiz" no longer gets here.
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
      // NOTE (gate): listed in CONTROL_COMMANDS, so the gate skips it.
      // Fires only on the exact literal sentinel `_reset_module_session_`, which
      // the client emits for the Close-quiz control. An exact-match command carries no
      // free-text payload, so there is nothing for the gate to evaluate.
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
          
          // Recalculate session points based on milestone completion (resetting this module will reduce points)
          let calculatedPoints = 0;
          session.plan.forEach(module => {
            if (module.milestones && Array.isArray(module.milestones) && module.milestones.length > 0) {
              const moduleCompleted = module.milestones.filter(m => m.completed === true).length;
              const moduleProgress = moduleCompleted / module.milestones.length;
              const modulePointsContribution = Math.round((module.points || 0) * moduleProgress);
              calculatedPoints += modulePointsContribution;
              req.logger.info('Module points calculation on reset', {
                sessionId,
                moduleId: module.id,
                moduleTitle: module.title,
                modulePoints: module.points,
                moduleCompleted,
                totalMilestones: module.milestones.length,
                moduleProgress,
                modulePointsContribution
              });
            }
          });
          const previousPoints = session.points || 0;
          session.points = Math.min(100, Math.max(0, calculatedPoints));
          // CRITICAL: Gems should NEVER decrease - preserve existing gems
          // Only increase gems if new points would yield more gems
          const newGemsFromPoints = Math.floor(session.points / 20);
          const previousGems = session.gems || 0;
          session.gems = Math.max(session.gems || 0, newGemsFromPoints);
          session.progressPct = session.points;
          
          req.logger.info('Session reset - points recalculated', {
            sessionId,
            activeModuleId: activeModule.id,
            activeModuleTitle: activeModule.title,
            previousPoints,
            calculatedPoints,
            newPoints: session.points,
            previousGems,
            newGemsFromPoints,
            finalGems: session.gems,
            progressPct: session.progressPct
          });
          
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
          
          const resetResponse = {
            success: true,
            data: {
              message: resetMessage,
              tokensIn: 10,
              tokensOut: resetMessage.length,
              hadCheckInReply: false,
              followedUpOutstanding: false,
              phase: session.phase,
              plan: session.plan,
              activeModuleId: session.activeModuleId,
              points: session.points,
              gems: session.gems,
              progressPct: session.progressPct
            }
          };
          
          req.logger.info('Sending reset response with updated points', {
            sessionId,
            points: resetResponse.data.points,
            gems: resetResponse.data.gems,
            progressPct: resetResponse.data.progressPct,
            activeModuleId: resetResponse.data.activeModuleId
          });
          
          return res.json(resetResponse);
        }
      }
      
      // Handle "ready" message - reset to first milestone of current module
      // NOTE: anchored exact match on the single word "ready" (^\s*ready\s*$), so no
      // free-text payload can ride along. The teaching content it generates is produced from
      // the module plan, not from anything the student wrote.
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
          
          // Recalculate session points based on milestone completion (resetting this module will reduce points)
          let calculatedPoints = 0;
          session.plan.forEach(module => {
            if (module.milestones && Array.isArray(module.milestones) && module.milestones.length > 0) {
              const moduleCompleted = module.milestones.filter(m => m.completed === true).length;
              const moduleProgress = moduleCompleted / module.milestones.length;
              const modulePointsContribution = Math.round((module.points || 0) * moduleProgress);
              calculatedPoints += modulePointsContribution;
            }
          });
          session.points = Math.min(100, Math.max(0, calculatedPoints));
          // CRITICAL: Gems should NEVER decrease - preserve existing gems
          const newGemsFromPoints = Math.floor(session.points / 20);
          session.gems = Math.max(session.gems || 0, newGemsFromPoints);
          session.progressPct = session.points;
          
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
          const teacherPrompt = buildTeacherPrompt(session, triggerMessage, false, null, null, courseGlobalInstructions);

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
                activeModuleId: session.activeModuleId,
                points: session.points,
                gems: session.gems,
                progressPct: session.progressPct,
                currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0,
                meta: buildChatMeta(session),
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
                activeModuleId: session.activeModuleId,
                points: session.points,
                gems: session.gems,
                progressPct: session.progressPct,
                currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0,
                meta: buildChatMeta(session),
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

            // NOTE: same anchored restart command as above; this is the branch taken
            // when the thread has no stored topic, and it only asks the student to name one.
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
          // NOTE: reached only when isRestartCommand matched the anchored regex
          // /^\s*(restart revision|restart|start revision|revision)\s*$/i — an exact control
          // command with no free-text payload.
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
      // NOTE: anchored exact match on the single word "start" (^\s*start\s*$). Same
      // reasoning as the "ready" branch above — no student free text reaches the tutor.
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
            const teacherPrompt = buildTeacherPrompt(session, triggerMessage, false, null, null, courseGlobalInstructions);

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
                  activeModuleId: session.activeModuleId,
                  currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0,
                  meta: buildChatMeta(session),
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
                  activeModuleId: session.activeModuleId,
                  currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0,
                  meta: buildChatMeta(session),
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

      // ── LangGraph orchestrated learning path ──
      if (useMultiAgent()) {
        // Streaming parity with the legacy path: chunks flow during teaching
        // generation. Headers are sent lazily on the FIRST chunk, so turns
        // that produce no chunks (quiz gate, module completion) still respond
        // as plain JSON through the headers-aware exits below.
        const graphWantStream = req.body.stream && useStreaming();
        const graphWriteChunk = (chunk) => {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();
          }
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          if (typeof res.flush === 'function') res.flush();
        };
        const graphStreamCallback = graphWantStream ? graphWriteChunk : null;
        try {
          // GATE-PROVIDED-BY: the hoisted gate at the top of this handler already ran for this
          // turn, unconditionally and before any phase branch, so every exit in this block is
          // downstream of it. The graph no longer carries a gate node of its own — it only ever
          // covered phase 'learning' (routeAfterRouter has no 'feedback' branch), which is how a
          // feedback-phase exploit request came to be answered with congratulations.
          const graphResult = await runStudyGraph({ session, userMessage, requestType: 'chat', globalInstructions: courseGlobalInstructions, streamCallback: graphStreamCallback });
          if (graphResult.success) {
            const gs = graphResult.state;
            const cm = gs.convManagerResult?.payload;
            const assessment = gs.assessmentResult?.payload;
            const teaching = gs.teachingResult;

            const activeModule = session.plan?.find(m => m.id === session.activeModuleId);
            const milestoneIdx = session.meta?.currentMilestoneIndex ?? 0;
            const currentMilestone = activeModule?.milestones?.[milestoneIdx];

            // The graph's own constraint-gate node was removed along with the two other
            // scattered gate sites; state.refusalResult no longer exists. Refusals are decided
            // once, above, before this block is entered.

            if (cm?.shouldStartQuiz || cm?.action === 'start_quiz') {
              session.messages.push({ id: `msg_${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date(), metadata: { intent: cm.intent, phaseAtSend: session.phase, graphPath: true } });
              await session.save();
              if (res.headersSent) {
                res.write(`data: ${JSON.stringify({ done: true, message: cm.response || "Great — when you're ready, click Start Quiz or type “start quiz”.", phase: session.phase })}\n\n`);
                return res.end();
              }
              return res.json({
                success: true,
                data: {
                  message: cm.response || "Great — when you're ready, click Start Quiz or type “start quiz”.",
                  phase: session.phase,
                },
              });
            }

            // Retry count for the milestone being assessed, read BEFORE this
            // turn's increment. This is the authoritative first-vs-second-wrong
            // signal for scenario selection (the grader's own `recommendation`
            // is model output and cannot be trusted for escalation).
            const retryCountForTeacher = Number(session.meta?.milestoneRetryCount?.[milestoneIdx] || 0);

            if (assessment) {
              // If the LLM misgraded an obvious concept check, fix it deterministically.
              if (session?.meta?.outstandingCheck) {
                const overridden = overrideAssessmentIfObviouslyCorrect(
                  session.meta.outstandingCheck,
                  userMessage,
                  assessment
                );
                // Mutate local variable (used for progression + teacher regeneration)
                if (overridden !== assessment) {
                  gs.assessmentResult = gs.assessmentResult || {};
                  gs.assessmentResult.payload = overridden;
                }
              }

              const effectiveAssessment = gs.assessmentResult?.payload || assessment;
              const retryCount = retryCountForTeacher;
              const assessmentFeedback = buildAssessmentFeedback({
                responseType: effectiveAssessment.responseType,
                understood: effectiveAssessment.understood,
                recommendation: effectiveAssessment.recommendation,
                retryCount,
              });
              if (effectiveAssessment.understood) {
                if (effectiveAssessment.recommendation !== 'clarify_again') {
                  if (currentMilestone) currentMilestone.completed = true;
                  if (activeModule) {
                    if (!activeModule.completedMilestones) activeModule.completedMilestones = [];
                    if (!activeModule.completedMilestones.includes(milestoneIdx)) activeModule.completedMilestones.push(milestoneIdx);
                  }
                  recordMilestoneAttempt({
                    session,
                    milestoneIndex: milestoneIdx,
                    milestoneText: currentMilestone?.text || '',
                    passed: true,
                    autoAdvanced: false,
                    attemptNumber: retryCount + 1,
                  });
                  const nextIdx = milestoneIdx + 1;
                  if (nextIdx < (activeModule?.milestones?.length || 0)) {
                    session.meta.currentMilestoneIndex = nextIdx;
                    session.meta.milestoneBeingTaught = false;
                    session.meta.outstandingCheck = null;
                  } else {
                    session.meta.milestoneBeingTaught = false;
                    session.meta.outstandingCheck = null;
                    // IMPORTANT: Do NOT auto-enter quizzing; user must explicitly start quiz.
                    session.phase = 'learning';
                  }
                }
              } else if (effectiveAssessment.responseType !== 'clarification_request') {
                if (!session.meta.milestoneRetryCount) session.meta.milestoneRetryCount = {};
                if (retryCount < 1) {
                  session.meta.milestoneRetryCount[milestoneIdx] = retryCount + 1;
                  recordMilestoneAttempt({
                    session,
                    milestoneIndex: milestoneIdx,
                    milestoneText: currentMilestone?.text || '',
                    passed: false,
                    autoAdvanced: false,
                    attemptNumber: retryCount + 1,
                  });
                } else {
                  if (currentMilestone) currentMilestone.completed = true;
                  if (activeModule && !activeModule.completedMilestones?.includes(milestoneIdx)) {
                    if (!activeModule.completedMilestones) activeModule.completedMilestones = [];
                    activeModule.completedMilestones.push(milestoneIdx);
                  }
                  recordMilestoneAttempt({
                    session,
                    milestoneIndex: milestoneIdx,
                    milestoneText: currentMilestone?.text || '',
                    passed: false,
                    autoAdvanced: true,
                    attemptNumber: retryCount + 1,
                  });
                  const nextIdx = milestoneIdx + 1;
                  if (nextIdx < (activeModule?.milestones?.length || 0)) {
                    session.meta.currentMilestoneIndex = nextIdx;
                    session.meta.milestoneBeingTaught = false;
                    session.meta.outstandingCheck = null;
                  } else {
                    session.meta.milestoneBeingTaught = false;
                    session.meta.outstandingCheck = null;
                    // IMPORTANT: Do NOT auto-enter quizzing; user must explicitly start quiz.
                    session.phase = 'learning';
                  }
                }
              }

              // Attach feedback to state for later composition (teaching, re-teach, or module completion).
              gs.__assessmentFeedback = assessmentFeedback;
            }

            // If we've completed the last milestone (or moved past it), force the quiz transition.
            // This prevents getting stuck on the final milestone with no quiz handoff.
            const allMilestonesDone = !!activeModule?.milestones?.length && activeModule.milestones.every(m => m.completed === true);
            const moduleJustCompleted = allMilestonesDone;
            const advancedToNextMilestone =
              session.phase === 'learning' &&
              typeof session.meta?.currentMilestoneIndex === 'number' &&
              session.meta.currentMilestoneIndex !== milestoneIdx;

            let assistantResponse = '';
            if (moduleJustCompleted) {
              const modulePoints = activeModule?.points || 0;
              assistantResponse =
                `Amazing work — you’ve completed every milestone in **${activeModule?.title || 'this module'}**. ` +
                `That’s a big step forward. You’ve earned progress toward the **${modulePoints} points** for this module, ` +
                `and you’re at **${session.points || 0}/100 points** with **💎 ${session.gems || 0}** gems so far.\n\n` +
                `When you’re ready, click **Start Quiz** or type **“start quiz”** to launch a quick mastery check.`;
              // Clear teaching/assessment loop state when transitioning to quiz
              if (session.meta) {
                session.meta.outstandingCheck = null;
                session.meta.milestoneBeingTaught = false;
                session.meta.countSinceLastCheck = 0;
              }
            } else if (advancedToNextMilestone) {
              // IMPORTANT: The graph's teaching result was generated BEFORE we advanced the milestone.
              // Re-generate teaching for the NEW milestone so UI + teaching stay aligned.
              const milestoneInfo = { moveToNextMilestone: true, markMilestoneComplete: true };
              const assessmentForTeacher = mapAssessmentForTeacher(assessment, retryCountForTeacher);

              // This re-teach IS the turn's final content (the in-graph
              // teaching was suppressed for advancing turns) — stream it, and
              // keep instructor guidelines constraining it like every other
              // teaching call.
              const reTeach = await runTeachingAgent({
                session,
                userMessage,
                isFollowUp: true,
                assessmentResult: assessmentForTeacher,
                milestoneInfo,
                globalInstructions: courseGlobalInstructions,
                streamCallback: graphStreamCallback,
              });

              assistantResponse = reTeach?.uiMessage || reTeach?.payload?.content || '';
              if (!assistantResponse) {
                assistantResponse = 'Nice work — let’s continue to the next milestone.';
              }
            } else if (teaching?.uiMessage) {
              assistantResponse = teaching.uiMessage;
            } else if (session.phase === 'learning' && !moduleJustCompleted && !advancedToNextMilestone) {
              // Teaching agent skipped or failed validation; still return full teaching via unified prompt.
              try {
                const isFollowUp = !!assessment;
                const assessmentForTeacher = mapAssessmentForTeacher(assessment, retryCountForTeacher);
                const milestoneInfo = cm
                  ? {
                      moveToNextMilestone: cm.moveToNextMilestone,
                      markMilestoneComplete: cm.markMilestoneComplete,
                    }
                  : null;
                const teacherPrompt = buildTeacherPrompt(
                  session,
                  userMessage,
                  isFollowUp,
                  assessmentForTeacher,
                  milestoneInfo,
                  courseGlobalInstructions
                );
                assistantResponse = await callTeacherAPI(teacherPrompt, req.maxTokens || 1500, session);
              } catch (fallbackErr) {
                req.logger?.error?.('Graph path teacher fallback failed', { error: fallbackErr.message, sessionId });
                assistantResponse = cm?.response || 'Thanks for your update! Let me think about the best next step.';
              }
            } else if (cm?.response) {
              assistantResponse = cm.response;
            } else {
              assistantResponse = 'Thanks for your update! Let me think about the best next step.';
            }

            // Ensure assessment follow-ups ALWAYS include explicit feedback.
            if (gs.__assessmentFeedback && typeof gs.__assessmentFeedback === 'string') {
              const fb = gs.__assessmentFeedback.trim();
              if (fb) {
                assistantResponse = `${fb}\n\n${assistantResponse}`;
              }
            }

            const extractedQ = extractQuestion(assistantResponse);
            if (extractedQ && !moduleJustCompleted) {
              session.meta.outstandingCheck = extractedQ;
              session.meta.countSinceLastCheck = 0;
              session.meta.milestoneBeingTaught = true;
            }

            // Recalculate progress
            let calculatedPoints = 0;
            (session.plan || []).forEach(mod => {
              if (mod.milestones?.length) {
                const done = mod.milestones.filter(m => m.completed).length;
                calculatedPoints += Math.round((mod.points || 0) * (done / mod.milestones.length));
              }
            });
            session.points = Math.min(100, Math.max(0, calculatedPoints));
            session.gems = Math.floor(session.points / 20);
            session.progressPct = session.points;

            session.messages.push(
              { id: `msg_${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date(), metadata: { intent: cm?.intent || 'learning', phaseAtSend: session.phase, graphPath: true } },
              { id: `msg_${Date.now() + 1}`, role: 'assistant', content: assistantResponse, timestamp: new Date(), metadata: { intent: cm?.action || 'teach', phaseAtSend: session.phase, graphPath: true, hadCheckInReply: !!extractedQ } },
            );
            await session.save();

            // Engagement decoration (wisely, optional)
            const engagement = await runEngagementAgent({
              session,
              baseMessage: assistantResponse,
              context: {
                action: cm?.action || 'teach',
                milestoneCompleted: !!(assessment?.understood && assessment?.recommendation !== 'clarify_again'),
                moduleCompleted: !!moduleJustCompleted,
                phase: session.phase,
              },
            });
            if (engagement?.payload?.include) {
              const prefix = engagement.payload.prefix ? `${engagement.payload.prefix}\n\n` : '';
              const suffix = engagement.payload.suffix ? `\n\n${engagement.payload.suffix}` : '';
              assistantResponse = `${prefix}${assistantResponse}${suffix}`;
              // Update last assistant message content in session for consistency
              const last = session.messages[session.messages.length - 1];
              if (last?.role === 'assistant') last.content = assistantResponse;
              await session.save();
            }

            const data = {
              message: assistantResponse,
              tokensIn: Math.ceil(userMessage.length / 4),
              tokensOut: Math.ceil(assistantResponse.length / 4),
              hadCheckInReply: !!extractedQ,
              followedUpOutstanding: cm?.isFollowUpToOutstanding || false,
              phase: session.phase,
              milestoneCompleted: assessment?.understood && assessment?.recommendation !== 'clarify_again',
              moduleCompleted: moduleJustCompleted,
              shouldGenerateQuiz: moduleJustCompleted,
              // Intentionally do NOT return nextAction START_QUIZ; quiz starts only on explicit user intent.
              currentMilestoneIndex: session.meta.currentMilestoneIndex ?? 0,
              totalMilestones: activeModule?.milestones?.length || 0,
              plan: session.plan,
              activeModuleId: session.activeModuleId,
              progressPct: session.progressPct || 0,
              points: session.points || 0,
              meta: buildChatMeta(session),
            };
            if (res.headersSent) {
              // Chunks already streamed — close with the done frame carrying
              // the final composed message (the client replaces streamed text
              // with it, so post-generation prefixes/decoration still land).
              res.write(`data: ${JSON.stringify({ done: true, ...data })}\n\n`);
              return res.end();
            }
            if (req.body.stream) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.write(`data: ${JSON.stringify({ done: true, ...data })}\n\n`);
              return res.end();
            }
            return res.json({ success: true, data });
          }
          console.warn('[Graph] Learning path returned !success, falling to legacy');
          if (res.headersSent) {
            // Cannot fall to legacy on a response that already streamed chunks.
            res.write(`data: ${JSON.stringify({ error: 'Response interrupted. Please retry.' })}\n\n`);
            return res.end();
          }
        } catch (graphErr) {
          console.error('[Graph] Learning path failed, falling to legacy', graphErr.message);
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: 'Response interrupted. Please retry.' })}\n\n`);
            // NOTE: the graph threw after chunks had already streamed, so we cannot fall
            // back to legacy on this response. Terminates a broken SSE stream with an error and
            // returns no tutor content. Note the un-streamed case falls through to the legacy
            // gate below rather than answering here.
            return res.end();
          }
        }
      }
      
      // The legacy-path constraint gate used to live here. It is gone because
      // the hoisted gate near the top of the handler already ran for this turn,
      // on both sides of USE_MULTI_AGENT and in every phase — which is strictly
      // more coverage than this call had, since it sat inside the
      // learning/feedback branch and could not protect pre, quizzing, revision,
      // or (via the graph's missing 'feedback' route) feedback itself.

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
            milestoneRetryCount,
            // The grader was subject- and language-blind: it saw only the
            // question, the answer and the milestone text, so a Java answer was
            // judged against a prompt whose only worked examples were Python.
            { topicTitle: session.topic || '' }
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
        
        // Emit a MilestoneAttempt event for analytics, unless this was a pure
        // clarification request (not an answer). Fire-and-forget — recordMilestoneAttempt
        // swallows its own errors so the chat flow can't be broken by analytics.
        {
          const a = llmDecision.assessmentResult || {};
          const answered = !a.isClarificationRequest && (
            llmDecision.markMilestoneComplete ||
            a.isFirstIncorrect ||
            a.isSecondIncorrect ||
            a.understood === true ||
            a.understood === false
          );
          if (answered && typeof validMilestoneIndex === 'number' && validMilestoneIndex >= 0) {
            const retryCount = session.meta?.milestoneRetryCount?.[validMilestoneIndex] || 0;
            const passed = !!llmDecision.markMilestoneComplete && !a.isSecondIncorrect;
            const autoAdvanced = !!a.isSecondIncorrect;
            recordMilestoneAttempt({
              session,
              milestoneIndex: validMilestoneIndex,
              milestoneText: currentMilestone?.text || '',
              passed,
              autoAdvanced,
              attemptNumber: retryCount + 1,
            });
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
            
            // Calculate progress based on POINTS, not milestone count
            // Progress percentage should match points directly (points out of 100)
            const overallProgressPct = session.points || 0;
            
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
          const quizMessage = `Fantastic work finishing every milestone in **${activeModule?.title || 'this module'}**! When you're ready, say “start quiz” and I'll launch a quick mastery check for this module. You have a great chance to earn bonus gems on successful completion of this quiz!`;
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
          const teacherPrompt = buildTeacherPrompt(session, userMessage, llmDecision.isFollowUpToOutstanding, assessmentResult, milestoneInfo, courseGlobalInstructions);
          
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
          
          const wantStream = req.body.stream && useStreaming();
          if (wantStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();
            const writeChunk = (chunk) => {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
              if (typeof res.flush === 'function') res.flush();
            };
            try {
              assistantResponse = await callTeacherAPIStream(teacherPrompt, req.maxTokens || 1500, session, { onChunk: writeChunk });
            } catch (streamErr) {
              console.error('Streaming failed, sending error event', { error: streamErr.message });
              res.write(`data: ${JSON.stringify({ error: 'Stream interrupted. Please retry.' })}\n\n`);
              res.end();
              return;
            }
          } else {
            assistantResponse = await callTeacherAPI(teacherPrompt, req.maxTokens || 1500, session, validationContext);
          }
          
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
        const data = {
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
          points: session.points || 0,
          meta: buildChatMeta(session),
        };
        // Pilot B3: only speak SSE when SSE headers were actually sent. The
        // module-completion / non-teaching branches skip the streaming block
        // above, so `req.body.stream` alone used to write an SSE-format body
        // on a plain response — the client could not parse it, and the chat
        // white-screened at every module boundary.
        if (req.body.stream && res.headersSent) {
          res.write(`data: ${JSON.stringify({ done: true, ...data })}\n\n`);
          return res.end();
        }
        return res.json({ success: true, data });

      } catch (error) {
        console.error('LLM conversation decision failed', { sessionId, error: error.message, stack: error.stack });
        
        // Fallback: use teacher prompt
        const teacherPrompt = buildTeacherPrompt(session, userMessage, false, null, null, courseGlobalInstructions);
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
        
        const activeMod = (session.plan || []).find(m => m.id === session.activeModuleId);
        return res.json({
          success: true,
          data: {
            message: assistantResponse,
            tokensIn: Math.ceil(userMessage.length / 4),
            tokensOut: Math.ceil(assistantResponse.length / 4),
            hadCheckInReply: false,
            followedUpOutstanding: false,
            phase: session.phase,
            plan: session.plan,
            activeModuleId: session.activeModuleId,
            currentMilestoneIndex: session.meta?.currentMilestoneIndex ?? 0,
            totalMilestones: activeMod?.milestones?.length || 0,
            progressPct: session.progressPct || 0,
            points: session.points || 0,
            meta: buildChatMeta(session),
          }
        });
      }
    }

    /**
     * TERMINAL BACKSTOP — the handler must never fall off its own end.
     *
     * Reaching here means a session phase matched no branch above. That is a
     * server bug, and until this existed its symptom was the worst available
     * one: no response at all, no exception, no log line, and a client spinning
     * until it timed out. Two phases ('planning', 'completed') sat in exactly
     * that state.
     *
     * Answers 200 rather than 500 or 409 on purpose. 500 would be untrue —
     * nothing failed — and 409 would feed the client's resume-and-retry path,
     * turning a hang into a retry spin for any phase that lacks a client-side
     * guard. A neutral 200 is the least bad thing for a student to see while
     * the loud log below is what tells us. tests/chatNoResponse.test.js walks
     * the whole Session phase enum, so a new phase that lands here fails CI
     * before it can reach anyone.
     */
    req.logger?.error?.('Chat handler reached terminal backstop — no branch handled this phase', {
      sessionId,
      phase: session.phase,
      mode: session.mode,
      multiAgent: useMultiAgent(),
    });
    console.error('[chat] UNHANDLED_PHASE reached terminal backstop', { sessionId, phase: session.phase });
    return res.json({
      success: true,
      data: {
        message: "I can't pick this conversation up from where it is right now. Try reopening the topic from your course page.",
        phase: session.phase,
        code: 'UNHANDLED_PHASE',
        plan: session.plan,
        activeModuleId: session.activeModuleId,
      },
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
      // GATE-EXEMPT: 4xx validation error from the top-level handler; success:false, no tutor content.
      return res.status(statusCode).json(response);
    }

    if (error.message.includes('GROQ_API_ERROR')) {
      const { statusCode, response } = ERROR_RESPONSES.LLM_PROVIDER_ERROR(error.message);
      // GATE-EXEMPT: upstream LLM failure surfaced as an error; success:false, no tutor content.
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
