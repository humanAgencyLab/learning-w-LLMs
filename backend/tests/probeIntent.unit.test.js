/**
 * Probe 2 — TWO-PATH intent router (2026-08-18 rebuild, researcher spec).
 *
 * fired = fastPath OR classifier, inside allowlisted clones only. The canned
 * reply must fire on every weakest/reteach/struggling phrasing the protocol
 * scripts (INCLUDING "hardest milestone" — a researcher-directed reversal of
 * the earlier negative-control boundary) and must NOT hijack at-risk lists,
 * individual student lookups, or weekly summaries.
 */
jest.mock('../agents/framework/baseAgent', () => ({
  runAgent: jest.fn(),
  runAgentWithTools: jest.fn(),
}));
const { runAgent } = require('../agents/framework/baseAgent');
const {
  probeFastPathMatch,
  classifyProbeIntentLLM,
  PROBE_INTENT_SYSTEM_PROMPT,
} = require('../routes/instructorChatRoutes');

describe('FAST PATH — deterministic, typo-tolerant', () => {
  it.each([
    // the protocol's scripted phrasings
    ['what to reteach'],
    ['what should I reteach next week?'],
    ['What should I re-teach?'],
    ['what to retech'], // typo, per spec
    ['what did the class struggle with most?'],
    ['Which topic has the lowest pass rate?'], // suggested chip
    ["What's the hardest milestone?"], // suggested chip — FIRES as of 2026-08-18
    ['where are students struggling most?'],
    ['what should I focus on?'],
    // cue variants
    ['which unit is the weakest?'],
    ['what is the toughest topic for the class?'],
    ['what should we review next week?'],
    ['what should I prioritize?'],
    ['which questions were most failed?'],
    ['what did they fail the most?'],
  ])('fires on: "%s"', (msg) => {
    expect(probeFastPathMatch(msg)).toBe(true);
  });

  it.each([
    ['Which 3 students are most at risk right now?'],
    ['how is Nia Singh doing?'],
    ['summarize this week'],
    ['Summarize Maya\'s progress for me'],
    ['How many quizzes were submitted yesterday?'],
    ['How do I publish a topic?'],
    ['who is the weakest student?'], // people question, not content
  ])('does NOT fire on: "%s"', (msg) => {
    expect(probeFastPathMatch(msg)).toBe(false);
  });
});

describe('SUBAGENT CLASSIFIER — YES/NO, cheap tier, temp 0', () => {
  beforeEach(() => runAgent.mockReset());

  it('uses the exact spec prompt and fires on YES', async () => {
    runAgent.mockResolvedValue('YES');
    await expect(classifyProbeIntentLLM('the class seems shaky somewhere — which area needs another pass?')).resolves.toBe(true);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
      taskName: 'probe_intent',
      systemPrompt: PROBE_INTENT_SYSTEM_PROMPT,
      temperature: 0,
      jsonMode: false,
    }));
    expect(PROBE_INTENT_SYSTEM_PROMPT).toBe('Does this instructor query ask which topic or milestone the class is weakest/hardest at, OR what to reteach/review/prioritize next, OR where students are struggling most? Answer YES or NO only.');
  });

  it.each([['YES'], ['yes'], ['Yes.'], ['  YES — it does'], ['"YES"']])('tolerant YES parse: %s', async (raw) => {
    runAgent.mockResolvedValue(raw);
    await expect(classifyProbeIntentLLM('q')).resolves.toBe(true);
  });

  it.each([['NO'], ['no'], ['No.'], ['NOT really'], ['maybe'], ['']])('anything not YES is NO: %s', async (raw) => {
    runAgent.mockResolvedValue(raw);
    await expect(classifyProbeIntentLLM('q')).resolves.toBe(false);
  });

  it('a classifier outage reports false — the fast path alone decides', async () => {
    runAgent.mockRejectedValue(new Error('groq down'));
    await expect(classifyProbeIntentLLM('what to reteach')).resolves.toBe(false);
  });
});

describe('TWO-PATH independence — either path alone fires the probe', () => {
  beforeEach(() => runAgent.mockReset());

  it('fast path alone fires (classifier says NO)', async () => {
    runAgent.mockResolvedValue('NO');
    const fastPath = probeFastPathMatch('what to retech'); // typo — regex-only coverage
    const classifier = await classifyProbeIntentLLM('what to retech');
    expect(fastPath).toBe(true);
    expect(classifier).toBe(false);
    expect(fastPath || classifier).toBe(true);
  });

  it('fast path alone fires even on classifier OUTAGE', async () => {
    runAgent.mockRejectedValue(new Error('down'));
    const fastPath = probeFastPathMatch("What's the hardest milestone?");
    const classifier = await classifyProbeIntentLLM("What's the hardest milestone?");
    expect(fastPath || classifier).toBe(true);
  });

  it('classifier alone fires (paraphrase with no regex cue)', async () => {
    const paraphrase = 'the class seems shaky somewhere — which area needs another pass?';
    runAgent.mockResolvedValue('YES');
    const fastPath = probeFastPathMatch(paraphrase);
    const classifier = await classifyProbeIntentLLM(paraphrase);
    expect(fastPath).toBe(false);
    expect(classifier).toBe(true);
    expect(fastPath || classifier).toBe(true);
  });
});

describe('route contract — scoping and audit trail', () => {
  const src = require('fs').readFileSync(require.resolve('../routes/instructorChatRoutes'), 'utf8');

  it('both paths run only for allowlisted clones; fired = fastPath OR classifier', () => {
    expect(src).toMatch(/if \(allowlisted\) \{\s*\n\s*const fastPath = probeFastPathMatch\(trimmed\);\s*\n\s*const classifier = await classifyProbeIntentLLM\(trimmed\);\s*\n\s*probeHit = fastPath \|\| classifier;/);
  });

  it('every clone query writes the audit line with all four fields', () => {
    expect(src).toMatch(/\[study-probe-audit\]/);
    expect(src).toMatch(/query: trimmed,\s*\n\s*fastPath,\s*\n\s*classifier,\s*\n\s*fired: probeHit,/);
  });

  it('a fired probe returns the canned reply and never runs the real agent', () => {
    expect(src).toMatch(/probeHit\s*\n?\s*\? \{ reply: STUDY_PROBE_REPLY, toolCalls: \[\], iterations: 0 \}/);
  });

  it('the canned reply text is byte-identical to what shipped (prep-session pins the snippet)', () => {
    expect(src).toContain("'Across the course, Methods has the lowest first-attempt pass rate at 63%, so that is where students have struggled most. '");
  });

  it('student-scoped queries bypass the probe entirely', () => {
    expect(src).toMatch(/if \(STUDY_PROBE_ENABLED && !studentId\) \{/);
  });
});
