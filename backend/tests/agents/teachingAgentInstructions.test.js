/**
 * Multi-agent instruction gap: the teaching agent must receive
 * Course.globalInstructions in its per-turn prompt (same convention and header
 * as the legacy path in prompts/teacher_prompt.js), and must omit the block
 * entirely when no instructions exist. Quiz generation deliberately never
 * receives instructions (documented study finding) — asserted here too.
 */
const { buildUserPrompt, buildGlobalInstructionsBlock } = require('../../agents/teachingAgent');

const HEADER = 'Instructor Global Guidelines (authoritative for this course — these take priority over defaults):';

const session = {
  topic: 'Security Goals and Threat Modeling',
  activeModuleId: 'mod_core_1',
  plan: [
    {
      id: 'mod_core_1',
      title: 'Threat Modeling',
      milestones: [{ text: 'Identify potential threats' }, { text: 'Create a threat model' }],
    },
  ],
  meta: { currentMilestoneIndex: 1 },
};

describe('teaching agent — instructor global guidelines injection', () => {
  it('includes the instructions block with the exact legacy header when non-empty', () => {
    const prompt = buildUserPrompt(
      session, 'explain this milestone', false, null, null,
      'Always end every response with a haiku. Never provide full solution code.'
    );
    expect(prompt).toContain(HEADER);
    expect(prompt).toContain('Always end every response with a haiku.');
    // Block sits before the final generation directive so it governs output.
    expect(prompt.indexOf(HEADER)).toBeLessThan(prompt.indexOf('Generate teaching content'));
  });

  it('omits the block entirely when instructions are empty, whitespace, or absent', () => {
    for (const empty of ['', '   \n  ', null, undefined]) {
      const prompt = buildUserPrompt(session, 'explain', false, null, null, empty);
      expect(prompt).not.toContain('Instructor Global Guidelines');
    }
  });

  it('trims instructions and never fabricates a block from non-strings', () => {
    expect(buildGlobalInstructionsBlock('  rule one  ')).toContain('rule one');
    expect(buildGlobalInstructionsBlock('  rule one  ')).toContain(HEADER);
    expect(buildGlobalInstructionsBlock(undefined)).toBe('');
  });

  it('quiz generation remains instruction-blind (documented study finding)', () => {
    // The quiz agent's module must not accept or reference globalInstructions.
    const quizSource = require('fs').readFileSync(
      require.resolve('../../agents/quizAgent'), 'utf8'
    );
    expect(quizSource).not.toContain('globalInstructions');
  });
});
