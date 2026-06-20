'use strict';

/**
 * Post-run timestamp rewriter. Direct MongoDB touch — the only place in
 * the simulator that bypasses the public HTTP API. The runner records a
 * per-student, per-week manifest of {realStartMs, realEndMs, simulatedWeek};
 * this script walks each synthetic student's records and rewrites their
 * createdAt/updatedAt to a backdated wall-clock timestamp inside the
 * matching simulated week.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { MONGO_URI, MANIFEST_PATH } = require('./config');
const { remapInsideWeek, defaultSemesterStart } = require('./timeline');
const { make } = require('./logger');

const log = make('backdate');

const MODELS = [
  { name: 'User', file: '../models/User' },
  { name: 'Enrollment', file: '../models/Enrollment' },
  { name: 'Session', file: '../models/Session' },
  { name: 'MilestoneAttempt', file: '../models/MilestoneAttempt' },
  { name: 'QuizAttempt', file: '../models/QuizAttempt' },
  { name: 'ChatLog', file: '../models/ChatLog' },
  { name: 'DataLog', file: '../models/DataLog' },
];

function pickBlock(studentBlocks, ts) {
  for (const b of studentBlocks) {
    if (ts >= b.realStartMs && ts <= b.realEndMs) return b;
  }
  // Fallback: nearest by midpoint
  let best = studentBlocks[0];
  let bestDist = Infinity;
  for (const b of studentBlocks) {
    const mid = (b.realStartMs + b.realEndMs) / 2;
    const d = Math.abs(mid - ts);
    if (d < bestDist) { best = b; bestDist = d; }
  }
  return best;
}

async function backdateUser(models, { userId, blocks }, semesterStart, stats, courseId) {
  const userIdStr = String(userId);
  for (const { name } of MODELS) {
    const M = models[name];
    if (!M) continue;
    // Course-scoped mode (SIM_BACKDATE_COURSE_ID): only remap records that
    // belong to the target course, and never touch the shared User doc. This
    // makes it safe to backdate a "reused accounts" run without rewriting the
    // students' records from a *different* course they're also enrolled in.
    if (courseId && name === 'User') continue;
    const userField = name === 'User' ? '_id' : 'userId';
    const filter = { [userField]: userId };
    if (courseId && name !== 'User') filter.courseId = courseId;
    const docs = await M.find(filter).lean();
    if (!docs.length) continue;
    const ops = [];
    for (const d of docs) {
      const createdMs = new Date(d.createdAt || d.updatedAt || Date.now()).getTime();
      const updatedMs = new Date(d.updatedAt || d.createdAt || Date.now()).getTime();
      const blockForCreated = pickBlock(blocks, createdMs);
      const blockForUpdated = pickBlock(blocks, updatedMs);
      const newCreated = remapInsideWeek(createdMs, blockForCreated, semesterStart);
      let newUpdated = remapInsideWeek(updatedMs, blockForUpdated, semesterStart);
      if (newUpdated < newCreated) newUpdated = newCreated;
      ops.push({
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { createdAt: newCreated, updatedAt: newUpdated } },
        },
      });
    }
    if (ops.length) {
      // Use the NATIVE driver (M.collection), not Mongoose (M.bulkWrite). Models
      // with `timestamps: true` mark `createdAt` immutable, so a Mongoose update
      // silently strips the createdAt $set — leaving every record stamped at its
      // real run time. The native driver bypasses that, so both createdAt and
      // updatedAt land in the backdated week.
      const r = await M.collection.bulkWrite(ops, { ordered: false });
      stats[name] = (stats[name] || 0) + (r.modifiedCount || ops.length);
      log.info(`${name}: rewrote ${ops.length} docs for user ${userIdStr.slice(-6)}`);
    }
  }
}

async function main({ manifestPath = MANIFEST_PATH } = {}) {
  if (!MONGO_URI) throw new Error('MONGODB_URI not set — backdate cannot connect.');
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest not found: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const semesterStart = manifest.semesterStart
    ? new Date(manifest.semesterStart)
    : defaultSemesterStart();

  log.info(`connecting to mongo...`);
  await mongoose.connect(MONGO_URI);

  const models = Object.fromEntries(
    MODELS.map(({ name, file }) => {
      try { return [name, require(file)]; }
      catch (e) { log.warn(`model ${name} not loadable: ${e.message}`); return [name, null]; }
    }),
  );

  const courseIdRaw = process.env.SIM_BACKDATE_COURSE_ID;
  const courseId = courseIdRaw ? new mongoose.Types.ObjectId(courseIdRaw) : null;
  if (courseId) {
    log.info(`course-scoped backdate: only remapping records with courseId=${courseIdRaw} (User docs skipped)`);
  }

  const stats = {};
  try {
    for (const student of manifest.students) {
      if (!student.userId) continue;
      await backdateUser(models, student, semesterStart, stats, courseId);
    }
  } finally {
    await mongoose.disconnect();
  }

  log.info(`backdate complete. counts: ${JSON.stringify(stats)}`);
  return stats;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { log.error(e.stack || e.message); process.exit(1); });
}

module.exports = { main };
