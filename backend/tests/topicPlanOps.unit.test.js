/**
 * Topic-plan coverage + additive modify (2026-08, shipped before the study
 * window):
 *
 *  - inferSegmentCountFromText recognizes enumeration beyond the five
 *    Week/Module/Unit/Chapter/Lecture labels (Topic N, Session N, numbered
 *    outlines), so an unlabeled syllabus no longer falls back to the course
 *    default of 4 and silently drops topics.
 *  - validateTopicPlanPayload enforces an enumerated-segment floor
 *    (minTopicCount) so an incomplete plan FAILS instead of validating on
 *    filename substrings alone.
 *  - validateTopicPlanOpsPayload: the modify contract is a change set; targets
 *    must exactly match current draft titles; locked topics are never legal
 *    targets.
 */
const {
  inferSegmentCountFromText,
  resolveTopicPlanTargetCount,
} = require('../services/courseContextService');
const {
  validateTopicPlanPayload,
  validateTopicPlanOpsPayload,
} = require('../agents/validators/topicPlanValidator');

const mod = (id = 'mod_a') => ({
  moduleId: id,
  title: 'M',
  description: '',
  difficulty: 'core',
  points: 10,
  milestones: [{ text: 'a' }, { text: 'b' }],
});
const topic = (title) => ({
  title,
  objective: 'obj',
  syllabusAnchors: [`Unit for ${title}`],
  modules: [mod(`m_${title.replace(/\W+/g, '_').toLowerCase()}`)],
});
const OV = 'Overview maps every syllabus area to a topic with enough length for the validator minimum. Primary syllabus files: syllabus.txt';

describe('enumeration inference beyond Week/Module/Unit labels', () => {
  it('reads "Topic N:" labels', () => {
    const t = 'Topic 1: Intro\nTopic 2: Costs\nTopic 9: Ethics\nTopic 10: Futures';
    expect(inferSegmentCountFromText(t)).toBe(10);
  });

  it('does NOT count bare numbered lists — outcomes/admin/practice lists are not segments', () => {
    // A bare "1. … 12. …" scan was reviewed and rejected: it counted numbered
    // learning outcomes, numbered admin sections, and appended practice
    // questions as syllabus segments, and a miscount arms the validator's
    // hard minTopicCount floor (blocked generation). Only labeled enumerations
    // are confident enough to count.
    const outcomes = 'Course Learning Outcomes:\n' + Array.from({ length: 12 }, (_, i) => `${i + 1}. Students will be able to do thing ${i + 1}`).join('\n');
    expect(inferSegmentCountFromText(outcomes)).toBe(0);
    const admin = Array.from({ length: 8 }, (_, i) => `${i + 1}. ${['Course Description', 'Grading', 'Attendance', 'Late Work', 'Integrity', 'Accessibility', 'Contact', 'Materials'][i]}`).join('\n');
    expect(inferSegmentCountFromText(admin)).toBe(0);
  });

  it('a "1 topic per week"-style delta phrase never reads as a topic count', () => {
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 4,
      instructorMessage: 'add 2 topics on sorting and searching',
      contextText: 'prose syllabus with no labels',
      outlineHints: [],
    });
    // "add 2 topics" is a DELTA — reading it as "final draft set = 2" told the
    // modify agent to mass-remove drafts to hit the count.
    expect(r.topicBasis).not.toBe('explicit');
    expect(r.strictDraftCount).toBe(false);
  });

  it.each([
    ['remove 2 topics: Recursion and Stacks'],
    ['delete 3 topics please'],
    ['merge 2 topics into one'],
    ['add another 2 topics'],
  ])('delta phrasing "%s" does not become an explicit count', (msg) => {
    const { parseExplicitTopicCountFromMessage } = require('../services/courseContextService');
    expect(parseExplicitTopicCountFromMessage(msg)).toBeNull();
  });

  it('genuine final counts still parse ("make it 6 topics total")', () => {
    const { parseExplicitTopicCountFromMessage } = require('../services/courseContextService');
    expect(parseExplicitTopicCountFromMessage('make it 6 topics total')).toBe(6);
    expect(parseExplicitTopicCountFromMessage('Create exactly 10 topics')).toBe(10);
  });

  it('labeled syllabi keep their existing basis and count', () => {
    const text = Array.from({ length: 15 }, (_, i) => `Week ${i + 1}: stuff`).join('\n');
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 4,
      instructorMessage: 'Generate the initial topic plan from the syllabus.',
      contextText: text,
      outlineHints: [],
    });
    expect(r.topicBasis).toBe('week');
    expect(r.target).toBe(15);
  });
});

describe('validateTopicPlanPayload — enumerated-segment floor', () => {
  const plan = (n) => ({
    syllabusCoverageOverview: `${OV} Covers syllabus.txt fully.`,
    topics: Array.from({ length: n }, (_, i) => topic(`Topic ${i + 1}`)),
  });

  it('fails a plan with fewer topics than the syllabus enumerates', () => {
    const res = validateTopicPlanPayload(plan(4), { syllabusSourceNames: ['syllabus.txt'], minTopicCount: 10 });
    expect(res.valid).toBe(false);
    expect(res.code).toBe('SYLLABUS_COVERAGE_COUNT');
    expect(res.errors[0]).toMatch(/enumerates 10 major segments/);
  });

  it('passes when the floor is met', () => {
    const res = validateTopicPlanPayload(plan(10), { syllabusSourceNames: ['syllabus.txt'], minTopicCount: 10 });
    expect(res.valid).toBe(true);
  });

  it('no floor when minTopicCount is absent (instructor-requested counts are authoritative)', () => {
    const res = validateTopicPlanPayload(plan(4), { syllabusSourceNames: ['syllabus.txt'] });
    expect(res.valid).toBe(true);
  });
});

describe('validateTopicPlanOpsPayload — the modify change set', () => {
  const drafts = ['Arrays & Linked Lists', 'Stacks and Queues'];

  it('accepts a minimal add-only change set', () => {
    const res = validateTopicPlanOpsPayload(
      { syllabusCoverageOverview: OV, operations: [{ op: 'add', topic: topic('Recursion') }] },
      { draftTitles: drafts, syllabusSourceNames: ['syllabus.txt'] }
    );
    expect(res.valid).toBe(true);
    expect(res.operations).toHaveLength(1);
    expect(res.operations[0].op).toBe('add');
  });

  it('accepts update and remove against exact current draft titles', () => {
    const res = validateTopicPlanOpsPayload(
      {
        syllabusCoverageOverview: OV,
        operations: [
          { op: 'update', target: 'Arrays & Linked Lists', topic: topic('Arrays, Lists & Memory') },
          { op: 'remove', target: 'Stacks and Queues' },
        ],
      },
      { draftTitles: drafts, syllabusSourceNames: ['syllabus.txt'] }
    );
    expect(res.valid).toBe(true);
    expect(res.operations.map((o) => o.op)).toEqual(['update', 'remove']);
  });

  it('rejects a target that matches no current draft (e.g. a locked topic or a hallucination)', () => {
    const res = validateTopicPlanOpsPayload(
      { syllabusCoverageOverview: OV, operations: [{ op: 'remove', target: 'Published Topic X' }] },
      { draftTitles: drafts, syllabusSourceNames: ['syllabus.txt'] }
    );
    expect(res.valid).toBe(false);
    expect((res.internalErrors || []).join(' ')).toMatch(/does not match any CURRENT draft title/);
  });

  it('rejects an empty change set — a modify that changes nothing is a failure, not a success', () => {
    const res = validateTopicPlanOpsPayload(
      { syllabusCoverageOverview: OV, operations: [] },
      { draftTitles: drafts, syllabusSourceNames: ['syllabus.txt'] }
    );
    expect(res.valid).toBe(false);
  });

  it('rejects an add whose topic fails the same structural rules as full plans', () => {
    const bad = { ...topic('Bad'), modules: [{ ...mod('m_bad'), milestones: [{ text: 'only-one' }] }] };
    const res = validateTopicPlanOpsPayload(
      { syllabusCoverageOverview: OV, operations: [{ op: 'add', topic: bad }] },
      { draftTitles: drafts, syllabusSourceNames: ['syllabus.txt'] }
    );
    expect(res.valid).toBe(false);
  });

  it('rejects duplicate operations against the same target', () => {
    const res = validateTopicPlanOpsPayload(
      {
        syllabusCoverageOverview: OV,
        operations: [
          { op: 'update', target: 'Arrays & Linked Lists', topic: topic('A1') },
          { op: 'remove', target: 'Arrays & Linked Lists' },
        ],
      },
      { draftTitles: drafts, syllabusSourceNames: ['syllabus.txt'] }
    );
    expect(res.valid).toBe(false);
  });
});
