/**
 * Unit tests for the topic-plan repair pass (pilot finding P4).
 *
 * The bug: one over/under-sized module in one topic discarded the ENTIRE
 * generated payload and surfaced a raw Zod path ("topics.14.modules.0.
 * milestones: Array must contain at most 8 element(s)") to the instructor.
 * The fix repairs mechanically repairable violations before the strict parse
 * and never lets a Zod path reach a user-facing error string. Schema limits
 * themselves are untouched (product decisions, not the bug).
 */
const {
  validateTopicPlanPayload,
  validateSingleTopicPayload,
  repairTopicPlanPayload,
  truncateAtWordBoundary
} = require('../agents/validators/topicPlanValidator');

const OVERVIEW =
  'This plan walks the course syllabus week by week, covering security goals, cryptography, networks, web security, operations, and policy in order.';

const mkMilestones = (n) => Array.from({ length: n }, (_, i) => ({ text: `Milestone ${i + 1}: demonstrate the concept` }));
const mkModule = (over = {}) => ({
  moduleId: 'mod_test_1',
  title: 'Core Module',
  description: 'Covers the essentials',
  points: 100,
  milestones: mkMilestones(4),
  ...over
});
const mkTopic = (over = {}) => ({
  title: 'Security Goals',
  objective: 'Understand CIA triad',
  syllabusAnchors: ['Week 1: Security goals and threat models'],
  modules: [mkModule()],
  ...over
});
const mkPayload = (topics) => ({ syllabusCoverageOverview: OVERVIEW, topics });

const NO_ZOD_PATHS = (errors) => {
  for (const e of errors) {
    expect(e).not.toMatch(/^topics\.\d+\./);
    expect(e).not.toContain('Array must contain');
  }
};

describe('repair pass — mechanically repairable violations', () => {
  it('truncates 9 milestones to 8 with a warning naming the topic and module', () => {
    const payload = mkPayload([
      mkTopic({ title: 'Network Attacks', modules: [mkModule({ title: 'Common Attacks', milestones: mkMilestones(9) })] })
    ]);
    const v = validateTopicPlanPayload(payload);
    expect(v.valid).toBe(true);
    expect(v.topics[0].modules[0].milestones).toHaveLength(8);
    expect(v.warnings.join(' ')).toMatch(/Common Attacks/);
    expect(v.warnings.join(' ')).toMatch(/Network Attacks/);
    expect(v.warnings.join(' ')).toMatch(/at most 8/);
  });

  it('keeps the first 20 of 21 topics with a warning', () => {
    const topics = Array.from({ length: 21 }, (_, i) => mkTopic({ title: `Topic ${i + 1}` }));
    const v = validateTopicPlanPayload(mkPayload(topics));
    expect(v.valid).toBe(true);
    expect(v.topics).toHaveLength(20);
    expect(v.warnings.join(' ')).toMatch(/first 20 of 21/);
  });

  it('caps syllabusAnchors at 10 with a warning', () => {
    const anchors = Array.from({ length: 12 }, (_, i) => `Week ${i + 1}: something substantial`);
    const v = validateTopicPlanPayload(mkPayload([mkTopic({ syllabusAnchors: anchors })]));
    expect(v.valid).toBe(true);
    expect(v.topics[0].syllabusAnchors).toHaveLength(10);
    expect(v.warnings.join(' ')).toMatch(/first 10 of 12/);
  });

  it('truncates over-long strings at a word boundary', () => {
    const long = `${'word '.repeat(80)}ending`; // > 300 chars
    const v = validateTopicPlanPayload(mkPayload([mkTopic({ title: long })]));
    expect(v.valid).toBe(true);
    expect(v.topics[0].title.length).toBeLessThanOrEqual(300);
    expect(v.topics[0].title.endsWith('word')).toBe(true); // no mid-word cut
    expect(truncateAtWordBoundary('alpha beta gamma', 12)).toBe('alpha beta');
  });

  it('leaves an already-valid payload byte-identical with zero warnings', () => {
    const payload = mkPayload([mkTopic(), mkTopic({ title: 'Cryptography' })]);
    const before = JSON.parse(JSON.stringify(payload));
    const v = validateTopicPlanPayload(payload);
    expect(v.valid).toBe(true);
    expect(v.warnings).toEqual([]);
    expect(v.topics).toHaveLength(2);
    expect(payload).toEqual(before); // input not mutated
  });
});

describe('repair pass — unrepairable-by-truncation policy (drop, then fail readable)', () => {
  it('drops a 1-milestone module when sibling modules remain, keeping the topic', () => {
    const topic = mkTopic({
      title: 'Midterm Review',
      modules: [mkModule({ title: 'Thin Module', milestones: mkMilestones(1) }), mkModule({ title: 'Full Module' })]
    });
    const v = validateTopicPlanPayload(mkPayload([topic, mkTopic({ title: 'Sibling' })]));
    expect(v.valid).toBe(true);
    const kept = v.topics.find((t) => t.title === 'Midterm Review');
    expect(kept.modules).toHaveLength(1);
    expect(kept.modules[0].title).toBe('Full Module');
    expect(v.warnings.join(' ')).toMatch(/Thin Module/);
    expect(v.warnings.join(' ')).toMatch(/at least 2/);
  });

  it('drops a topic whose only module is under-min when sibling topics remain (the reproduced P4 shape)', () => {
    // Captured live 2026-08-03: topics[7] "Midterm Exam" and topics[14]
    // "Capstone Tabletop Exercise and Review" each had one 1-milestone module.
    const topics = [
      mkTopic({ title: 'Security Goals' }),
      mkTopic({ title: 'Midterm Exam', modules: [mkModule({ milestones: mkMilestones(1) })] }),
      mkTopic({ title: 'Policy, Ethics, and Law' })
    ];
    const v = validateTopicPlanPayload(mkPayload(topics));
    expect(v.valid).toBe(true);
    expect(v.topics.map((t) => t.title)).toEqual(['Security Goals', 'Policy, Ethics, and Law']);
    expect(v.warnings.join(' ')).toMatch(/Midterm Exam/);
  });

  it('fails readable when nothing is salvageable — no Zod path, no "Array must contain"', () => {
    const v = validateTopicPlanPayload(mkPayload([mkTopic({ modules: [mkModule({ milestones: mkMilestones(1) })] })]));
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
    NO_ZOD_PATHS(v.errors);
    expect(v.errors[0]).toMatch(/Generate again|generate again/i);
    expect(v.code).toBe('TOPIC_PLAN_INVALID');
  });
});

describe('regression — user-facing errors are never schema internals', () => {
  const invalidPayloads = [
    mkPayload([mkTopic({ modules: [mkModule({ milestones: mkMilestones(1) })] })]), // nothing salvageable
    mkPayload([mkTopic({ syllabusAnchors: ['ab'] })]), // anchors all unusable
    { syllabusCoverageOverview: 'too short', topics: [mkTopic()] }, // overview under min
    { topics: [mkTopic()] }, // overview missing
    { syllabusCoverageOverview: OVERVIEW, topics: 'not-an-array' },
    null,
    'garbage'
  ];

  it.each(invalidPayloads.map((p, i) => [i, p]))('payload #%i fails with readable errors only', (_, payload) => {
    const v = validateTopicPlanPayload(payload);
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
    NO_ZOD_PATHS(v.errors);
  });

  it('keeps machine detail in internalErrors, out of the user-facing channel', () => {
    const v = validateTopicPlanPayload({ syllabusCoverageOverview: 'too short', topics: [mkTopic()] });
    expect(v.valid).toBe(false);
    expect((v.internalErrors || []).join(' ')).toMatch(/syllabusCoverageOverview/);
    NO_ZOD_PATHS(v.errors);
  });
});

describe('validateSingleTopicPayload (AI Edit box) — same treatment', () => {
  it('repairs an over-long module in a single topic edit', () => {
    const v = validateSingleTopicPayload(mkTopic({ modules: [mkModule({ milestones: mkMilestones(11) })] }));
    expect(v.valid).toBe(true);
    expect(v.topic.modules[0].milestones).toHaveLength(8);
    expect(v.warnings.join(' ')).toMatch(/at most 8/);
  });

  it('fails readable when the edit is unsalvageable', () => {
    const v = validateSingleTopicPayload(mkTopic({ modules: [mkModule({ milestones: [] })] }));
    expect(v.valid).toBe(false);
    NO_ZOD_PATHS(v.errors);
    expect(v.errors[0]).toMatch(/rephras/i);
  });
});

describe('repair pass — review-hardened edge cases', () => {
  it('normalizes string/boolean/null points to in-range numbers', () => {
    const v = validateTopicPlanPayload(
      mkPayload([
        mkTopic({ modules: [mkModule({ points: '100' })] }),
        mkTopic({ title: 'B', modules: [mkModule({ points: null })] }),
        mkTopic({ title: 'C', modules: [mkModule({ points: 1500 })] })
      ])
    );
    expect(v.valid).toBe(true);
    expect(v.topics[0].modules[0].points).toBe(100);
    expect(typeof v.topics[1].modules[0].points).toBe('number');
    expect(v.topics[2].modules[0].points).toBe(1000); // clamped
  });

  it('drops a module with MISSING milestones when siblings remain (drop policy, not whole-payload failure)', () => {
    const broken = { ...mkModule({ title: 'No Milestones' }) };
    delete broken.milestones;
    const v = validateTopicPlanPayload(mkPayload([mkTopic({ modules: [broken, mkModule({ title: 'Good' })] })]));
    expect(v.valid).toBe(true);
    expect(v.topics[0].modules).toHaveLength(1);
    expect(v.topics[0].modules[0].title).toBe('Good');
  });

  it('drops a topic with missing syllabusAnchors when sibling topics remain', () => {
    const noAnchors = mkTopic({ title: 'Ungrounded' });
    delete noAnchors.syllabusAnchors;
    const v = validateTopicPlanPayload(mkPayload([noAnchors, mkTopic({ title: 'Grounded' })]));
    expect(v.valid).toBe(true);
    expect(v.topics.map((t) => t.title)).toEqual(['Grounded']);
    expect(v.warnings.join(' ')).toMatch(/Ungrounded/);
  });

  it('under-min module drops do not count against the 8-module cap', () => {
    // 9 modules: #1 is under-min, #2-9 are valid. Dropping #1 first keeps all 8.
    const mods = [mkModule({ title: 'Thin', milestones: mkMilestones(1) })].concat(
      Array.from({ length: 8 }, (_, i) => mkModule({ title: `M${i + 2}`, moduleId: `mod_${i + 2}` }))
    );
    const v = validateTopicPlanPayload(mkPayload([mkTopic({ modules: mods })]));
    expect(v.valid).toBe(true);
    expect(v.topics[0].modules).toHaveLength(8);
    expect(v.topics[0].modules.map((m) => m.title)).not.toContain('Thin');
  });

  it('unsalvageable early topics do not crowd usable ones out of the 20-topic cap', () => {
    const bad = mkTopic({ title: 'Bad', modules: [mkModule({ milestones: mkMilestones(1) })] });
    const good = Array.from({ length: 20 }, (_, i) => mkTopic({ title: `Good ${i + 1}` }));
    const v = validateTopicPlanPayload(mkPayload([bad, ...good]));
    expect(v.valid).toBe(true);
    expect(v.topics).toHaveLength(20);
    expect(v.topics.every((t) => t.title.startsWith('Good'))).toBe(true);
  });
});

describe('repairTopicPlanPayload — direct behavior', () => {
  it('does not touch payloads whose shape is beyond mechanical repair', () => {
    const { data, warnings } = repairTopicPlanPayload('garbage');
    expect(data).toBe('garbage');
    expect(warnings).toEqual([]);
  });
});
