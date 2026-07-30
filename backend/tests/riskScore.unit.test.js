/**
 * Unit tests for computeRiskScore — the Risk Insights v2 formula.
 *
 * These encode the six counter-examples that were hand-verified and approved
 * at the Step-2 formula gate (see the "Risk Insights v2" commit and
 * docs/TEACH_UX_AUDIT_AND_GUIDELINES.md), plus the R1–R6 / Q2 / Q3
 * adjustments. If a test here breaks, the formula's meaning changed — that
 * requires the same explicit sign-off the original adjustments got, because
 * the pilot study's findings are grounded in these exact semantics.
 *
 * computeRiskScore is pure (no DB); inputs are built inline.
 */
const { computeRiskScore } = require('../services/milestoneAnalyticsService');

// Fixed clock so tests are deterministic (the service forbids nothing here,
// but we always pass cutoffDate explicitly).
const NOW = new Date('2026-07-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

/** Build courseData: n published topics, publishedAt `publishedDaysAgo` back. */
function topics(n, { publishedDaysAgo = 45 } = {}) {
  return {
    publishedTopics: Array.from({ length: n }, (_, i) => ({
      topicId: `t${i + 1}`,
      orderIndex: i,
      publishedAt: publishedDaysAgo == null ? null : daysAgo(publishedDaysAgo),
      title: `Topic ${i + 1}`,
    })),
  };
}

/**
 * Build studentData.
 * quizzes: { t1: [{ d: daysAgo, passed, score }] } — submitted, non-revision.
 * milestones: { t1: [daysAgoNumbers] }
 */
function student({ enrolledDaysAgo = 45, quizzes = {}, milestones = {} } = {}) {
  const quizByTopic = new Map();
  let earliest = null;
  for (const [tid, list] of Object.entries(quizzes)) {
    quizByTopic.set(
      tid,
      list.map((a) => {
        const submittedAt = daysAgo(a.d);
        if (!earliest || submittedAt < earliest) earliest = submittedAt;
        return { submittedAt, passed: a.passed === true, scorePct: a.score };
      }),
    );
  }
  const milestoneDatesByTopic = new Map();
  for (const [tid, list] of Object.entries(milestones)) {
    const dates = list.map((d) => daysAgo(d));
    for (const dt of dates) if (!earliest || dt < earliest) earliest = dt;
    milestoneDatesByTopic.set(tid, dates);
  }
  return {
    enrollmentCreatedAt: daysAgo(enrolledDaysAgo),
    earliestActivity: earliest,
    quizByTopic,
    milestoneDatesByTopic,
  };
}

const run = (studentData, courseData, cutoffDate = NOW) =>
  computeRiskScore({ studentData, courseData, cutoffDate });

describe('computeRiskScore — gate-approved counter-examples', () => {
  it('day-1 enrollee is paused to healthy by the R1 grace, not scored 90/critical', () => {
    const r = run(student({ enrolledDaysAgo: 1 }), topics(7));
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe('healthy');
    expect(r.dominantDriver).toBe('new_enrollee');
    expect(r.flags).toEqual([]);
    expect(r.metaNote).toMatch(/paused/i);
  });

  it('silent strong starter (perfect on 1–2, silent on 3–7) → 29/watch, no_engagement ONLY', () => {
    const r = run(
      student({
        quizzes: {
          t1: [{ d: 40, passed: true, score: 100 }],
          t2: [{ d: 39, passed: true, score: 100 }],
        },
      }),
      topics(7),
    );
    expect(r.riskScore).toBe(29);
    expect(r.riskLevel).toBe('watch');
    // R2+R6: a perfect record on attempted topics must NOT read "low pass rate".
    expect(r.flags).toEqual(['no_engagement']);
    expect(r.signals.pass_rate_signal).toBe(0);
  });

  it('top student is not punished when topics were published inside the R3 grace window', () => {
    // 8 topics: 6 old (all passed at 88%), 2 published yesterday.
    const courseData = {
      publishedTopics: [
        ...topics(6).publishedTopics,
        { topicId: 't7', orderIndex: 6, publishedAt: daysAgo(1), title: 'New 1' },
        { topicId: 't8', orderIndex: 7, publishedAt: daysAgo(1), title: 'New 2' },
      ],
    };
    const quizzes = {};
    for (let i = 1; i <= 6; i++) quizzes[`t${i}`] = [{ d: 30 - i, passed: true, score: 88 }];
    const r = run(student({ quizzes }), courseData);
    expect(r.publishedN).toBe(6); // the 2 fresh topics are gated out
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe('healthy');
  });

  it('drowning-but-trying (fully engaged, failing, sub-50 avg) is floored to 40/high by R4', () => {
    // 6 topics, 3 attempts each; only t1 eventually passed. Avg ≈ 48.1.
    const quizzes = {
      t1: [
        { d: 30, passed: false, score: 40 },
        { d: 29, passed: false, score: 45 },
        { d: 28, passed: true, score: 60 },
      ],
    };
    for (let i = 2; i <= 6; i++) {
      quizzes[`t${i}`] = [
        { d: 25 - i, passed: false, score: 45 },
        { d: 24 - i, passed: false, score: 50 },
        { d: 23 - i, passed: false, score: 49 },
      ];
    }
    const r = run(student({ quizzes }), topics(6));
    expect(r.signals.engagement_signal).toBe(0);
    expect(r.riskScore).toBe(40); // pre-floor ~35, R4 lifts to exactly 40
    expect(r.riskLevel).toBe('high');
    expect(r.flags).toEqual(expect.arrayContaining(['low_pass_rate', 'stuck_topic']));
    // Persistence must read LOW here — relentless failing is not "persists".
    expect(r.persistence_score).toBe(17); // 2 / (2 + 10)
  });

  it('one-lucky-pass-then-gone → 32/watch, no_engagement only (no false low_pass_rate)', () => {
    const r = run(
      student({ enrolledDaysAgo: 20, quizzes: { t1: [{ d: 18, passed: true, score: 61 }] } }),
      topics(5),
    );
    expect(r.riskScore).toBe(32);
    expect(r.riskLevel).toBe('watch');
    expect(r.flags).toEqual(['no_engagement']);
  });

  it('zero published topics → healthy (guards work before content drops)', () => {
    const r = run(student(), { publishedTopics: [] });
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe('healthy');
    expect(r.dominantDriver).toBe('healthy');
  });
});

describe('computeRiskScore — R1 effectiveStart anchor', () => {
  it('recent enrollment row + long activity history is NOT treated as a new enrollee', () => {
    // The re-enrollment / section-transfer case: enrollment createdAt is 2 days
    // old but the student has 45 days of activity. Grace must NOT fire.
    const sd = student({ enrolledDaysAgo: 2, quizzes: { t1: [{ d: 45, passed: false, score: 20 }] } });
    const r = run(sd, topics(7));
    expect(r.dominantDriver).not.toBe('new_enrollee');
    expect(r.metaNote == null).toBe(true);
    // This input reproduces the canonical "Nia" shape: 78/critical.
    expect(r.riskScore).toBe(78);
    expect(r.riskLevel).toBe('critical');
    expect(r.daysSinceEnrollment).toBe(45); // anchored to earliest activity
  });
});

describe('computeRiskScore — Q2 split denominators', () => {
  it('milestone-only student reads "not progressing", never "failing quizzes"', () => {
    // Touched t1 via a milestone check, took zero quizzes (the Ananya/Noah case).
    const r = run(student({ milestones: { t1: [40] } }), topics(7));
    expect(r.riskScore).toBe(34);
    expect(r.riskLevel).toBe('watch');
    expect(r.flags).toEqual(['no_engagement']); // NO low_pass_rate
    expect(r.signals.pass_rate_signal).toBe(0); // quiz-only denominator
    expect(r.attemptedPublished).toBe(1); // milestone counts as "touched"
    expect(r.attemptedQuizTopics).toBe(0); // ...but not as "quizzed"
    expect(r.avgQuizScore).toBeNull();
  });
});

describe('computeRiskScore — Q3 healthy-band driver + R5 thresholds', () => {
  it('a healthy top student with a couple unpassed topics reads driver=healthy, not "failing"', () => {
    // Attempted all 7, passed 6 (one single failed attempt), high scores → score 4.
    const quizzes = {};
    for (let i = 1; i <= 6; i++) quizzes[`t${i}`] = [{ d: 30 - i, passed: true, score: 97 }];
    quizzes.t7 = [{ d: 20, passed: false, score: 55 }];
    const r = run(student({ quizzes }), topics(7));
    expect(r.riskLevel).toBe('healthy');
    expect(r.riskScore).toBeLessThan(20);
    expect(r.riskScore).toBeGreaterThan(0);
    expect(r.dominantDriver).toBe('healthy'); // Q3: whole band, not just score 0
  });

  it('watch starts at exactly 20 (R5 raised it from 10)', () => {
    // engagement_signal exactly 0.5 → score 20 → watch.
    const quizzes = {};
    for (let i = 1; i <= 4; i++) quizzes[`t${i}`] = [{ d: 30 - i, passed: true, score: 90 }];
    const at20 = run(student({ quizzes }), topics(8));
    expect(at20.riskScore).toBe(20);
    expect(at20.riskLevel).toBe('watch');

    // engagement_signal 0.475 → score 19 → still healthy.
    const q19 = {};
    for (let i = 1; i <= 21; i++) q19[`t${i}`] = [{ d: 30, passed: true, score: 90 }];
    const at19 = run(student({ quizzes: q19 }), topics(40));
    expect(at19.riskScore).toBe(19);
    expect(at19.riskLevel).toBe('healthy');
  });
});

describe('computeRiskScore — persistence readout', () => {
  it('is null when the student never had to retry (no signal either way)', () => {
    const r = run(
      student({ quizzes: { t1: [{ d: 30, passed: true, score: 90 }] } }),
      topics(2),
    );
    expect(r.persistence_score).toBeNull();
  });

  it('reads high for retry-then-pass (grinding-but-succeeding)', () => {
    const r = run(
      student({
        quizzes: {
          t1: [
            { d: 30, passed: false, score: 40 },
            { d: 29, passed: false, score: 55 },
            { d: 28, passed: true, score: 70 },
          ],
        },
      }),
      topics(2),
    );
    expect(r.persistence_score).toBe(100); // 2 retries, all on an eventually-passed topic
  });
});

describe('computeRiskScore — publish-grace fallback + cutoff semantics', () => {
  it('topics missing publishedAt are counted (documented fallback) and flagged', () => {
    const r = run(student({ enrolledDaysAgo: 30 }), topics(3, { publishedDaysAgo: null }));
    expect(r.publishedN).toBe(3);
    expect(r.usedPublishGraceFallback).toBe(true);
  });

  it('attempts after the cutoffDate are excluded (as-of scoring for the trend endpoint)', () => {
    const sd = student({ quizzes: { t1: [{ d: 1, passed: true, score: 90 }] } }); // attempt yesterday
    const atNow = run(sd, topics(4));
    expect(atNow.attemptedQuizTopics).toBe(1);

    const fiveDaysAgo = run(sd, topics(4), daysAgo(5)); // before the attempt existed
    expect(fiveDaysAgo.attemptedQuizTopics).toBe(0);
    expect(fiveDaysAgo.totalAttempts).toBe(0);
    expect(fiveDaysAgo.signals.engagement_signal).toBe(1); // looked disengaged back then
  });
});
