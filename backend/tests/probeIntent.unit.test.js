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
const { isProbeTopicWeaknessIntent } = require('../routes/instructorChatRoutes');

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
