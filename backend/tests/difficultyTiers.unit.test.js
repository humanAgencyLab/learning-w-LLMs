/**
 * The 'challenge' tier reached the session and validation layers but was
 * rewritten to 'core' by the topic-plan schema, the topic-plan validator,
 * normalizeModules and the session seeder. Four layers, three of which coerced
 * silently, so an instructor saw a Core badge on the module the model had
 * judged hardest and performanceService carried a `challenge` analytics bucket
 * that could never receive a row.
 *
 * These tests pin the two properties that stop it recurring: every layer reads
 * ONE list, and an unrecognised value is never silently swallowed.
 */
const fs = require('fs');
const path = require('path');
const {
  DIFFICULTY_TIERS, DEFAULT_DIFFICULTY, DIFFICULTY_RUBRIC, isDifficulty, coerceDifficulty,
} = require('../constants/difficulty');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the tier list is single-sourced', () => {
  it('contains all four tiers, hardest last', () => {
    expect(DIFFICULTY_TIERS).toEqual(['intro', 'core', 'apply', 'challenge']);
    expect(DEFAULT_DIFFICULTY).toBe('core');
  });

  it('is frozen, so no consumer can mutate the shared list', () => {
    expect(Object.isFrozen(DIFFICULTY_TIERS)).toBe(true);
  });

  it('every tier has a rubric line — the rubric is what makes the model emit it', () => {
    for (const t of DIFFICULTY_TIERS) {
      expect(typeof DIFFICULTY_RUBRIC[t]).toBe('string');
      expect(DIFFICULTY_RUBRIC[t].length).toBeGreaterThan(20);
    }
  });

  it.each([
    ['models/Session.js'],
    ['models/CourseTopic.js'],
    ['validation/assessmentValidation.js'],
    ['agents/validators/topicPlanValidator.js'],
    ['routes/instructorRoutes.js'],
    ['services/sessionSeedingService.js'],
  ])('%s imports the shared list instead of writing its own', (file) => {
    const src = read(file);
    expect(src).toMatch(/require\(.*constants\/difficulty.*\)/);
    // Strip comments first: the explanatory notes quote the old expression
    // verbatim, and a doc comment is not a second source of truth.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\['intro',\s*'core',\s*'apply'\]/);
    expect(code).not.toMatch(/'intro',\s*'core',\s*'apply',\s*'challenge'/);
  });

  it('the generator prompt offers challenge, or the model never emits it', () => {
    const src = read('agents/topicPlanGeneratorAgent.js');
    expect(src).toMatch(/intro \| core \| apply \| challenge/);
    expect(src).toMatch(/challenge\s*=/);
  });
});

describe('coercion is reported, never silent', () => {
  it('passes every valid tier through untouched', () => {
    for (const t of DIFFICULTY_TIERS) {
      expect(coerceDifficulty(t)).toEqual({ value: t, coerced: false, original: t });
    }
    expect(isDifficulty('challenge')).toBe(true);
  });

  it('flags an unrecognised value as coerced', () => {
    const r = coerceDifficulty('expert');
    expect(r.value).toBe('core');
    expect(r.coerced).toBe(true);
    expect(r.original).toBe('expert');
  });

  it('does NOT report an absent value as a downgrade', () => {
    // A module that simply omitted difficulty is not a silent downgrade, and
    // warning about it would train the reader to ignore the warnings.
    for (const empty of [undefined, null, '']) {
      expect(coerceDifficulty(empty).coerced).toBe(false);
      expect(coerceDifficulty(empty).value).toBe('core');
    }
  });

  it('the topic-plan validator warns instead of quietly deleting', () => {
    const src = read('agents/validators/topicPlanValidator.js');
    const idx = src.indexOf('unknown difficulty');
    expect(idx).toBeGreaterThan(-1);
    // The warning must be pushed where the caller surfaces it to the instructor.
    expect(src.slice(idx - 400, idx + 400)).toMatch(/warnings\.push/);
  });

  it('normalizeModules and the seeder log rather than swallow', () => {
    expect(read('routes/instructorRoutes.js')).toMatch(/unknown difficulty; coerced/);
    expect(read('services/sessionSeedingService.js')).toMatch(/unknown module difficulty; coerced/);
  });
});

describe('a challenge module survives the whole path', () => {
  const { validateTopicPlanPayload } = require('../agents/validators/topicPlanValidator');
  const CourseTopic = require('../models/CourseTopic');
  const Session = require('../models/Session');

  const planWith = (difficulty) => ({
    syllabusCoverageOverview:
      'Unit 1 Reconstruction is covered by the Reconstruction topic, which addresses the ' +
      'competing historiographies of the period and the evidentiary debates surrounding them.',
    topics: [{
      title: 'Reconstruction and its Discontents',
      objective: 'o',
      orderIndex: 0,
      syllabusAnchors: ['Unit 1: Reconstruction, 1865-1877'],
      modules: [{
        moduleId: 'mod_1',
        title: 'Competing historiographies',
        description: 'd',
        difficulty,
        points: 20,
        milestones: [{ text: 'Compare two accounts' }, { text: 'Weigh the evidence' }],
      }],
    }],
  });

  it('the topic-plan validator keeps challenge', () => {
    const out = validateTopicPlanPayload(planWith('challenge'));
    expect(out.valid).toBe(true);
    const topics = out.topics || out.data?.topics;
    expect(Array.isArray(topics)).toBe(true);
    expect(topics[0].modules[0].difficulty).toBe('challenge');
    // And the unknown-value path is reported rather than silently defaulted.
    const bad = validateTopicPlanPayload(planWith('expert'));
    expect(bad.valid).toBe(true);
    const badMod = (bad.topics || bad.data?.topics)[0].modules[0];
    expect(badMod.difficulty).toBe('core');
    expect((bad.warnings || []).join(' ')).toMatch(/unknown difficulty/i);
  });

  it('CourseTopic accepts challenge', () => {
    const t = new CourseTopic({
      courseId: new (require('mongoose').Types.ObjectId)(),
      title: 'T', orderIndex: 0,
      modules: [{
        moduleId: 'm1', title: 'M', points: 10, difficulty: 'challenge',
        milestones: [{ text: 'a b' }, { text: 'c d' }],
      }],
    });
    expect(t.validateSync()).toBeUndefined();
    expect(t.modules[0].difficulty).toBe('challenge');
  });

  it('the session plan accepts challenge, so seeding does not flatten it', () => {
    const { } = require('../services/sessionSeedingService');
    const s = new Session({
      userId: new (require('mongoose').Types.ObjectId)(),
      phase: 'learning', mode: 'studying', topic: 'T', chatTitle: 'T',
      plan: [{
        id: '1', title: 'M', description: 'd', status: 'in_progress',
        difficulty: 'challenge', points: 10,
        milestones: [{ text: 'a', completed: false }], completedMilestones: [],
      }],
      activeModuleId: '1', points: 0, gems: 0, progressPct: 0, messages: [], quizAttempts: [],
      profile: {
        source: 'dummy', name: 'A', background: 'b', goals: ['g'], strengths: ['s'],
        gaps: ['x'], timePerDayMins: 30, preferredStyle: 'examples-first',
        lastUpdated: new Date().toISOString(),
      },
    });
    const err = s.validateSync();
    expect(err && err.errors && err.errors['plan.0.difficulty']).toBeUndefined();
    expect(s.plan[0].difficulty).toBe('challenge');
  });

  it('performanceService already buckets challenge, which is why this mattered', () => {
    expect(read('services/performanceService.js')).toMatch(/challenge: \{ modules: 0/);
  });
});
