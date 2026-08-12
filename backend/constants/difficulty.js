'use strict';

/**
 * The module difficulty tiers, defined ONCE.
 *
 * They used to be written out separately in six places, and they had drifted:
 * Session.js and assessmentValidation.js accepted 'challenge' while the topic
 * plan schema, the topic-plan validator, normalizeModules, the CourseTopic
 * model and the session seeder accepted only three tiers. A model that emitted
 * "challenge" — which the difficulty rubric makes more likely, since a
 * challenge module is exactly the "synthesis and non-obvious transfer" case the
 * rubric describes — had it silently rewritten to "core" on the way in.
 *
 * Nothing surfaced it. The instructor saw a Core badge on a module the model
 * had judged hardest, and performanceService's per-tier analytics carried a
 * `challenge` bucket that could never receive a row.
 *
 * Two rules follow from that, and both are enforced by
 * tests/difficultyTiers.unit.test.js:
 *   1. Every layer imports this list. A tier added here reaches all of them.
 *   2. A value that is NOT in this list is never silently coerced. Callers use
 *      coerceDifficulty(), which reports what it did so the caller can warn.
 */

/** Ordered easiest → hardest. Order is meaningful: the UI sorts by it. */
const DIFFICULTY_TIERS = Object.freeze(['intro', 'core', 'apply', 'challenge']);

const DEFAULT_DIFFICULTY = 'core';

/** Human-facing rubric, kept next to the list so the two cannot drift apart. */
const DIFFICULTY_RUBRIC = Object.freeze({
  intro: 'orientation/definitions a student meets the concept with',
  core: 'the standard working competence of this course',
  apply: 'synthesis, non-obvious transfer, or multi-concept problem solving',
  challenge: 'genuinely hard for a strong student at this level: open-ended, multi-step, or requiring judgement under ambiguity',
});

const isDifficulty = (v) => typeof v === 'string' && DIFFICULTY_TIERS.includes(v);

/**
 * Normalise a difficulty, reporting what happened rather than swallowing it.
 *
 * @returns {{value: string, coerced: boolean, original: *}} `coerced` is true
 *   ONLY when a non-empty unrecognised value was replaced — an absent value
 *   taking the default is not a downgrade and must not be reported as one.
 */
function coerceDifficulty(value, fallback = DEFAULT_DIFFICULTY) {
  if (isDifficulty(value)) return { value, coerced: false, original: value };
  if (value == null || value === '') return { value: fallback, coerced: false, original: value };
  return { value: fallback, coerced: true, original: value };
}

module.exports = {
  DIFFICULTY_TIERS,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_RUBRIC,
  isDifficulty,
  coerceDifficulty,
};
