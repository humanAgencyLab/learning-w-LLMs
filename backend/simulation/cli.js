'use strict';

/**
 * Simulation CLI. Usage:
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

async function main() {
  const args = parseArgs(process.argv);
  if (!args.accessCode) {
    console.error('Missing --accessCode=<code>. Example:');
    console.error('  node simulation/cli.js --accessCode=ABC123 --distribution=avg:2,fail:2,excellent:2');
    process.exit(2);
  }

  const manifest = await run({
    accessCode: args.accessCode,
    distribution: args.distribution || 'avg:8,fail:6,excellent:6',
    backgrounds: args.backgrounds || 'all',
    totalCap: Number(args.totalCap || 20),
    seed: Number(args.seed || 42),
    weeksPerTopic: Number(args.weeksPerTopic || 1),
  });

  if (args.label) {
    const labelled = path.join(MANIFEST_DIR, `manifest-${args.label}.json`);
    fs.writeFileSync(labelled, JSON.stringify(manifest, null, 2));
    log.info(`manifest labelled → ${labelled}`);
  }

  if (args.backdate) {
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

module.exports = { main, parseArgs };
