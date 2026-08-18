/**
 * Grading fix (2026-08): verdicts must reflect actual correctness, not
 * plausibility. Pins the code-check demotion gate (can only demote a pass,
 * never inflate), the deterministic truncation cue, the hardened assessment
 * rules, and the defect plumbing into the retry turn.
 */
jest.mock('../agents/framework/baseAgent', () => ({
  runAgent: jest.fn(),
  runAgentWithTools: jest.fn(),
}));
const { runAgent } = require('../agents/framework/baseAgent');
const { runCodeCheck, looksLikeCode, unbalancedCode } = require('../agents/assessmentAgent');
const { buildTurnPrompt } = require('../prompts/tutor_turn_prompt');

const BROKEN_FOR = 'for (scanf("%d",&n), n>=0; /*nothing*/; scanf("%d",&n)) { total += n; }';

describe('looksLikeCode', () => {
  it.each([
    [BROKEN_FOR],
    ['while (n >= 0) { scanf("%d", &n); }'],
    ['```java\nint x = 1;\n```'],
    ['x++ && y--'],
  ])('true for code: %s', (s) => expect(looksLikeCode(s)).toBe(true));

  it.each([
    ['I would keep reading numbers until a negative one appears.'],
    ['The loop stops when the sentinel arrives (a negative number).'],
  ])('false for prose: %s', (s) => expect(looksLikeCode(s)).toBe(false));
});

describe('unbalancedCode — deterministic truncation cue', () => {
  it('flags unbalanced braces in code', () => {
    expect(unbalancedCode('for (int i = 0; i < n; i++) { sum += i;')).toBe(true);
    expect(unbalancedCode('while (n >= 0 { scanf("%d", &n); }')).toBe(true);
  });
  it('passes balanced code', () => {
    expect(unbalancedCode(BROKEN_FOR)).toBe(false); // broken logic, but balanced — the LLM checker's job
  });
  it('never flags prose (no code cues, no counting)', () => {
    expect(unbalancedCode('The loop stops when the sentinel arrives (a negative number.')).toBe(false);
  });
});

describe('runCodeCheck — demotion-only, fail-open', () => {
  beforeEach(() => runAgent.mockReset());

  it('reports a broken answer with its defect', async () => {
    runAgent.mockResolvedValue({ sound: false, verdict: 'broken', defect: 'the condition slot is empty so the loop never ends' });
    const r = await runCodeCheck({ question: 'q', answer: BROKEN_FOR, milestone: { text: 'm' }, topicTitle: 'C' });
    expect(r.sound).toBe(false);
    expect(r.defect).toMatch(/condition slot is empty/);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ taskName: 'code_check', temperature: 0, reasoningEffort: 'medium' }));
  });

  it('keeps the pass on checker outage (fail open — never inflates by failing)', async () => {
    runAgent.mockRejectedValue(new Error('groq down'));
    const r = await runCodeCheck({ question: 'q', answer: BROKEN_FOR });
    expect(r.sound).toBe(true);
  });

  it('keeps the pass on malformed checker output', async () => {
    runAgent.mockResolvedValue({ nonsense: 1 });
    const r = await runCodeCheck({ question: 'q', answer: BROKEN_FOR });
    expect(r.sound).toBe(true);
  });
});

describe('hardened assessment rules (SYSTEM_PROMPT pins)', () => {
  const src = require('fs').readFileSync(require.resolve('../agents/assessmentAgent'), 'utf8');

  it('RULE 0 (substance before keywords) is preserved', () => {
    expect(src).toMatch(/RULE 0 - SUBSTANCE BEFORE KEYWORDS/);
  });
  it('RULE 1: correctness over plausibility, code tracing, prose-vs-code', () => {
    expect(src).toMatch(/CHECK CORRECTNESS, NOT PLAUSIBILITY/);
    expect(src).toMatch(/empty or always-true loop condition is an\s*\n?\s*infinite loop/i);
    expect(src).toMatch(/INITIALIZER/);
    expect(src).toMatch(/the code wins/);
  });
  it('RULE 2: truncated answers are never complete', () => {
    expect(src).toMatch(/TRUNCATED OR UNFINISHED ANSWERS ARE NOT COMPLETE/);
    expect(src).toMatch(/incomplete_answer is ONLY for answers that are complete thoughts/);
  });
  it('RULE 3: no over-correction of stylistic variants', () => {
    expect(src).toMatch(/DO NOT OVER-CORRECT/);
    expect(src).toMatch(/differs stylistically/);
  });
  it('wrong_answer carries a specific defect, never the corrected solution', () => {
    expect(src).toMatch(/defect: ONE sentence naming the SPECIFIC defect/);
    expect(src).toMatch(/Do NOT include\s*\n?\s*the corrected solution/);
  });
});

describe('demotion gate source contract (studyGraph assessmentNode)', () => {
  const src = require('fs').readFileSync(require.resolve('../agents/graph/studyGraph'), 'utf8');

  it('runs ONLY when the grader is about to pass, and only ever demotes', () => {
    expect(src).toMatch(/if \(p && p\.understood && p\.recommendation !== 'clarify_again'\) \{/);
    expect(src).toMatch(/responseType: 'wrong_answer',\s*\n\s*understood: false,/);
  });
  it('deterministic unbalanced-code cue short-circuits before the LLM checker', () => {
    expect(src).toMatch(/if \(unbalancedCode\(state\.userMessage\)\) \{[\s\S]{0,300}\} else if \(looksLikeCode\(state\.userMessage\)\) \{/);
  });
  it('attaches the defect for the composer to name', () => {
    expect(src).toMatch(/defect: demoteDefect,/);
  });
});

describe('defect plumbing into the retry turn', () => {
  const base = {
    topicName: 'C', moduleTitle: 'Loops', milestoneText: 'Convert sentinel loops',
    verdict: 'incorrect', studentMessage: 's', structured: true, light: true, outstandingCheck: 'Q?',
  };

  it('correct_retry names the grader finding without the solution', () => {
    const p = buildTurnPrompt({ ...base, flowAction: 'correct_retry', defect: 'the condition slot is empty so the loop never ends' });
    expect(p).toMatch(/GRADER'S FINDING/);
    expect(p).toMatch(/the condition slot is empty/);
    expect(p).toMatch(/do NOT hand over the corrected code/);
  });

  it('no defect, or a non-retry flow → no block', () => {
    expect(buildTurnPrompt({ ...base, flowAction: 'correct_retry' })).not.toMatch(/GRADER'S FINDING/);
    expect(buildTurnPrompt({ ...base, flowAction: 'clarify', verdict: 'clarify', defect: 'x' })).not.toMatch(/GRADER'S FINDING/);
  });
});
