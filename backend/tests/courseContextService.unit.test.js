const {
  syllabusSourceNamesForGuardrail,
  effectiveSourceRole,
  resolveTopicPlanTargetCount,
  inferOnePerUnitRequested,
  inferSegmentCountFromText
} = require('../services/courseContextService');

describe('courseContextService syllabus guardrail helpers', () => {
  it('single file always yields one name for coverage', () => {
    expect(syllabusSourceNamesForGuardrail([{ originalName: 'Only.pdf', role: 'reference' }])).toEqual([
      'Only.pdf'
    ]);
  });

  it('multiple files with no syllabus returns null', () => {
    const sources = [
      { originalName: 'a.pdf', role: 'reference' },
      { originalName: 'b.pdf', role: 'reference' }
    ];
    expect(syllabusSourceNamesForGuardrail(sources)).toBeNull();
  });

  it('multiple files with one syllabus returns that name', () => {
    const sources = [
      { originalName: 'syll.pdf', role: 'syllabus' },
      { originalName: 'ref.pdf', role: 'reference' }
    ];
    expect(syllabusSourceNamesForGuardrail(sources)).toEqual(['syll.pdf']);
  });

  it('effectiveSourceRole treats legacy single doc as syllabus', () => {
    expect(effectiveSourceRole({}, 1)).toBe('syllabus');
  });

  it('effectiveSourceRole treats legacy multi as reference', () => {
    expect(effectiveSourceRole({}, 3)).toBe('reference');
  });
});

describe('resolveTopicPlanTargetCount', () => {
  const ctx = 'Unit 1 intro\nUnit 6 wrap-up';
  const hints = ['Unit 3: Methods'];

  it('raises target to max detected unit index vs course default', () => {
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 4,
      instructorMessage: 'Generate topics',
      contextText: ctx,
      outlineHints: hints
    });
    expect(r.target).toBe(6);
    expect(r.inferredSegments).toBe(6);
    // Default hierarchy inference should not force strict draft count during modify flows.
    expect(r.strictDraftCount).toBe(false);
  });

  it('honors explicit topic count in instructor message', () => {
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 4,
      instructorMessage: 'Please create 8 topics',
      contextText: ctx,
      outlineHints: []
    });
    expect(r.target).toBe(8);
    expect(r.strictDraftCount).toBe(true);
  });

  it('per-unit phrasing with detected segments sets strictDraftCount', () => {
    const msg = 'Treat every single Unit as a single topic.';
    expect(inferOnePerUnitRequested(msg)).toBe(true);
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 4,
      instructorMessage: msg,
      contextText: ctx,
      outlineHints: hints
    });
    expect(r.perUnitRequested).toBe(true);
    expect(r.target).toBe(6);
    expect(r.strictDraftCount).toBe(true);
  });

  it('body topicCount overrides inference', () => {
    const r = resolveTopicPlanTargetCount({
      bodyTopicCount: 5,
      planStrategyTopicCount: 4,
      instructorMessage: 'anything',
      contextText: ctx,
      outlineHints: hints
    });
    expect(r.target).toBe(5);
    expect(r.strictDraftCount).toBe(true);
  });

  it('topicCountMax caps inferred target', () => {
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 4,
      planStrategyTopicCountMax: 4,
      instructorMessage: 'generate',
      contextText: ctx,
      outlineHints: hints
    });
    expect(r.target).toBe(4);
    expect(r.cappedByMax).toBe(true);
  });

  it('topicCountMax does not cap below computed target when max is high', () => {
    const r = resolveTopicPlanTargetCount({
      planStrategyTopicCount: 2,
      planStrategyTopicCountMax: 20,
      instructorMessage: 'generate',
      contextText: ctx,
      outlineHints: hints
    });
    expect(r.target).toBe(6);
    expect(r.cappedByMax).toBe(false);
  });

  it('inferSegmentCountFromText returns 0 when no numbering', () => {
    expect(inferSegmentCountFromText('Overview with no units', [])).toBe(0);
  });
});

describe('topic count: an explicit request must survive ordinary phrasing', () => {
  const { resolveTopicPlanTargetCount } = require('../services/courseContextService');
  // A syllabus with no week/unit/module markers, so nothing but the parsed
  // count can produce a target — the inference fallback lands on ~4, which is
  // what an instructor saw when they asked for 10.
  const PLAIN = 'Course description. Introduction. Basics. Advanced applications.';
  const target = (instructorMessage) => resolveTopicPlanTargetCount({
    bodyTopicCount: null,
    planStrategyTopicCount: null,
    planStrategyTopicCountMax: null,
    instructorMessage,
    contextText: PLAIN,
    outlineHints: [],
  }).target;

  // Every one of these MISSED before: the old patterns required the number to
  // sit immediately after one of five verbs, so the count was dropped and the
  // generator fell back to its default of 4.
  it.each([
    'Generate 10 topics',
    'Create 10 topics',
    'Make 10 topics',
    'Give me 10 topics',
    'I want 10 topics',
    'please make 10 topics',
    'Generate a topic plan with 10 topics',
    'Generate the initial topic plan from the syllabus. Please make it 10 topics.',
    'Break the course into 10 topics',
    'Split into 10 topics',
    '10 topics please',
    'Can you create 10 topics for this course?',
    'topic count should be 10',
  ])('honours the count in: %s', (msg) => {
    expect(target(msg)).toBe(10);
  });

  it('reads the LATEST count when the instructor corrects themselves', () => {
    expect(target('You created 10 topics but I wanted 6 topics')).toBe(6);
    expect(target('There are 10 topics already; consolidate to 5 topics')).toBe(5);
  });

  it('does not mistake a question about existing output for a request', () => {
    // "why did you make 10 topics" describes what exists; it must not become
    // the new target. "please make 10 topics" must still work — the
    // interrogative disqualifies, not the verb.
    expect(target('Why did you make 10 topics?')).not.toBe(10);
    expect(target('please make 10 topics')).toBe(10);
  });

  it('stays within the plan maximum', () => {
    const { MAX_PLAN_TOPICS } = require('../services/courseContextService');
    if (MAX_PLAN_TOPICS) expect(target('Generate 99 topics')).toBeLessThanOrEqual(MAX_PLAN_TOPICS);
  });
});
