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
