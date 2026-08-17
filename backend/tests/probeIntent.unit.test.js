/**
 * Probe 2 trigger precision (STUDY_PROBE, instructorChatRoutes).
 *
 * The canned reply makes a claim about a TOPIC, so the trigger must fire on
 * topic-weakness/reteach intent — including the panel's suggested chip — and
 * must NOT hijack the other two chips, student questions, milestone
 * questions, or anything unrelated. A false positive outs the probe by
 * answering the wrong question; a false negative leaves the probe dark for a
 * participant (which is exactly what happened when the old bare-keyword regex
 * sat behind a course gate the panel never satisfied).
 */
jest.mock('../agents/framework/baseAgent', () => ({
  runAgent: jest.fn(),
  runAgentWithTools: jest.fn(),
}));
const { runAgent } = require('../agents/framework/baseAgent');
const {
  isProbeTopicWeaknessIntent,
  classifyProbeIntentLLM,
  PROBE_INTENT_SYSTEM_PROMPT,
  isProbeMilestoneQuestion,
  PROBE_CUE_RE,
} = require('../routes/instructorChatRoutes');

describe('Probe 2 intent trigger', () => {
  it.each([
    // the suggested chip, verbatim
    ['Which topic has the lowest pass rate?'],
    // typed variants named in the study protocol
    ['what should I reteach next week?'],
    ['What should I re-teach?'],
    ['which topic are students weakest at'],
    // reasonable phrasings of the same intent
    ['Which unit is the class struggling with the most?'],
    ['what topic has the worst pass rate'],
    ['which module are they failing?'],
  ])('fires on topic-weakness intent: "%s"', (msg) => {
    expect(isProbeTopicWeaknessIntent(msg)).toBe(true);
  });

  it.each([
    // the other two suggested chips must reach the real agent
    ['Which 3 students are most at risk right now?'],
    ["What's the hardest milestone?"],
    // student-weakness phrasing is a PEOPLE question, not a topic question
    ['which students are struggling the most?'],
    ['who is struggling this week'],
    ['which students have the lowest scores?'],
    // unrelated queries
    ['Summarize this week for me'],
    ['How many quizzes were submitted yesterday?'],
    ['Show me Maya\'s progress'],
    ['How do I publish a topic?'],
  ])('does NOT hijack: "%s"', (msg) => {
    expect(isProbeTopicWeaknessIntent(msg)).toBe(false);
  });

  it('a student question mentioning a topic word still routes by its subject', () => {
    // "students" + "topic" + weakness — genuinely ambiguous; the trigger
    // resolves toward firing only when a topic word is present. Pin the
    // current decision so a future edit is a conscious one.
    expect(isProbeTopicWeaknessIntent('which topic are students weakest at')).toBe(true);
    expect(isProbeTopicWeaknessIntent('which students are weakest at this topic')).toBe(true);
  });
});

describe('Probe 2 LLM intent layer (behind the regex fast path)', () => {
  beforeEach(() => runAgent.mockReset());

  it('fires the canned reply when the classifier says topic_weakness', async () => {
    runAgent.mockResolvedValue({ category: 'topic_weakness' });
    await expect(classifyProbeIntentLLM('where should I focus my review session?')).resolves.toBe(true);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ taskName: 'probe_intent' }));
  });

  it('routes to the real agent when the classifier says other', async () => {
    runAgent.mockResolvedValue({ category: 'other' });
    await expect(classifyProbeIntentLLM("What's the hardest milestone?")).resolves.toBe(false);
  });

  it('FAILS CLOSED on a classifier outage — real agent, never the canned reply', async () => {
    runAgent.mockRejectedValue(new Error('groq down'));
    await expect(classifyProbeIntentLLM('what should we review?')).resolves.toBe(false);
  });

  it('fails closed on malformed classifier output', async () => {
    runAgent.mockResolvedValue({ nonsense: true });
    await expect(classifyProbeIntentLLM('what should we review?')).resolves.toBe(false);
  });

  it('the category boundary preserves the study contradiction: milestones and students are OTHER', () => {
    // The prompt is the contract here — pin the exclusions so an edit that
    // would let the canned Methods claim answer a milestone/at-risk question
    // fails a test instead of outing the probe mid-session.
    expect(PROBE_INTENT_SYSTEM_PROMPT).toMatch(/which MILESTONE is hardest/);
    expect(PROBE_INTENT_SYSTEM_PROMPT).toMatch(/which STUDENTS are at risk/);
    expect(PROBE_INTENT_SYSTEM_PROMPT).toMatch(/specific named student/);
    expect(PROBE_INTENT_SYSTEM_PROMPT).toMatch(/When unsure: "other"/);
  });

  it('the route consults the LLM only behind the regex, the cue prefilter, and the allowlist (source contract)', () => {
    const src = require('fs').readFileSync(require.resolve('../routes/instructorChatRoutes'), 'utf8');
    expect(src).toMatch(/if \(allowlisted && !isProbeMilestoneQuestion\(trimmed\)\) \{/);
    expect(src).toMatch(/isProbeTopicWeaknessIntent\(trimmed\)\s*\n\s*\|\| \(PROBE_CUE_RE\.test\(trimmed\) && await classifyProbeIntentLLM\(trimmed\)\)/);
  });

  describe('deterministic milestone exclusion — the negative control can NEVER be canned', () => {
    it.each([
      ["What's the hardest milestone?"],
      ['rank the milestones by difficulty'],
      ['which milestone do students find hardest?'],
    ])('excludes: "%s"', (m) => {
      expect(isProbeMilestoneQuestion(m)).toBe(true);
    });

    it('does not exclude topic questions that merely mention a module', () => {
      expect(isProbeMilestoneQuestion('which module are they failing?')).toBe(false);
    });
  });

  describe('cue prefilter — zero classifier latency on ordinary real-agent questions', () => {
    it.each([
      ['Which 3 students are most at risk right now?'],
      ["Summarize Maya's progress for me"],
      ['How many quizzes were submitted yesterday?'],
      ['Show me enrollment for this course'],
    ])('no cue, no classifier call: "%s"', (m) => {
      expect(PROBE_CUE_RE.test(m)).toBe(false);
    });

    it.each([
      ['Where should I focus my review session next week?'],
      ['I want to plan a revision class - what content do students most need help with?'],
      ['which part of the course is students most failing?'],
      ['Considering how the class has been doing overall, which unit would you say needs re-explaining?'],
      ['what are students struggling with the most?'],
    ])('cue present, classifier consulted: "%s"', (m) => {
      expect(PROBE_CUE_RE.test(m)).toBe(true);
    });
  });
});
