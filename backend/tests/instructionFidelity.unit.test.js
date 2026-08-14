/**
 * Instruction-fidelity fixes (2026-08, shipped before the study window):
 *
 *  - teacher_prompt: instructor guidelines outrank the default persona; the
 *    hard 150-200-word cap became adaptive; the milestone-transition block no
 *    longer orders the model to discard the conversation; examples must be
 *    novel across milestones; text-only limits forbid fabricated URLs.
 *  - teacherService: guidelines ride in a SYSTEM message, above the user-
 *    message template they must outrank.
 *  - quizAgent: sees instructor guidelines; items must have exactly one
 *    defensibly-correct option, enforced by an LLM key audit that FAILS OPEN.
 *  - quizValidator: "All of these"-style aggregate options are rejected.
 *
 * Deliberately NOT changed (PILOT_DECISIONS.md): assessment stays
 * instruction-blind; the hardcoded advance acknowledgment stays; quiz grading
 * stays a strict index match. Those pins live in
 * tests/agents/teachingAgentInstructions.test.js and tests/healthDbDown-style
 * source assertions below would duplicate them, so they are not repeated here.
 */
const { buildTeacherPrompt } = require('../prompts/teacher_prompt');
const { validateQuiz } = require('../agents/validators/quizValidator');

const session = (over = {}) => ({
  topic: 'Human-centered AI Design',
  phase: 'learning',
  activeModuleId: 'mod_1',
  points: 20,
  gems: 1,
  plan: [
    {
      id: 'mod_1',
      title: 'Introduction to AI Costs',
      points: 50,
      milestones: [
        { text: 'Identify direct AI costs', completed: true },
        { text: 'Analyze hidden AI costs', completed: false },
      ],
    },
  ],
  meta: { currentMilestoneIndex: 1 },
  profile: { background: 'x', goals: [], strengths: [], gaps: [], preferredStyle: 'mixed', timePerDayMins: 30 },
  messages: [],
  ...over,
});

const RICH_INSTRUCTIONS =
  'Use real news articles from CNN/Forbes/tech blogs with links, teach through case studies, and encourage critical thinking on every milestone.';

describe('teacher_prompt — instructor authority and adaptive length', () => {
  it('keeps the concise range when there are no instructions', () => {
    const p = buildTeacherPrompt(session(), 'teach me', false, null, null, '');
    expect(p).toContain('150-250 words');
    expect(p).not.toContain('250-450 words');
    expect(p).not.toContain('Instructor Global Guidelines');
  });

  it('lifts the teaching range when instructions ask for rich content', () => {
    const p = buildTeacherPrompt(session(), 'teach me', false, null, null, RICH_INSTRUCTIONS);
    expect(p).toContain('250-450 words');
    expect(p).not.toContain('150-250 words');
  });

  it('declares that guidelines beat the persona, including gamification wording', () => {
    const p = buildTeacherPrompt(session(), 'teach me', false, null, null, RICH_INSTRUCTIONS);
    expect(p).toContain('Instructor Global Guidelines (authoritative for this course — these take priority over defaults):');
    expect(p).toMatch(/the guidelines WIN/);
  });

  it('never reintroduces the hard word-count prohibition', () => {
    const p = buildTeacherPrompt(session(), 'teach me', false, null, null, '');
    expect(p).not.toContain('Do NOT use different word count');
    expect(p).not.toContain('always 150-200 words');
  });

  it('forbids fabricated links and fake rich media instead of encouraging them', () => {
    const p = buildTeacherPrompt(session(), 'teach me', false, null, null, RICH_INSTRUCTIONS);
    expect(p).toMatch(/NEVER invent URLs/i);
    expect(p).not.toContain('include a Mermaid diagram');
    expect(p).not.toContain('developer.mozilla.org');
  });
});

describe('teacher_prompt — milestone transition keeps continuity', () => {
  const transitionPrompt = () =>
    buildTeacherPrompt(
      session(),
      'AI systems need expensive GPUs to train',
      true,
      { understood: true, needsMoreClarification: false, responseType: 'correct_answer' },
      { moveToNextMilestone: true, markMilestoneComplete: true },
      ''
    );

  it('no longer orders the model to discard the conversation', () => {
    const p = transitionPrompt();
    expect(p).not.toContain('IGNORE ALL PREVIOUS CONTEXT');
    expect(p).not.toContain('BRAND NEW conversation');
    expect(p).not.toContain('IGNORE THIS - IT\'S ABOUT THE PREVIOUS MILESTONE');
  });

  it('requires example novelty across milestones', () => {
    const p = transitionPrompt();
    expect(p).toMatch(/EXAMPLE NOVELTY/);
    expect(p).toMatch(/NOT used earlier in this conversation/i);
  });

  it('still pins the subject to the new milestone only', () => {
    const p = transitionPrompt();
    expect(p).toContain('Analyze hidden AI costs');
    expect(p).toMatch(/do NOT teach, re-explain, or ask about it|do not re-teach or re-quiz/i);
  });

  it('gamification is one short sentence, not the old two-sentence mandate', () => {
    const p = transitionPrompt();
    expect(p).not.toContain('each milestone brings you closer to achieving your goal');
    expect(p).toMatch(/ONE short sentence/);
  });
});

describe('teacherService — guidelines ride in a system message', () => {
  it('inserts an authoritative instructor system message when instructions exist', () => {
    const src = require('fs').readFileSync(require.resolve('../services/teacherService'), 'utf8');
    expect(src).toMatch(/instructorSystemMessage/);
    expect(src).toMatch(/Instructor course guidelines \(authoritative\)/);
    // Both transports use it.
    expect(src).toMatch(/instructorSystemMessage\(globalInstructions\)/);
    expect(src).toMatch(/instructorSystemMessage\(opts\.globalInstructions\)/);
  });
});

describe('quizAgent — instructions slot and key audit wiring', () => {
  let runAgentMock;
  beforeEach(() => {
    jest.resetModules();
    runAgentMock = jest.fn();
    jest.doMock('../agents/framework/baseAgent', () => ({ runAgent: runAgentMock, runAgentWithTools: jest.fn() }));
    jest.doMock('../agents/validators/quizKeyCheck', () => ({
      checkQuizKeys: jest.fn().mockResolvedValue({ valid: true, checked: true, errors: [] }),
    }));
  });
  afterEach(() => jest.dontMock('../agents/framework/baseAgent'));

  const validQuiz = {
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: `q${i + 1}`,
      text: `Question ${i + 1}?`,
      options: ['Right', 'Wrong A', 'Wrong B', 'Wrong C'],
      correctIndex: 0,
      explanation: 'Because it is right and the others are wrong.',
    })),
  };

  it('passes instructor guidelines into the generation prompt', async () => {
    runAgentMock.mockResolvedValue(validQuiz);
    const { runQuizAgent } = require('../agents/quizAgent');
    const res = await runQuizAgent({
      module: { id: 'm1', title: 'Intro to AI Costs', milestones: [{ text: 'a' }, { text: 'b' }] },
      globalInstructions: RICH_INSTRUCTIONS,
    });
    expect(res.valid).toBe(true);
    const { userPrompt, systemPrompt } = runAgentMock.mock.calls[0][0];
    expect(userPrompt).toContain('Instructor course guidelines');
    expect(userPrompt).toContain(RICH_INSTRUCTIONS);
    expect(systemPrompt).toMatch(/EXACTLY ONE option may be correct/);
  });

  it('omits the block when instructions are empty', async () => {
    runAgentMock.mockResolvedValue(validQuiz);
    const { runQuizAgent } = require('../agents/quizAgent');
    await runQuizAgent({ module: { id: 'm1', title: 'T', milestones: [{ text: 'a' }] } });
    const { userPrompt } = runAgentMock.mock.calls[0][0];
    expect(userPrompt).not.toContain('Instructor course guidelines');
  });

  it('feeds key-audit failures back into the generation retry loop', async () => {
    jest.resetModules();
    jest.doMock('../agents/framework/baseAgent', () => ({ runAgent: runAgentMock, runAgentWithTools: jest.fn() }));
    const check = jest
      .fn()
      .mockResolvedValueOnce({ valid: false, checked: true, errors: ['question q1: options 0, 3 are all defensibly correct'] })
      .mockResolvedValue({ valid: true, checked: true, errors: [] });
    jest.doMock('../agents/validators/quizKeyCheck', () => ({ checkQuizKeys: check }));
    runAgentMock.mockResolvedValue(validQuiz);

    const { runQuizAgent } = require('../agents/quizAgent');
    const res = await runQuizAgent({ module: { id: 'm1', title: 'T', milestones: [{ text: 'a' }] } });
    expect(res.valid).toBe(true);
    expect(runAgentMock).toHaveBeenCalledTimes(2); // regenerate after audit failure
    const retryPrompt = runAgentMock.mock.calls[1][0].userPrompt;
    expect(retryPrompt).toContain('defensibly correct');
  });
});

describe('quizKeyCheck — verdicts and fail-open', () => {
  const questions = [
    {
      id: 'q2',
      text: 'Which of the following is a type of AI cost?',
      options: ['Hardware', 'Software', 'Personnel', 'All of these'],
      correctIndex: 3,
    },
  ];

  // The quizAgent block above doMock-ed quizKeyCheck itself; those
  // registrations survive resetModules, so they must be explicitly undone
  // here or every require below returns that stub.
  const loadReal = (baseAgentImpl) => {
    jest.resetModules();
    jest.dontMock('../agents/validators/quizKeyCheck');
    jest.doMock('../agents/framework/baseAgent', () => ({ runAgent: baseAgentImpl, runAgentWithTools: jest.fn() }));
    return require('../agents/validators/quizKeyCheck');
  };
  afterEach(() => { jest.dontMock('../agents/framework/baseAgent'); jest.resetModules(); });

  it('fails an item where multiple options are defensible', async () => {
    const { checkQuizKeys } = loadReal(jest.fn().mockResolvedValue({ results: [{ id: 'q2', defensibleIndices: [0, 1, 2, 3] }] }));
    const res = await checkQuizKeys(questions);
    expect(res.checked).toBe(true);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/all defensibly correct/);
  });

  it('fails an item whose key is not the defensible option', async () => {
    const { checkQuizKeys } = loadReal(jest.fn().mockResolvedValue({ results: [{ id: 'q2', defensibleIndices: [0] }] }));
    const res = await checkQuizKeys(questions);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/keyed answer/);
  });

  it('FAILS OPEN when the checker call errors — quiz delivery never blocks on the audit', async () => {
    const { checkQuizKeys } = loadReal(jest.fn().mockRejectedValue(new Error('groq down')));
    const res = await checkQuizKeys(questions);
    expect(res.valid).toBe(true);
    expect(res.checked).toBe(false);
  });
});

describe('quizValidator — aggregate options blocked', () => {
  const quiz = (options) => ({
    questions: [
      { id: 'q1', text: 'Q?', options, correctIndex: 0, explanation: 'e' },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `q${i + 2}`, text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e',
      })),
    ],
  });

  it.each([
    ['All of these'], ['None of these'], ['All the above'], ['Each of the above'], ['all of the above'],
    ['Both A and B'], ['A and C'], ['Options A and B'],
  ])('rejects "%s"', (opt) => {
    const res = validateQuiz(quiz(['x', 'y', 'z', opt]), 5);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('forbidden option');
  });

  it.each([
    // Real option text the first substring-based blocklist wrongly rejected
    // ("Schema and constraints" contains 'a and c' across word boundaries).
    ['Schema and constraints'], ['Data and bandwidth costs'], ['Web and cloud hosting'],
    ['Java and C++ support'], ['Options available to the caller'], ['Media and content pipelines'],
  ])('accepts ordinary option text "%s"', (opt) => {
    expect(validateQuiz(quiz(['x', 'y', 'z', opt]), 5).valid).toBe(true);
  });

  it('still accepts four standalone options', () => {
    expect(validateQuiz(quiz(['x', 'y', 'z', 'w']), 5).valid).toBe(true);
  });
});
