'use strict';

/**
 * Deterministic, hand-curated pool of first + last names used to give every
 * synthetic student a real-feeling human name. Two design goals drive the
 * shape of this module:
 *
 *   1. **Reproducibility for the paper.** The same `(seed, count)` pair must
 *      always return the same roster. We use the same LCG pattern already
 *      present in `runner.js` (seededRng) so behavior is identical to the
 *      position-shuffle and there's no extra dependency.
 *
 *   2. **Reviewable cultural representation.** The pool is small enough
 *      (~40 × 40) to be eyeballed in a PR diff, and intentionally diverse
 *      across European, South Asian, East Asian, African, Hispanic/Latinx,
 *      Middle Eastern, and Southeast Asian origins. The methodology doc
 *      (research/simulation-methodology.md) describes the curation rubric.
 *
 * The signup route validates usernames against ^[a-zA-Z0-9_]{3,30}$ so we
 * normalise to lowercase-alphanumeric and suffix a zero-padded index to
 * keep collisions out and names short.
 */

const FIRST_NAMES = [
  // European
  'Emma', 'Liam', 'Olivia', 'Noah', 'Sophia', 'Ethan',
  // South Asian
  'Priya', 'Arjun', 'Ananya', 'Rohan', 'Meera', 'Aarav',
  // East Asian
  'Wei', 'Mei', 'Hiroshi', 'Yuki', 'Jin', 'Haruto',
  // African / African diaspora
  'Amara', 'Kwame', 'Zuri', 'Kofi', 'Nia', 'Ade',
  // Hispanic / Latinx
  'Sofia', 'Mateo', 'Isabela', 'Diego', 'Camila', 'Luis',
  // Middle Eastern / North African
  'Layla', 'Omar', 'Yasmin', 'Kareem', 'Nadia', 'Tariq',
  // Southeast Asian
  'Linh', 'Rizki', 'Mai', 'Budi',
];

const LAST_NAMES = [
  // European
  'Anderson', 'Johnson', 'Miller', 'Brown', 'Davis', 'Wilson',
  // South Asian
  'Sharma', 'Patel', 'Gupta', 'Singh', 'Das', 'Kumar',
  // East Asian
  'Chen', 'Wang', 'Tanaka', 'Kim', 'Yamamoto', 'Zhao',
  // African / African diaspora
  'Okafor', 'Mensah', 'Diallo', 'Adeyemi', 'Mwangi', 'Nkosi',
  // Hispanic / Latinx
  'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Silva',
  // Middle Eastern / North African
  'Hassan', 'Khan', 'Rahimi', 'Najjar', 'Farouk', 'Bouazizi',
  // Southeast Asian
  'Nguyen', 'Pham', 'Santos', 'Wijaya',
];

// Same LCG pattern as runner.js `seededRng`. Deterministic given a seed.
function seededRng(seed) {
  let s = (seed || 1) >>> 0;
  if (s === 0) s = 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function toUsernameToken(s) {
  // Strip accents + non-ascii, lowercase, remove anything not a-z0-9_.
  // Names in this pool are ASCII already but this guard keeps us safe if
  // the pool ever gains a "Mũller" or "Núñez".
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Pick `count` unique (first, last) pairs from the pool.
 *
 * Returns array of { firstName, lastName, displayName, username }.
 * Usernames are `firstlast` + a zero-padded 2-digit index so two students
 * with the same name generated in a single run don't collide. The index
 * also makes the username visibly non-random (`priyasharma01`), which helps
 * the professor recognize a student as "one of the sim accounts" at a
 * glance if they ever see it.
 */
function pickNames(seed, count) {
  if (!Number.isFinite(count) || count < 1) return [];
  const rng = seededRng(seed);

  // Produce a shuffled list of (firstName, lastName) pairs. With 40 × 40 =
  // 1600 combinations, a roster of 20 is fine without worrying about
  // running out. We still guard against unique collisions because two
  // different (first, last) pairs could in principle collapse to the same
  // displayName if the pool ever gains duplicates.
  const firsts = FIRST_NAMES.slice();
  const lasts = LAST_NAMES.slice();
  // Fisher-Yates with seeded rng (matches runner.js style)
  for (let i = firsts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [firsts[i], firsts[j]] = [firsts[j], firsts[i]];
  }
  for (let i = lasts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lasts[i], lasts[j]] = [lasts[j], lasts[i]];
  }

  const seenDisplay = new Set();
  const out = [];
  // Advance both indices together but at coprime strides so the pair
  // (fIdx, lIdx) walks a varied path through the Cartesian product rather
  // than holding the last name constant for the first 40 picks.
  let fIdx = 0;
  let lIdx = 0;
  let guard = 0;

  while (out.length < count && guard < FIRST_NAMES.length * LAST_NAMES.length) {
    const firstName = firsts[fIdx % firsts.length];
    const lastName = lasts[lIdx % lasts.length];
    const displayName = `${firstName} ${lastName}`;

    if (!seenDisplay.has(displayName)) {
      seenDisplay.add(displayName);
      const idx = out.length;
      const usernameBase = `${toUsernameToken(firstName)}${toUsernameToken(lastName)}`;
      // 2-digit pad covers up to 99 students per run, well beyond our 20-cap.
      const username = `${usernameBase}${String(idx).padStart(2, '0')}`;
      out.push({ firstName, lastName, displayName, username });
    }

    fIdx += 1;
    lIdx += 3; // coprime with 40/38 → varied last-name pairing every step
    guard += 1;
  }

  return out;
}

module.exports = {
  FIRST_NAMES,
  LAST_NAMES,
  pickNames,
  // Exposed for tests / the methodology doc to cite pool size.
  poolSize: () => FIRST_NAMES.length * LAST_NAMES.length,
};
