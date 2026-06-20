'use strict';

/**
 * Simulation CLI.
 *
 * Most of the time you want a recipe:
 *   node simulation/cli.js --recipe=local-small-full --accessCode=ABC123
 *   node simulation/cli.js --recipe=study-mid-semester --accessCode=ABC123
 *
 * CLI flags override the recipe's defaults, so you can still tweak one
 * knob without forking a recipe:
 *   node simulation/cli.js --recipe=study-full-semester --accessCode=ABC123 --totalCap=10
 *
 * Without --recipe, the old flag-driven mode still works:
 *   node simulation/cli.js --accessCode=ABC123 \
 *        --distribution=avg:8,fail:6,excellent:6 \
 *        --backgrounds=all --totalCap=20 --seed=42 --weeksPerTopic=1 \
 *        [--backdate] [--label=week4]
 */

const path = require('path');
const fs = require('fs');
const { run } = require('./runner');
const { main: runBackdate } = require('./backdate');
const { MANIFEST_DIR } = require('./config');
const { make } = require('./logger');
const { getRecipe, listRecipes } = require('./recipes');

const log = make('cli');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const [, k, v] = m;
    out[k] = v === undefined ? true : v;
  }
  return out;
}

function printHelp() {
  console.log('Synthetic-student simulation runner.\n');
  console.log('Usage:');
  console.log('  node simulation/cli.js --recipe=<name> --accessCode=<code> [--label=<tag>]');
  console.log('  node simulation/cli.js --accessCode=<code> --distribution=avg:8,fail:6,excellent:6 [more flags...]\n');
  console.log('Recipes:');
  for (const r of listRecipes()) {
    const tags = [
      `cap=${r.totalCap}`,
      `dist=${r.distribution}`,
      `backdate=${r.backdateWeeks}w`,
      r.hasProgressCap ? 'progress-cap' : 'all-topics',
    ].join(', ');
    console.log(`  ${r.name.padEnd(24)} ${r.description}`);
    console.log(`  ${' '.repeat(24)} (${tags})`);
  }
  console.log('\nFlags:');
  console.log('  --accessCode      course access code (required)');
  console.log('  --recipe          one of the recipe names above');
  console.log('  --distribution    avg:N,fail:N,excellent:N (overrides recipe)');
  console.log('  --backgrounds     "all" or csv of background IDs (overrides recipe)');
  console.log('  --totalCap        cap roster size (overrides recipe)');
  console.log('  --seed            PRNG seed (overrides recipe)');
  console.log('  --weeksPerTopic   simulated weeks per topic (overrides recipe)');
  console.log('  --backdate        run backdate.js inline after the HTTP run');
  console.log('  --label           write a labelled copy of the manifest');
  console.log('  --help            print this help and exit');
}

/**
 * Resolve a recipe + per-invocation flags into the flat options object the
 * runner consumes. Flag precedence: CLI flag > recipe field > runner default.
 */
function resolveOptions(args) {
  const recipe = args.recipe ? getRecipe(args.recipe) : null;
  const pick = (flag, recipeField = flag, fallback) => {
    if (args[flag] !== undefined && args[flag] !== true) return args[flag];
    if (recipe && recipe[recipeField] !== undefined && recipe[recipeField] !== null) return recipe[recipeField];
    return fallback;
  };

  return {
    recipeName: recipe ? recipe.name : null,
    accessCode: args.accessCode,
    distribution: pick('distribution', 'distribution', 'avg:8,fail:6,excellent:6'),
    backgrounds: pick('backgrounds', 'backgrounds', 'all'),
    totalCap: Number(pick('totalCap', 'totalCap', 20)),
    seed: Number(pick('seed', 'seed', 42)),
    weeksPerTopic: Number(pick('weeksPerTopic', 'weeksPerTopic', 1)),
    // Recipe-only fields (no matching flag today; add if we ever want
    // per-run overrides).
    progressCap: recipe ? recipe.progressCap : null,
    backdateWeeks: recipe && recipe.backdateWeeks ? Number(recipe.backdateWeeks) : null,
    // The recipe says "backdate after run" — the CLI flag is still honored
    // as an override so someone can opt out on a smoke test.
    shouldBackdate: args.backdate === true
      || (recipe ? !!recipe.backdate : false),
    label: args.label || (recipe ? recipe.name : null),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.accessCode) {
    printHelp();
    console.error('\nMissing --accessCode=<code>.');
    process.exit(2);
  }

  let opts;
  try {
    opts = resolveOptions(args);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  if (opts.recipeName) {
    log.info(`recipe=${opts.recipeName}, totalCap=${opts.totalCap}, dist=${opts.distribution}, backdate=${opts.shouldBackdate ? `${opts.backdateWeeks || 'default'}w` : 'no'}`);
  }

  const manifest = await run({
    accessCode: opts.accessCode,
    distribution: opts.distribution,
    backgrounds: opts.backgrounds,
    totalCap: opts.totalCap,
    seed: opts.seed,
    weeksPerTopic: opts.weeksPerTopic,
    progressCap: opts.progressCap,
    backdateWeeks: opts.backdateWeeks,
    recipeName: opts.recipeName,
    label: opts.label,
  });

  if (args.label) {
    const labelled = path.join(MANIFEST_DIR, `manifest-${args.label}.json`);
    fs.writeFileSync(labelled, JSON.stringify(manifest, null, 2));
    log.info(`manifest labelled → ${labelled}`);
  }

  if (opts.shouldBackdate) {
    log.info('running backdate...');
    await runBackdate();
  } else {
    log.info('skip backdate. Run `npm run simulate:backdate` after you verify the run.');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, resolveOptions };
