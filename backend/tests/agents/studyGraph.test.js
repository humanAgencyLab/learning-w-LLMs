jest.mock('../../agents/intentAgent');
jest.mock('../../agents/planAgent');
jest.mock('../../agents/planModifyAgent');
jest.mock('../../agents/conversationManagerAgent');
jest.mock('../../agents/assessmentAgent');
jest.mock('../../agents/teachingAgent');
jest.mock('../../agents/quizAgent');
jest.mock('../../agents/feedbackAgent');

const { runIntentAgent } = require('../../agents/intentAgent');
const { runPlanAgent } = require('../../agents/planAgent');
const { runPlanModifyAgent } = require('../../agents/planModifyAgent');
const { runConversationManagerAgent } = require('../../agents/conversationManagerAgent');
const { runAssessmentAgent } = require('../../agents/assessmentAgent');
const { runTeachingAgent } = require('../../agents/teachingAgent');
const { runQuizAgent } = require('../../agents/quizAgent');
const { runFeedbackAgent } = require('../../agents/feedbackAgent');

let compileStudyGraph;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  jest.mock('../../agents/intentAgent');
  jest.mock('../../agents/planAgent');
  jest.mock('../../agents/planModifyAgent');
  jest.mock('../../agents/conversationManagerAgent');
  jest.mock('../../agents/assessmentAgent');
  jest.mock('../../agents/teachingAgent');
  jest.mock('../../agents/quizAgent');
  jest.mock('../../agents/feedbackAgent');

  ({ compileStudyGraph } = require('../../agents/graph/studyGraph'));
});

const baseSession = {
  phase: 'pre',
  messages: [],
  meta: {},
  plan: [],
};

describe('StudyGraph routing', () => {
  it('routes pre-phase to intent node', async () => {
    const intentPayload = { intent: 'learning', action: 'trigger_assessment', topic: 'Python' };
    require('../../agents/intentAgent').runIntentAgent.mockResolvedValue({
      type: 'intent',
      payload: intentPayload,
    });

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: { ...baseSession, phase: 'pre' },
      userMessage: 'I want to learn Python',
      phase: 'pre',
      requestType: 'chat',
    });

    expect(result.intentResult).toBeDefined();
    expect(result.intentResult.payload.intent).toBe('learning');
    expect(require('../../agents/intentAgent').runIntentAgent).toHaveBeenCalledTimes(1);
    expect(require('../../agents/planAgent').runPlanAgent).not.toHaveBeenCalled();
  });

  it('routes assessing phase to plan node', async () => {
    require('../../agents/planAgent').runPlanAgent.mockResolvedValue({
      type: 'plan',
      payload: { topic: 'Python', plan: [] },
      valid: true,
      errors: [],
    });

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: { ...baseSession, phase: 'assessing', profile: { name: 'Test' } },
      userMessage: 'Python',
      phase: 'assessing',
      requestType: 'assess',
    });

    expect(result.planResult).toBeDefined();
    expect(result.planResult.payload.topic).toBe('Python');
    expect(require('../../agents/planAgent').runPlanAgent).toHaveBeenCalledTimes(1);
  });

  it('routes planning+modify to planModify node', async () => {
    require('../../agents/planModifyAgent').runPlanModifyAgent.mockResolvedValue({
      type: 'plan_modify',
      payload: { topic: 'Python', plan: [] },
      valid: true,
      errors: [],
    });

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: { ...baseSession, phase: 'planning', plan: [{ title: 'M1', milestones: [] }], topic: 'Python' },
      userMessage: 'make it simpler',
      phase: 'planning',
      requestType: 'modify',
    });

    expect(result.planResult).toBeDefined();
    expect(require('../../agents/planModifyAgent').runPlanModifyAgent).toHaveBeenCalledTimes(1);
  });

  it('routes learning phase through convManager → teaching', async () => {
    require('../../agents/conversationManagerAgent').runConversationManagerAgent.mockResolvedValue({
      type: 'conversation_manager',
      payload: {
        intent: 'learning',
        action: 'teach',
        isFollowUpToOutstanding: false,
        shouldAskQuestion: true,
        questionToAsk: 'What is a variable?',
        shouldStartQuiz: false,
        markMilestoneComplete: false,
        moveToNextMilestone: false,
        phaseChange: null,
        response: '',
      },
    });

    require('../../agents/teachingAgent').runTeachingAgent.mockResolvedValue({
      type: 'teaching',
      payload: { content: 'Variables store data...' },
      uiMessage: 'Variables store data...',
      valid: true,
      errors: [],
    });

    const learningSession = {
      ...baseSession,
      phase: 'learning',
      activeModuleId: '1',
      plan: [{ id: '1', title: 'Basics', milestones: [{ text: 'Variables', completed: false }] }],
      meta: { currentMilestoneIndex: 0 },
    };

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: learningSession,
      userMessage: 'teach me',
      phase: 'learning',
      requestType: 'chat',
    });

    expect(result.convManagerResult).toBeDefined();
    expect(result.teachingResult).toBeDefined();
    expect(result.teachingResult.uiMessage).toBe('Variables store data...');
    expect(require('../../agents/conversationManagerAgent').runConversationManagerAgent).toHaveBeenCalledTimes(1);
    expect(require('../../agents/teachingAgent').runTeachingAgent).toHaveBeenCalledTimes(1);
    expect(require('../../agents/assessmentAgent').runAssessmentAgent).not.toHaveBeenCalled();
  });

  it('routes learning phase through convManager → assessment → teaching', async () => {
    require('../../agents/conversationManagerAgent').runConversationManagerAgent.mockResolvedValue({
      type: 'conversation_manager',
      payload: {
        intent: 'answering_question',
        action: 'assess',
        isFollowUpToOutstanding: true,
        shouldAskQuestion: false,
        shouldStartQuiz: false,
        markMilestoneComplete: false,
        moveToNextMilestone: false,
        phaseChange: null,
        response: '',
      },
    });

    require('../../agents/assessmentAgent').runAssessmentAgent.mockResolvedValue({
      type: 'assessment',
      payload: {
        responseType: 'correct_answer',
        understood: true,
        confidence: 'high',
        recommendation: 'move_forward',
        reasoning: 'Good answer',
      },
      valid: true,
      errors: [],
    });

    require('../../agents/teachingAgent').runTeachingAgent.mockResolvedValue({
      type: 'teaching',
      payload: { content: 'Great! Moving on to loops...' },
      uiMessage: 'Great! Moving on to loops...',
      valid: true,
      errors: [],
    });

    const learningSession = {
      ...baseSession,
      phase: 'learning',
      activeModuleId: '1',
      plan: [{ id: '1', title: 'Basics', milestones: [{ text: 'Variables', completed: false }, { text: 'Loops', completed: false }] }],
      meta: { currentMilestoneIndex: 0, outstandingCheck: 'What is a variable?' },
    };

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: learningSession,
      userMessage: 'A variable stores data in memory',
      phase: 'learning',
      requestType: 'chat',
    });

    expect(result.convManagerResult).toBeDefined();
    expect(result.assessmentResult).toBeDefined();
    expect(result.assessmentResult.payload.understood).toBe(true);
    expect(result.teachingResult).toBeDefined();
    expect(require('../../agents/assessmentAgent').runAssessmentAgent).toHaveBeenCalledTimes(1);
    expect(require('../../agents/teachingAgent').runTeachingAgent).toHaveBeenCalledTimes(1);
  });

  it('routes quiz_start to quiz node', async () => {
    require('../../agents/quizAgent').runQuizAgent.mockResolvedValue({
      type: 'quiz',
      payload: { questions: [{ id: 'q1', text: 'Q1?', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'A is correct' }] },
      valid: true,
      errors: [],
    });

    const quizSession = {
      ...baseSession,
      phase: 'quizzing',
      activeModuleId: '1',
      plan: [{ id: '1', title: 'Basics', milestones: [{ text: 'Variables', completed: true }], difficulty: 'intro' }],
    };

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: quizSession,
      userMessage: 'start quiz',
      phase: 'quizzing',
      requestType: 'quiz_start',
    });

    expect(result.quizResult).toBeDefined();
    expect(result.quizResult.payload.questions).toHaveLength(1);
    expect(require('../../agents/quizAgent').runQuizAgent).toHaveBeenCalledTimes(1);
  });

  it('routes quiz_submit to feedback node', async () => {
    require('../../agents/feedbackAgent').runFeedbackAgent.mockResolvedValue({
      type: 'feedback',
      payload: { message: 'Great job scoring 80%!', nextAction: 'proceed_to_next_module' },
    });

    const submitSession = {
      ...baseSession,
      phase: 'quizzing',
      activeModuleId: '1',
      plan: [{ id: '1', title: 'Basics', milestones: [{ text: 'Variables', completed: true }] }],
      quizAttempts: [{
        id: 'a1',
        moduleId: '1',
        status: 'submitted',
        scorePct: 80,
        passed: true,
        submittedAt: new Date(),
        items: [
          { id: 'q1', text: 'Q?', options: ['A', 'B', 'C', 'D'], correctIndex: 0 },
        ],
        answers: [{ id: 'q1', userIndex: 0 }],
      }],
    };

    const graph = compileStudyGraph();
    const result = await graph.invoke({
      session: submitSession,
      userMessage: 'Quiz completed: 80%',
      phase: 'quizzing',
      requestType: 'quiz_submit',
    });

    expect(result.feedbackResult).toBeDefined();
    expect(result.feedbackResult.payload.message).toContain('80%');
    expect(require('../../agents/feedbackAgent').runFeedbackAgent).toHaveBeenCalledTimes(1);
  });
});

describe('runStudyGraph utility', () => {
  it('returns success and elapsed time on success', async () => {
    require('../../agents/intentAgent').runIntentAgent.mockResolvedValue({
      type: 'intent',
      payload: { intent: 'greeting', action: 'respond_naturally', response: 'Hello!' },
    });

    const { runStudyGraph } = require('../../agents/graph/runGraph');
    const result = await runStudyGraph({
      session: { ...baseSession, phase: 'pre' },
      userMessage: 'hello',
      requestType: 'chat',
    });

    expect(result.success).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('returns error on agent failure', async () => {
    require('../../agents/intentAgent').runIntentAgent.mockRejectedValue(new Error('Agent crashed'));

    const { runStudyGraph } = require('../../agents/graph/runGraph');
    const result = await runStudyGraph({
      session: { ...baseSession, phase: 'pre' },
      userMessage: 'hello',
      requestType: 'chat',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Agent crashed');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
