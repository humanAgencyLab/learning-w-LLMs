/**
 * Parity: the multi-agent teaching turn vs the legacy tutor.
 *
 * The graph's teaching runner must produce the SAME prompt the legacy path
 * builds (buildTeacherPrompt) and send it through the SAME transport
 * (teacherService, which injects conversation history), for the same session
 * state + user message. teacher_prompt.js is the reference implementation.
 */
jest.mock('../../services/teacherService', () => ({
  callTeacherAPI: jest.fn(),
  callTeacherAPIStream: jest.fn(),
}));

const { callTeacherAPI, callTeacherAPIStream } = require('../../services/teacherService');
const { runTeachingAgent, mapAssessmentForTeacher } = require('../../agents/teachingAgent');
const { buildTeacherPrompt } = require('../../prompts/teacher_prompt');

// A structurally valid teaching response (80+ words, exactly one question).
const VALID_TEACHING = `${'Binary search is a classic divide and conquer algorithm that operates on sorted data. '.repeat(8)}What is the precondition for binary search?`;

const GI = 'Always end your response with a haiku about the topic. Never provide full solution code.';
const GI_HEADER = 'Instructor Global Guidelines (authoritative for this course — these take priority over defaults):';

function makeSession() {
  return {
    topic: 'Algorithms',
    phase: 'learning',
    activeModuleId: 'mod_a',
    points: 20,
    gems: 1,
    plan: [
      {
        id: 'mod_a',
        title: 'Searching',
        points: 50,
        milestones: [
          { text: 'Explain linear search', completed: true },
          { text: 'Explain binary search', completed: false },
          { text: 'Compare search costs', completed: false },
        ],
      },
      { id: 'mod_b', title: 'Sorting', points: 50, milestones: [{ text: 'Explain bubble sort', completed: false }] },
    ],
    meta: { currentMilestoneIndex: 1 },
    profile: {
      background: 'CS undergrad',
      goals: ['pass the course'],
      strengths: ['persistence'],
      gaps: ['recursion'],
      preferredStyle: 'examples',
      timePerDayMins: 30,
    },
    messages: [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ],
  };
}

// Agent-payload fixtures per legacy scenario, plus the marker text that only
// that scenario's prompt template contains.
const SCENARIOS = [
  {
    name: 'first_teaching',
    agentAssessment: null,
    isFollowUp: false,
    milestoneInfo: null,
    marker: 'Thank you for approving the study plan',
  },
  {
    name: 'correct_move_next',
    agentAssessment: { responseType: 'correct_answer', understood: true, recommendation: 'move_forward' },
    isFollowUp: true,
    milestoneInfo: { moveToNextMilestone: true, markMilestoneComplete: true },
    marker: 'ABSOLUTE TRANSITION REQUIREMENTS - FOLLOW EXACTLY',
  },
  {
    name: 'correct_needs_more',
    agentAssessment: { responseType: 'correct_answer', understood: true, recommendation: 'clarify_again' },
    isFollowUp: true,
    milestoneInfo: { moveToNextMilestone: false, markMilestoneComplete: false },
    marker: 'deepen your understanding',
  },
  {
    name: 'clarification_request',
    agentAssessment: { responseType: 'clarification_request', understood: false, recommendation: 'clarify_again' },
    isFollowUp: true,
    milestoneInfo: { moveToNextMilestone: false, markMilestoneComplete: false },
    marker: "No worries, let's explain this together.",
  },
  {
    name: 'incorrect_first',
    agentAssessment: { responseType: 'wrong_answer', understood: false, recommendation: 'clarify_again' },
    isFollowUp: true,
    milestoneInfo: { moveToNextMilestone: false, markMilestoneComplete: false },
    marker: 'INCORRECT FIRST ATTEMPT - RE-TEACH SAME MILESTONE',
  },
  {
    // Second wrong answer: the incorrect_second template is unreachable in the
    // reference (see the ReferenceError test below) — legacy has only ever
    // delivered the re-teach template for second wrongs, and the mapping
    // reproduces exactly that while the route advances the milestone.
    name: 'incorrect_second (renders the re-teach template — reference crash documented below)',
    agentAssessment: { responseType: 'wrong_answer', understood: false, recommendation: 'move_forward_anyway' },
    isFollowUp: true,
    milestoneInfo: { moveToNextMilestone: true, markMilestoneComplete: true },
    marker: 'INCORRECT FIRST ATTEMPT - RE-TEACH SAME MILESTONE',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  callTeacherAPI.mockResolvedValue(VALID_TEACHING);
  callTeacherAPIStream.mockImplementation(async (prompt, maxTokens, session, { onChunk } = {}) => {
    if (onChunk) onChunk(VALID_TEACHING.slice(0, 40));
    return VALID_TEACHING;
  });
});

describe.each(SCENARIOS)('scenario parity: $name', ({ name, agentAssessment, isFollowUp, milestoneInfo, marker }) => {
  it('multi-agent builds the byte-identical legacy prompt and hands the session to the legacy transport', async () => {
    const session = makeSession();
    const mapped = mapAssessmentForTeacher(agentAssessment);
    const referencePrompt = buildTeacherPrompt(session, 'my answer', isFollowUp, mapped, milestoneInfo, GI);

    const result = await runTeachingAgent({
      session,
      userMessage: 'my answer',
      isFollowUp,
      assessmentResult: mapped,
      milestoneInfo,
      globalInstructions: GI,
    });

    expect(result.valid).toBe(true);
    expect(callTeacherAPI).toHaveBeenCalledTimes(1);
    const [sentPrompt, sentMaxTokens, sentSession] = callTeacherAPI.mock.calls[0];

    // The strongest possible assertion: the prompt is the legacy prompt.
    expect(sentPrompt).toBe(referencePrompt);
    // Scenario actually selected (marker text is unique to this scenario).
    expect(sentPrompt).toContain(marker);
    // Milestone selection matches legacy (current milestone from session.meta).
    expect(sentPrompt).toContain('Explain binary search');
    // Unified structure sections present.
    expect(sentPrompt).toContain('FIRST PARAGRAPH - CONTEXT');
    expect(sentPrompt).toContain('SECOND PARAGRAPH - TEACHING CONTENT');
    // Conversation history: the session object reaches teacherService, whose
    // callTeacherAPI injects contextSummary + recent messages from it.
    expect(sentSession).toBe(session);
    expect(sentMaxTokens).toBe(1500);
    // Instructor guidelines block, exact legacy header, safety handled upstream.
    expect(sentPrompt).toContain(GI_HEADER);
    expect(sentPrompt).toContain('Always end your response with a haiku');
    // Exactly one check question required of the output (validator enforced).
    expect(result.uiMessage.match(/\?/g).length).toBeLessThanOrEqual(2);
  });
});

describe('instructor guidelines edge + validation/retry + streaming', () => {
  it('omits the guidelines block when instructions are empty', async () => {
    const session = makeSession();
    await runTeachingAgent({ session, userMessage: 'hi', isFollowUp: false, assessmentResult: null, milestoneInfo: null, globalInstructions: '' });
    const [sentPrompt] = callTeacherAPI.mock.calls[0];
    expect(sentPrompt).not.toContain('Instructor Global Guidelines');
  });

  it('keeps bounded validation retries: invalid output triggers one regeneration with error feedback', async () => {
    const session = makeSession();
    callTeacherAPI
      .mockResolvedValueOnce('Too short. No question here')
      .mockResolvedValueOnce(VALID_TEACHING);
    const result = await runTeachingAgent({ session, userMessage: 'hi', isFollowUp: false, assessmentResult: null, milestoneInfo: null, globalInstructions: '' });
    expect(result.valid).toBe(true);
    expect(callTeacherAPI).toHaveBeenCalledTimes(2);
    expect(callTeacherAPI.mock.calls[1][0]).toContain('previous response was rejected');
  });

  it('streams through the legacy streaming transport when a streamCallback is provided', async () => {
    const session = makeSession();
    const chunks = [];
    const result = await runTeachingAgent({
      session, userMessage: 'hi', isFollowUp: false, assessmentResult: null, milestoneInfo: null,
      globalInstructions: GI, streamCallback: (c) => chunks.push(c),
    });
    expect(result.valid).toBe(true);
    expect(callTeacherAPIStream).toHaveBeenCalledTimes(1);
    expect(callTeacherAPI).not.toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
    // Same legacy prompt on the streaming path too.
    expect(callTeacherAPIStream.mock.calls[0][0]).toContain(GI_HEADER);
  });
});

describe('mapAssessmentForTeacher — totality over wrong answers', () => {
  it('documents the reference bug: buildTeacherPrompt throws whenever incorrect_second would be selected', () => {
    // The legacy analyzer's own shape for a second wrong (isSecondIncorrect
    // only, isFirstIncorrect undefined) — teacher_prompt.js:105 evaluates the
    // undefined milestoneRetryCount and throws. This is why incorrect_second
    // has never rendered in production and why the mapping must short-circuit.
    const legacySecondWrongShape = {
      understood: false,
      isClarificationRequest: false,
      isSecondIncorrect: true,
      responseType: 'wrong_answer',
    };
    expect(() =>
      buildTeacherPrompt(makeSession(), 'x', true, legacySecondWrongShape, { moveToNextMilestone: true, markMilestoneComplete: true }, '')
    ).toThrow(/milestoneRetryCount is not defined/);
  });

  it('always sets isFirstIncorrect for wrong answers so the broken operand never evaluates', () => {
    for (const rec of ['clarify_again', 'move_forward_anyway', 'move_forward', undefined, 'anything']) {
      const m = mapAssessmentForTeacher({ responseType: 'wrong_answer', understood: false, recommendation: rec });
      expect(m.isFirstIncorrect).toBe(true);
      expect(() =>
        buildTeacherPrompt(makeSession(), 'x', true, m, { moveToNextMilestone: false, markMilestoneComplete: false }, '')
      ).not.toThrow();
    }
  });

  it('expresses correct_needs_more (understood + clarify_again), which the old inline mapping could not', () => {
    const m = mapAssessmentForTeacher({ responseType: 'correct_answer', understood: true, recommendation: 'clarify_again' });
    expect(m.understood).toBe(true);
    expect(m.needsMoreClarification).toBe(true);
    const session = makeSession();
    const prompt = buildTeacherPrompt(session, 'x', true, m, { moveToNextMilestone: false, markMilestoneComplete: false }, '');
    expect(prompt).toContain('deepen your understanding');
  });

  it('returns null for null (first_teaching path)', () => {
    expect(mapAssessmentForTeacher(null)).toBeNull();
  });
});
