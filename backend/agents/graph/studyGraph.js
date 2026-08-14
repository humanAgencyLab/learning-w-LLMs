const { Annotation, StateGraph, END } = require('@langchain/langgraph');
const { runIntentAgent } = require('../intentAgent');
const { runPlanAgent } = require('../planAgent');
const { runPlanModifyAgent } = require('../planModifyAgent');
const { runConversationManagerAgent } = require('../conversationManagerAgent');
const { runAssessmentAgent } = require('../assessmentAgent');
const { runTeachingAgent, mapAssessmentForTeacher } = require('../teachingAgent');
const { runQuizAgent } = require('../quizAgent');
const CourseTopic = require('../../models/CourseTopic');
const { runFeedbackAgent } = require('../feedbackAgent');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const AgentState = Annotation.Root({
  session:            Annotation({ reducer: (_, v) => v, default: () => null }),
  userMessage:        Annotation({ reducer: (_, v) => v, default: () => '' }),
  requestType:        Annotation({ reducer: (_, v) => v, default: () => '' }),
  phase:              Annotation({ reducer: (_, v) => v, default: () => 'pre' }),
  // Course.globalInstructions for course-scoped sessions ('' otherwise).
  // Consumed by the teaching node AND the quiz node (2026-08 pre-window fix:
  // quizzes now reflect instructor guidelines; shipped before the study window
  // opened so every participant sees one consistent stimulus). Assessment
  // stays instruction-blind for the study window per PILOT_DECISIONS.md — see
  // the teachingNode comment; do not pass this to assessmentNode.
  globalInstructions: Annotation({ reducer: (_, v) => v, default: () => '' }),

  intentResult:       Annotation({ reducer: (_, v) => v, default: () => null }),
  planResult:         Annotation({ reducer: (_, v) => v, default: () => null }),
  convManagerResult:  Annotation({ reducer: (_, v) => v, default: () => null }),
  assessmentResult:   Annotation({ reducer: (_, v) => v, default: () => null }),
  teachingResult:     Annotation({ reducer: (_, v) => v, default: () => null }),
  quizResult:         Annotation({ reducer: (_, v) => v, default: () => null }),
  feedbackResult:     Annotation({ reducer: (_, v) => v, default: () => null }),

  streamCallback:     Annotation({ reducer: (_, v) => v, default: () => null }),
  error:              Annotation({ reducer: (_, v) => v, default: () => null }),
});

// ---------------------------------------------------------------------------
// Router — decides which node to visit first based on phase + requestType
// ---------------------------------------------------------------------------

function routerNode(state) {
  return {};
}

function routeAfterRouter(state) {
  const { phase, requestType } = state;
  if (phase === 'pre')                           return 'intent';
  if (phase === 'assessing')                     return 'plan';
  if (phase === 'planning' && requestType === 'modify') return 'planModify';
  if (phase === 'learning')                      return 'convManager';
  if (requestType === 'quiz_start')              return 'quiz';
  if (requestType === 'quiz_submit')             return 'feedback';
  return END;
}

// ---------------------------------------------------------------------------
// Agent nodes — thin wrappers around existing agent runners
// ---------------------------------------------------------------------------

async function intentNode(state) {
  const result = await runIntentAgent({
    session: state.session,
    userMessage: state.userMessage,
  });
  return { intentResult: result };
}

async function planNode(state) {
  const result = await runPlanAgent({
    userMessage: state.userMessage,
    profile: state.session?.profile,
  });
  return { planResult: result };
}

async function planModifyNode(state) {
  const result = await runPlanModifyAgent({
    session: state.session,
    modificationRequest: state.userMessage,
  });
  return { planResult: result };
}

async function convManagerNode(state) {
  const result = await runConversationManagerAgent({
    session: state.session,
    userMessage: state.userMessage,
  });
  return { convManagerResult: result };
}

/**
 * The constraint gate used to live here as a node between convManager and
 * assessment/teaching. It was removed when the gate was hoisted to a single
 * call at the top of POST /v1/chat.
 *
 * The reason is worth keeping: this node was only ever reachable through
 * convManager, and routeAfterRouter routes to convManager for phase 'learning'
 * only — there is no 'feedback' branch. So a feedback-phase chat turn ran the
 * graph to END with no gate at all, and the route answered it with a canned
 * congratulation. A guardrail placed inside a router is a guardrail that covers
 * exactly the routes someone remembered to list.
 */
function routeAfterConvManager(state) {
  const action = state.convManagerResult?.payload?.action;
  if (action === 'assess') return 'assessment';
  if (action === 'teach' || action === 'clarify') return 'teaching';
  // Conversation manager may return respond_naturally/provide_guidance while a milestone is active.
  // Those must still run the teaching agent so the student gets full content + one check-in question.
  if (action === 'start_quiz') return END;

  const session = state.session;
  const outstanding = session?.meta?.outstandingCheck;
  const phase = session?.phase;

  if (
    phase === 'learning' &&
    (action === 'respond_naturally' || action === 'provide_guidance' || action === 'continue_learning')
  ) {
    if (outstanding) return 'assessment';
    return 'teaching';
  }

  return END;
}

async function assessmentNode(state) {
  const session = state.session;
  const outstanding = session?.meta?.outstandingCheck || '';
  const milestone = (() => {
    const mod = session?.plan?.find(m => m.id === session.activeModuleId);
    return mod?.milestones?.[session?.meta?.currentMilestoneIndex ?? 0];
  })();
  const retryCount = session?.meta?.milestoneRetryCount?.[String(session?.meta?.currentMilestoneIndex ?? 0)] || 0;

  const result = await runAssessmentAgent({
    question: outstanding,
    answer: state.userMessage,
    milestone,
    retryCount,
    // Subject/language context so the grader judges the answer in the course's
    // language. NOT the instructor's guidelines — assessment stays
    // instruction-blind for the study window (see the AgentState comment).
    topicTitle: session?.topic || '',
  });
  return { assessmentResult: result };
}

function routeAfterAssessment(state) {
  const payload = state.assessmentResult?.payload;
  if (!payload) return END;
  if (payload.understood || payload.responseType === 'clarification_request' || payload.responseType === 'wrong_answer') {
    return 'teaching';
  }
  return END;
}

async function teachingNode(state) {
  const cm = state.convManagerResult?.payload;
  const assessment = state.assessmentResult?.payload;
  const isFollowUp = !!assessment;

  // Canonical mapping to the legacy analyzer shape lives next to the teaching
  // agent (mapAssessmentForTeacher) so every call site agrees on scenario
  // semantics — including correct_needs_more, which the old inline mapping
  // could never express (it keyed needsMoreClarification off
  // clarification_request, which forces understood=false).
  const retryCount = state.session?.meta?.milestoneRetryCount?.[state.session?.meta?.currentMilestoneIndex ?? 0] || 0;
  const assessmentForTeacher = mapAssessmentForTeacher(assessment, retryCount);

  const milestoneInfo = cm ? {
    moveToNextMilestone: cm.moveToNextMilestone,
    markMilestoneComplete: cm.markMilestoneComplete,
  } : null;

  // When the answer passes and will advance the milestone, the route discards
  // this in-graph teaching and re-teaches the NEW milestone — don't stream
  // content that is about to be replaced.
  const willAdvance = !!(assessment?.understood && assessment?.recommendation !== 'clarify_again');

  const result = await runTeachingAgent({
    session: state.session,
    userMessage: state.userMessage,
    isFollowUp,
    assessmentResult: assessmentForTeacher,
    milestoneInfo,
    // Instructor guidelines constrain tutor OUTPUT here, matching the legacy
    // path. They are intentionally NOT passed to assessmentNode: all pilot
    // evidence (grading nondeterminism, P5) was collected with instruction-
    // blind grading, and PILOT_DECISIONS.md defers grading-behavior changes
    // to after the study window.
    globalInstructions: state.globalInstructions,
    streamCallback: willAdvance ? null : state.streamCallback,
  });
  return { teachingResult: result };
}

async function quizNode(state) {
  const session = state.session;
  const mod = session?.plan?.find(m => m.id === session.activeModuleId);
  if (!mod) return { quizResult: { type: 'quiz', payload: null, valid: false, errors: ['No active module'] } };

  let quizPattern = mod.quizPattern;
  if ((!quizPattern || !Object.keys(quizPattern).length) && session.courseTopicId) {
    const topic = await CourseTopic.findById(session.courseTopicId).lean();
    const src = topic?.modules?.find(m => m.moduleId === mod.id);
    if (src?.quizPattern && Object.keys(src.quizPattern).length) {
      quizPattern = src.quizPattern;
    }
  }

  const plain = typeof mod.toObject === 'function' ? mod.toObject() : { ...mod };
  const modForAgent = { ...plain, quizPattern: quizPattern || {} };
  const result = await runQuizAgent({ module: modForAgent, globalInstructions: state.globalInstructions });
  return { quizResult: result };
}

async function feedbackNode(state) {
  const session = state.session;
  const latestAttempt = (session?.quizAttempts || [])
    .filter(a => a.status === 'submitted')
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
  if (!latestAttempt) {
    return { feedbackResult: { type: 'feedback', payload: { message: 'No quiz results found.', nextAction: 'retry_milestones' } } };
  }
  const result = await runFeedbackAgent({
    quizResult: {
      scorePct: latestAttempt.scorePct,
      passed: latestAttempt.passed,
      numCorrect: latestAttempt.items?.filter((item, i) => {
        const answer = latestAttempt.answers?.find(a => a.id === item.id);
        return answer && answer.userIndex === item.correctIndex;
      }).length || 0,
      total: latestAttempt.items?.length || 5,
    },
    userMessage: state.userMessage,
  });
  return { feedbackResult: result };
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

let _compiled = null;

function compileStudyGraph() {
  if (_compiled) return _compiled;

  const graph = new StateGraph(AgentState)
    .addNode('router',      routerNode)
    .addNode('intent',      intentNode)
    .addNode('plan',        planNode)
    .addNode('planModify',  planModifyNode)
    .addNode('convManager', convManagerNode)
    .addNode('assessment',  assessmentNode)
    .addNode('teaching',    teachingNode)
    .addNode('quiz',        quizNode)
    .addNode('feedback',    feedbackNode)

    .addEdge('__start__', 'router')
    .addConditionalEdges('router', routeAfterRouter)

    .addEdge('intent',     '__end__')
    .addEdge('plan',       '__end__')
    .addEdge('planModify', '__end__')

    // convManager decides what runs next. The constraint gate is deliberately
    // NOT in this graph any more — see the note above routeAfterConvManager.
    .addConditionalEdges('convManager', routeAfterConvManager)
    .addConditionalEdges('assessment',  routeAfterAssessment)

    .addEdge('teaching', '__end__')
    .addEdge('quiz',     '__end__')
    .addEdge('feedback', '__end__');

  _compiled = graph.compile();
  return _compiled;
}

module.exports = { compileStudyGraph, AgentState };
