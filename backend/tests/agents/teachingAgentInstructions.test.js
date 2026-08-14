/**
 * Instructor global guidelines in the multi-agent teaching turn.
 *
 * Since the parity rework, the teaching runner builds its prompt via the
 * legacy buildTeacherPrompt — the guidelines block (exact legacy header,
 * safety floor upstream in the fixed system persona) comes from there. These
 * tests pin the injection behavior; quiz generation staying instruction-blind
 * is a documented study finding and asserted here too.
 */
jest.mock('../../services/teacherService', () => ({
  callTeacherAPI: jest.fn(),
  callTeacherAPIStream: jest.fn(),
}));

const { callTeacherAPI } = require('../../services/teacherService');
const { runTeachingAgent } = require('../../agents/teachingAgent');

const HEADER = 'Instructor Global Guidelines (authoritative for this course — these take priority over defaults):';
const VALID_TEACHING = `${'Content sentence with enough words to satisfy the validator minimum easily. '.repeat(10)}What is the key idea?`;

const session = {
  topic: 'Security Goals and Threat Modeling',
  phase: 'learning',
  activeModuleId: 'mod_core_1',
  points: 10,
  gems: 0,
  plan: [
    {
      id: 'mod_core_1',
      title: 'Threat Modeling',
      points: 50,
      milestones: [{ text: 'Identify potential threats', completed: true }, { text: 'Create a threat model', completed: false }],
    },
  ],
  meta: { currentMilestoneIndex: 1 },
  profile: { background: 'x', goals: [], strengths: [], gaps: [], preferredStyle: 'mixed', timePerDayMins: 30 },
  messages: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  callTeacherAPI.mockResolvedValue(VALID_TEACHING);
});

describe('teaching turn — instructor global guidelines injection', () => {
  it('includes the block with the exact legacy header when instructions are non-empty', async () => {
    await runTeachingAgent({
      session, userMessage: 'teach me', isFollowUp: false, assessmentResult: null, milestoneInfo: null,
      globalInstructions: 'Always end every response with a haiku. Never provide full solution code.',
    });
    const [prompt] = callTeacherAPI.mock.calls[0];
    expect(prompt).toContain(HEADER);
    expect(prompt).toContain('Always end every response with a haiku.');
  });

  it('omits the block entirely for empty, whitespace, or absent instructions', async () => {
    for (const empty of ['', '   \n  ', null, undefined]) {
      callTeacherAPI.mockClear();
      callTeacherAPI.mockResolvedValue(VALID_TEACHING);
      await runTeachingAgent({
        session, userMessage: 'teach me', isFollowUp: false, assessmentResult: null, milestoneInfo: null,
        globalInstructions: empty,
      });
      const [prompt] = callTeacherAPI.mock.calls[0];
      expect(prompt).not.toContain('Instructor Global Guidelines');
    }
  });

  it('quiz generation receives instructor guidelines (2026-08 pre-window fix)', () => {
    // Reversed from the original instruction-blind pin: the researcher shipped
    // instruction-aware quiz generation BEFORE the study window opened, so all
    // participants see one consistent stimulus. Assessment stays blind (below).
    const quizSource = require('fs').readFileSync(require.resolve('../../agents/quizAgent'), 'utf8');
    expect(quizSource).toContain('globalInstructions');
  });

  it('graph quizNode forwards instructions from state (not a fresh DB read)', () => {
    const graphSource = require('fs').readFileSync(require.resolve('../../agents/graph/studyGraph'), 'utf8');
    expect(graphSource).toMatch(/runQuizAgent\(\{\s*module:\s*modForAgent,\s*globalInstructions:\s*state\.globalInstructions\s*\}\)/);
  });

  it('assessment agent remains instruction-blind for the study window (PILOT_DECISIONS.md Section 3)', () => {
    const source = require('fs').readFileSync(require.resolve('../../agents/assessmentAgent'), 'utf8');
    expect(source).not.toContain('globalInstructions');
  });
});
