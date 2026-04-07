const {
  validateTopicPlanPayload,
  validateSingleTopicPayload,
  normalizeTopicTitleKey,
} = require('../agents/validators/topicPlanValidator');

const minimalModule = (id = 'mod_a') => ({
  moduleId: id,
  title: 'M',
  description: '',
  difficulty: 'core',
  points: 10,
  milestones: [{ text: 'a' }, { text: 'b' }],
});

const OV =
  'Overview maps syllabus areas to topics with enough length for validation minimum chars ok.';

describe('validateTopicPlanPayload (modify flow)', () => {
  it('passes with valid modified plan and coverage overview', () => {
    const raw = {
      syllabusCoverageOverview: `${OV} Covers DataStructures.pdf fully.`,
      topics: [
        {
          title: 'Arrays & Linked Lists',
          objective: 'Learn linear structures',
          syllabusAnchors: ['Chapter 1: Arrays in DataStructures.pdf'],
          modules: [minimalModule('m1')],
        },
        {
          title: 'Trees & Graphs',
          objective: 'Learn non-linear structures',
          syllabusAnchors: ['Chapter 3: Trees'],
          modules: [minimalModule('m2')],
        },
      ],
    };
    const v = validateTopicPlanPayload(raw, {
      syllabusSourceNames: ['DataStructures.pdf'],
    });
    expect(v.valid).toBe(true);
    expect(v.topics).toHaveLength(2);
  });

  it('rejects if syllabus coverage overview is missing', () => {
    const raw = {
      topics: [
        {
          title: 'Topic',
          syllabusAnchors: ['Unit 1'],
          modules: [minimalModule('m1')],
        },
      ],
    };
    const v = validateTopicPlanPayload(raw);
    expect(v.valid).toBe(false);
  });

  it('deduplicates when modification agent produces duplicates', () => {
    const raw = {
      syllabusCoverageOverview: OV,
      topics: [
        {
          title: 'Topic Alpha',
          syllabusAnchors: ['Unit A'],
          modules: [minimalModule('m1')],
        },
        {
          title: 'topic alpha',
          syllabusAnchors: ['Unit A again'],
          modules: [minimalModule('m2')],
        },
      ],
    };
    const v = validateTopicPlanPayload(raw);
    expect(v.valid).toBe(true);
    expect(v.topics).toHaveLength(1);
    expect(v.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateSingleTopicPayload (topic-level AI modify)', () => {
  it('passes with valid single topic', () => {
    const data = {
      title: 'Sorting Algorithms',
      objective: 'Learn sorting',
      syllabusAnchors: ['Chapter 4: Sorting'],
      modules: [
        minimalModule('m1'),
        {
          moduleId: 'm2',
          title: 'Quick Sort',
          points: 15,
          milestones: [{ text: 'Partition' }, { text: 'Recurse' }],
        },
      ],
    };
    const v = validateSingleTopicPayload(data);
    expect(v.valid).toBe(true);
    expect(v.topic.title).toBe('Sorting Algorithms');
    expect(v.topic.modules).toHaveLength(2);
  });

  it('fails if title is missing', () => {
    const data = {
      objective: 'no title',
      syllabusAnchors: ['Unit'],
      modules: [minimalModule('m1')],
    };
    const v = validateSingleTopicPayload(data);
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('fails if modules are empty', () => {
    const data = {
      title: 'Empty',
      syllabusAnchors: ['Unit 1'],
      modules: [],
    };
    const v = validateSingleTopicPayload(data);
    expect(v.valid).toBe(false);
  });

  it('fails if syllabusAnchors are missing', () => {
    const data = {
      title: 'No anchors',
      syllabusAnchors: [],
      modules: [minimalModule('m1')],
    };
    const v = validateSingleTopicPayload(data);
    expect(v.valid).toBe(false);
  });

  it('fails if milestones < 2', () => {
    const data = {
      title: 'One milestone',
      syllabusAnchors: ['Unit thing'],
      modules: [
        {
          moduleId: 'm1',
          title: 'Mod',
          points: 10,
          milestones: [{ text: 'only one' }],
        },
      ],
    };
    const v = validateSingleTopicPayload(data);
    expect(v.valid).toBe(false);
  });
});
