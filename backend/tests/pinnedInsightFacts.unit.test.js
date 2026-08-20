/**
 * B3 anchor pin (2026-08-20): on study clones the CODE decides which facts the
 * "What stands out" cards convey and in what order; the model only words them.
 * Conclusions identical per participant/reload/model — wording free (temp .35).
 */
jest.mock('../agents/framework/baseAgent', () => ({
  runAgent: jest.fn(),
  runAgentWithTools: jest.fn(),
}));
const { runAgent } = require('../agents/framework/baseAgent');
const {
  runInsightCards,
  computePinnedInsightFacts,
  fallbackCardFor,
} = require('../agents/instructorBriefingAgent');

const TREE = {
  topics: [
    { title: 'Methods', attempts: 60, passRate: 63.2 },
    { title: 'Variables and Data Types', attempts: 55, passRate: 57.9 },
    { title: 'Logical Operators', attempts: 62, passRate: 67.1 },
    { title: 'Number Systems', attempts: 50, passRate: 71.4 },
    { title: 'Drafts Only', attempts: 0, passRate: null },
  ],
};
const AT_RISK = [
  { atRisk: true, name: 'Maya R.', riskScore: 75, quizAttemptCount: 8, quizScore: 90.4, attempts: 0 },
  { atRisk: true, name: 'Noah Yamamoto', riskScore: 44, quizAttemptCount: 3, quizScore: 61, attempts: 38 },
  { atRisk: false, name: 'Healthy Student', riskScore: 5 },
];

describe('computePinnedInsightFacts — deterministic ordered facts', () => {
  it('lead = true weakest topic by first-attempt pass rate, exact number', () => {
    const facts = computePinnedInsightFacts({ tree: TREE, atRisk: AT_RISK });
    expect(facts[0]).toMatchObject({ id: 'weakest-topic', name: 'Variables and Data Types', number: '57.9%' });
  });

  it('fixed order: weakest, standout at-risk, second-weakest, strongest', () => {
    const facts = computePinnedInsightFacts({ tree: TREE, atRisk: AT_RISK });
    expect(facts.map((f) => f.id)).toEqual(['weakest-topic', 'standout-at-risk', 'second-weakest-topic', 'strongest-topic']);
    expect(facts[1]).toMatchObject({ name: 'Maya R.', number: '90.4' });
    expect(facts[2]).toMatchObject({ name: 'Methods', number: '63.2%' });
    expect(facts[3]).toMatchObject({ name: 'Number Systems', number: '71.4%' });
  });

  it('is a pure function: same input, same output, every time', () => {
    const a = computePinnedInsightFacts({ tree: TREE, atRisk: AT_RISK });
    const b = computePinnedInsightFacts({ tree: TREE, atRisk: AT_RISK });
    expect(a).toEqual(b);
  });

  it('zero-attempt topics never rank; ties break deterministically', () => {
    const facts = computePinnedInsightFacts({ tree: TREE, atRisk: [] });
    expect(facts.every((f) => f.name !== 'Drafts Only')).toBe(true);
  });

  it('B3 guardrail: logs loudly if the lead ever IS Methods', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    computePinnedInsightFacts({ tree: { topics: [{ title: 'Methods', attempts: 10, passRate: 40 }, { title: 'Loops', attempts: 10, passRate: 90 }] }, atRisk: [] });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('B3 ANCHOR CONFLICT'), expect.anything());
    spy.mockRestore();
  });
});

describe('runInsightCards pinned mode — model owns wording only', () => {
  beforeEach(() => runAgent.mockReset());
  const FACTS = computePinnedInsightFacts({ tree: TREE, atRisk: AT_RISK });

  it('valid model wording passes through; id/chartRef forced from the facts', async () => {
    runAgent.mockResolvedValue({
      insightCards: FACTS.map((f) => ({ id: f.id, title: 'A headline here', body: `In this course, ${f.name} sits at ${f.number}${f.numberContext ? ` (${f.numberContext})` : ''} right now.`, chartRef: 'none' })),
    });
    const { insightCards } = await runInsightCards({ tree: TREE, atRisk: AT_RISK, pinnedFacts: FACTS });
    expect(insightCards.map((c) => c.id)).toEqual(FACTS.map((f) => f.id));
    expect(insightCards[0].body).toContain('Variables and Data Types');
    expect(insightCards[0].body).toContain('57.9%');
    expect(insightCards[0].chartRef).toBe('tree'); // fact's ref, not the model's 'none'
  });

  it('a card that drops or rounds the number gets deterministic fallback wording', async () => {
    runAgent.mockResolvedValue({
      insightCards: [
        { id: 'weakest-topic', title: 'x', body: 'Variables and Data Types is at about 58 percent.', chartRef: 'tree' }, // rounded → invalid
        { id: 'standout-at-risk', title: 'x', body: 'Maya R. keeps a 90.4 quiz average across 8 quiz attempts.', chartRef: 'atRisk' },
        { id: 'second-weakest-topic', title: 'x', body: 'Methods sits at 63.2%.', chartRef: 'tree' },
        { id: 'strongest-topic', title: 'x', body: 'Number Systems leads at 71.4%.', chartRef: 'tree' },
      ],
    });
    const { insightCards } = await runInsightCards({ tree: TREE, atRisk: AT_RISK, pinnedFacts: FACTS });
    expect(insightCards[0].body).toContain('57.9%'); // fallback restored the exact number
    expect(insightCards[0].body).toContain('Variables and Data Types');
    expect(insightCards[1].body).toContain('90.4');
  });

  it('model reorders or omits cards → order and set still come from the facts', async () => {
    runAgent.mockResolvedValue({
      insightCards: [
        { id: 'strongest-topic', title: 'x', body: 'Number Systems leads at 71.4%.', chartRef: 'tree' },
        { id: 'weakest-topic', title: 'x', body: 'Variables and Data Types struggles at 57.9%.', chartRef: 'tree' },
      ],
    });
    const { insightCards } = await runInsightCards({ tree: TREE, atRisk: AT_RISK, pinnedFacts: FACTS });
    expect(insightCards.map((c) => c.id)).toEqual(['weakest-topic', 'standout-at-risk', 'second-weakest-topic', 'strongest-topic']);
    expect(insightCards[1].body).toContain('Maya R.'); // omitted by model → fallback
  });

  it('MODEL SWAP INVARIANCE: two totally different model outputs yield identical conclusions', async () => {
    const wordingA = FACTS.map((f) => ({ id: f.id, title: 'Llama-style headline', body: `Heads up: ${f.name} is currently at ${f.number} — worth a look.`, chartRef: 'none' }));
    const wordingB = FACTS.map((f) => ({ id: f.id, title: 'Gpt-oss-style headline', body: `Data check — ${f.name} stands at ${f.number} for this cohort.`, chartRef: 'heatmap' }));
    runAgent.mockResolvedValueOnce({ insightCards: wordingA }).mockResolvedValueOnce({ insightCards: wordingB });
    const r1 = await runInsightCards({ tree: TREE, atRisk: AT_RISK, pinnedFacts: FACTS });
    const r2 = await runInsightCards({ tree: TREE, atRisk: AT_RISK, pinnedFacts: FACTS });
    const conclusions = (r) => r.insightCards.map((c) => ({ id: c.id, chartRef: c.chartRef, hasName: FACTS.find((f) => f.id === c.id) && c.body.toLowerCase().includes(FACTS.find((f) => f.id === c.id).name.toLowerCase()), hasNumber: c.body.includes(FACTS.find((f) => f.id === c.id).number) }));
    expect(conclusions(r1)).toEqual(conclusions(r2)); // same facts, same order, same refs
    expect(r1.insightCards[0].body).not.toBe(r2.insightCards[0].body); // wording differs
  });

  it('model outage → all-fallback cards, conclusions intact', async () => {
    runAgent.mockRejectedValue(new Error('groq down'));
    const { insightCards } = await runInsightCards({ tree: TREE, atRisk: AT_RISK, pinnedFacts: FACTS });
    expect(insightCards).toHaveLength(FACTS.length);
    expect(insightCards[0].body).toContain('57.9%');
  });

  it('non-pinned call (no pinnedFacts) keeps the original free-form path', async () => {
    runAgent.mockResolvedValue({ insightCards: [{ id: 'x', title: 'Free-form card', body: 'Anything grounded.', chartRef: 'tree' }] });
    const { insightCards } = await runInsightCards({ tree: TREE, atRisk: AT_RISK });
    expect(insightCards[0].title).toBe('Free-form card');
  });
});

describe('route + prep-session contracts', () => {
  it('insight-cards route pins ONLY for allowlisted study courses', () => {
    const src = require('fs').readFileSync(require.resolve('../routes/analyticsRoutes'), 'utf8');
    expect(src).toMatch(/const pinnedFacts = \(STUDY_PROBE_ENABLED && STUDY_PROBE_COURSE_SET\.has\(String\(courseId\)\)\)\s*\n\s*\? computePinnedInsightFacts\(\{ tree, atRisk \}\)\s*\n\s*: null;/);
  });

  it('prep-session asserts lead topic+number, lead != Methods, and two-fetch agreement', () => {
    const prep = require('fs').readFileSync(require.resolve('../scripts/provisionStudyEnvironment'), 'utf8');
    expect(prep).toMatch(/leads with the pinned weakest topic/);
    expect(prep).toMatch(/lead is NOT Methods/);
    expect(prep).toMatch(/two consecutive fetches agree on every fact/);
  });

  it('fallbackCardFor always embeds name and exact number', () => {
    const f = { id: 'weakest-topic', name: 'Variables and Data Types', number: '57.9%', chartRef: 'tree' };
    const card = fallbackCardFor(f);
    expect(card.body).toContain(f.name);
    expect(card.body).toContain(f.number);
  });
});
