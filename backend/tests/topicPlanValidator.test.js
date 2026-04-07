const {
  validateTopicPlanPayload,
  normalizeTopicTitleKey,
  dedupeTopicsByTitle,
  validateSourceCoverage
} = require('../agents/validators/topicPlanValidator');

const minimalModule = (id = 'mod_a') => ({
  moduleId: id,
  title: 'M',
  description: '',
  difficulty: 'core',
  points: 10,
  milestones: [{ text: 'a' }, { text: 'b' }]
});

const OV = 'Overview maps syllabus areas to topics with enough length for validation minimum chars ok.';

describe('topicPlanValidator', () => {
  it('normalizeTopicTitleKey collapses case and whitespace', () => {
    expect(normalizeTopicTitleKey('  Foo   Bar  ')).toBe('foo bar');
  });

  it('dedupeTopicsByTitle keeps first occurrence', () => {
    const topics = [
      { title: 'Intro', modules: [minimalModule('m1')] },
      { title: 'INTRO', modules: [minimalModule('m2')] },
      { title: 'Other', modules: [minimalModule('m3')] }
    ];
    const { topics: out, duplicateTitlesRemoved } = dedupeTopicsByTitle(topics);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('Intro');
    expect(out[1].title).toBe('Other');
    expect(duplicateTitlesRemoved).toBe(1);
  });

  it('validateTopicPlanPayload strips duplicate titles and adds warning', () => {
    const raw = {
      syllabusCoverageOverview: OV,
      topics: [
        { title: 'A', objective: '', syllabusAnchors: ['Unit A learning goals'], modules: [minimalModule('x1')] },
        { title: 'a ', objective: '', syllabusAnchors: ['Unit A duplicate'], modules: [minimalModule('x2')] },
        { title: 'B', objective: '', syllabusAnchors: ['Unit B section'], modules: [minimalModule('x3')] }
      ]
    };
    const v = validateTopicPlanPayload(raw);
    expect(v.valid).toBe(true);
    expect(v.topics).toHaveLength(2);
    expect(v.warnings).toBeDefined();
    expect(v.warnings[0]).toMatch(/duplicate/i);
  });

  it('validateTopicPlanPayload fails when nothing remains after dedupe (e.g. whitespace titles)', () => {
    const raw = {
      syllabusCoverageOverview: OV,
      topics: [
        { title: '   ', syllabusAnchors: ['anchor text here'], modules: [minimalModule('a')] },
        { title: ' ', syllabusAnchors: ['other anchor here'], modules: [minimalModule('b')] }
      ]
    };
    const v = validateTopicPlanPayload(raw);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /duplicate|removed|empty/i.test(e))).toBe(true);
  });

  it('validateSourceCoverage requires each source filename to appear in overview or anchors', () => {
    const topics = [
      { title: 'One', objective: '', syllabusAnchors: ['Uses LectureNotes.pdf week 1'] }
    ];
    expect(validateSourceCoverage(['LectureNotes.pdf'], 'intro', topics).ok).toBe(true);
    expect(validateSourceCoverage(['OtherDoc.docx'], 'intro', topics).ok).toBe(false);
  });

  it('validateTopicPlanPayload returns SYLLABUS_COVERAGE_SOURCES when a file is not referenced', () => {
    const raw = {
      syllabusCoverageOverview: OV,
      topics: [
        {
          title: 'Only one',
          syllabusAnchors: ['Some generic anchor without filename'],
          modules: [minimalModule('m1')]
        }
      ]
    };
    const v = validateTopicPlanPayload(raw, { syllabusSourceNames: ['Syllabus_AI_101.pdf'] });
    expect(v.valid).toBe(false);
    expect(v.code).toBe('SYLLABUS_COVERAGE_SOURCES');
  });

  it('validateTopicPlanPayload passes source guardrail when stem appears in overview', () => {
    const raw = {
      syllabusCoverageOverview: `${OV} Covers materials from Syllabus_AI_101.pdf and all units.`,
      topics: [
        {
          title: 'Intro',
          syllabusAnchors: ['Week 1 objectives'],
          modules: [minimalModule('m1')]
        }
      ]
    };
    const v = validateTopicPlanPayload(raw, { syllabusSourceNames: ['Syllabus_AI_101.pdf'] });
    expect(v.valid).toBe(true);
    expect(v.syllabusCoverageOverview).toContain('Syllabus_AI_101');
  });
});
