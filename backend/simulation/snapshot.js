'use strict';

/**
 * Thin wrapper around mongodump. Produces a labelled dump under
 * simulation/snapshots/<label>/ so a researcher can restore state
 * between professor sessions without re-running a 20-student simulation.
 *
 * Usage:
 *   node simulation/snapshot.js --label=week4-baseline
 *   node simulation/snapshot.js --restore --label=week4-baseline
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { MONGO_URI, MANIFEST_DIR } = require('./config');
const { make } = require('./logger');

const log = make('snapshot');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function ensureUri() {
  if (!MONGO_URI) throw new Error('MONGODB_URI not set.');
  return MONGO_URI;
}

function runTool(cmd, args) {
  log.info(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} exited with status ${r.status}`);
}

function snapshot(label) {
  ensureUri();
  if (!label) throw new Error('--label=<name> required');
  const outDir = path.join(MANIFEST_DIR, label);
  fs.mkdirSync(outDir, { recursive: true });
  runTool('mongodump', [`--uri=${MONGO_URI}`, `--out=${outDir}`]);
  log.info(`snapshot written → ${outDir}`);
}

function restore(label, drop = true) {
  ensureUri();
  if (!label) throw new Error('--label=<name> required');
  const inDir = path.join(MANIFEST_DIR, label);
  if (!fs.existsSync(inDir)) throw new Error(`snapshot not found: ${inDir}`);
  const args = [`--uri=${MONGO_URI}`];
  if (drop) args.push('--drop');
  args.push(inDir);
  runTool('mongorestore', args);
  log.info(`snapshot restored from ${inDir}`);
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  try {
    if (args.restore) {
      restore(args.label, !args.noDrop);
    } else {
      snapshot(args.label);
    }
  } catch (e) {
    log.error(e.message);
    process.exit(1);
  }
}

module.exports = { snapshot, restore };
