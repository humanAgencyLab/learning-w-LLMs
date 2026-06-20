'use strict';

/**
 * Named, vetted argument-sets for the simulation runner. A recipe is
 * *not* a new runtime — it's a shorthand for a specific CLI flag combo
 * that is known to produce the cohort shape we need for the professor
 * study or for a local smoke test.
 *
 * Two axes matter:
 *
 *   - **Size**: `local-small-*` (6 students, cheap Groq-wise, used while
 *     iterating on the UI) vs `study-*` (20 students, paper-grade, used
 *     to produce the cohort cited in the study).
 *
 *   - **Semester shape**: `*-full` assumes all topics are published and
 *     the course is at end-of-semester — every persona attempts every
 *     topic. `*-mid` assumes roughly half the topics are published so
 *     far (tuned for the 15-unit CPS 1231 syllabus → 7 published) and
 *     we want a realistic mid-semester spread: strugglers stall at
 *     topic 1, average students reach topics 3–5, excellent students
 *     finish all 7. The `progressCap` field drives that stratification
 *     in runner.js.
 *
 * CLI flags can still override any field (recipe sets the default, the
 * flag wins), so `--recipe=study-mid-semester --totalCap=10` is a valid
 * way to shrink a study cohort without forking the recipe.
 */

/**
 * Per-position progress cap for the mid-semester 7-weeks-published
 * cohort (roughly halfway through a 15-week course — the 15-unit
 * CPS 1231 syllabus produces a topic-per-week plan). Each entry is
 * either a fixed integer (cap at topic N) or `{ min, max }` (cap at a
 * uniformly-random integer in [min, max] per student). Topic indices
 * are 1-based to match how instructors talk about them ("they stalled
 * at topic 1").
 */
const MID_SEMESTER_PROGRESS_CAP = {
  aboutToFail: 1,
  average: { min: 3, max: 5 },
  excellent: 7,
};

const RECIPES = {
  'local-small-full': {
    description: 'Smoke test on a fully-published course (15-week, end-of-semester).',
    distribution: 'avg:2,fail:2,excellent:2',
    backgrounds: 'all',
    totalCap: 6,
    seed: 42,
    weeksPerTopic: 1,
    backdate: true,
    backdateWeeks: 15,
    progressCap: null,
  },
  'local-small-mid': {
    description: 'Smoke test on a mid-semester course (7-week, ~half of 15 published).',
    distribution: 'avg:2,fail:2,excellent:2',
    backgrounds: 'all',
    totalCap: 6,
    seed: 43,
    weeksPerTopic: 1,
    backdate: true,
    backdateWeeks: 7,
    progressCap: MID_SEMESTER_PROGRESS_CAP,
  },
  'study-full-semester': {
    description: 'Paper-grade cohort on a fully-published course (15-week, end-of-semester).',
    distribution: 'avg:8,fail:6,excellent:6',
    backgrounds: 'all',
    totalCap: 20,
    seed: 1042,
    weeksPerTopic: 1,
    backdate: true,
    backdateWeeks: 15,
    progressCap: null,
  },
  'study-mid-semester': {
    description: 'Paper-grade cohort on a mid-semester course (7-week, ~half of 15 published).',
    distribution: 'avg:8,fail:6,excellent:6',
    backgrounds: 'all',
    totalCap: 20,
    seed: 1043,
    weeksPerTopic: 1,
    backdate: true,
    backdateWeeks: 7,
    progressCap: MID_SEMESTER_PROGRESS_CAP,
  },
};

function getRecipe(name) {
  if (!name) return null;
  const r = RECIPES[name];
  if (!r) {
    const known = Object.keys(RECIPES).join(', ');
    throw new Error(`Unknown recipe "${name}". Known recipes: ${known}`);
  }
  // Return a shallow copy so callers can mutate without clobbering the
  // source of truth (matters because cli.js layers --flags on top).
  return { name, ...r };
}

function listRecipes() {
  return Object.entries(RECIPES).map(([name, r]) => ({
    name,
    description: r.description,
    totalCap: r.totalCap,
    distribution: r.distribution,
    backdateWeeks: r.backdateWeeks,
    hasProgressCap: !!r.progressCap,
  }));
}

module.exports = {
  RECIPES,
  MID_SEMESTER_PROGRESS_CAP,
  getRecipe,
  listRecipes,
};
