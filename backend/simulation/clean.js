'use strict';

/**
 * Removes every synthetic user (profile.isSynthetic: true) and their
 * dependent records. Direct DB — mirrors backdate.js invariant that the
 * HTTP-only rule only applies to *student-facing* simulation actions;
 * cleanup is a researcher op.
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');
const { make } = require('./logger');

const log = make('clean');

// Each entry lists the foreign-key field(s) on that collection that point
// back to the synthetic user. Most use `userId`; `Enrollment` uses
// `studentId`; `InstructorStudentNote` uses both (author or subject).
// When multiple fields apply, we delete if ANY matches.
const COLLECTIONS = [
  { name: 'Session', userFields: ['userId'] },
  { name: 'MilestoneAttempt', userFields: ['userId'] },
  { name: 'QuizAttempt', userFields: ['userId'] },
  { name: 'Enrollment', userFields: ['studentId'] },
  { name: 'ChatLog', userFields: ['userId'] },
  { name: 'DataLog', userFields: ['userId'] },
  { name: 'FlashcardInteraction', userFields: ['userId'] },
  { name: 'StudySession', userFields: ['userId'] },
  { name: 'InstructorStudentNote', userFields: ['studentId', 'instructorId'] },
];

async function main({ dryRun = false } = {}) {
  if (!MONGO_URI) throw new Error('MONGODB_URI not set.');
  await mongoose.connect(MONGO_URI);
  try {
    const User = require('../models/User');
    const synthUsers = await User.find({ 'profile.isSynthetic': true }, { _id: 1 }).lean();
    const userIds = synthUsers.map((u) => u._id);
    log.info(`found ${userIds.length} synthetic users`);

    const stats = {};
    for (const { name, userFields } of COLLECTIONS) {
      let M = null;
      try { M = require(`../models/${name}`); } catch { continue; }
      if (!M) continue;
      // Build an $or filter so collections whose FK isn't `userId`
      // (e.g. Enrollment.studentId) still match.
      const filter = userFields.length === 1
        ? { [userFields[0]]: { $in: userIds } }
        : { $or: userFields.map((f) => ({ [f]: { $in: userIds } })) };
      if (dryRun) {
        const count = await M.countDocuments(filter);
        stats[name] = { wouldDelete: count };
      } else {
        const r = await M.deleteMany(filter);
        stats[name] = { deleted: r.deletedCount || 0 };
      }
    }

    if (!dryRun) {
      const r = await User.deleteMany({ _id: { $in: userIds } });
      stats.User = { deleted: r.deletedCount || 0 };
    } else {
      stats.User = { wouldDelete: userIds.length };
    }
    log.info(`cleanup ${dryRun ? '(dry-run)' : ''} → ${JSON.stringify(stats)}`);
    return stats;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  main({ dryRun })
    .then(() => process.exit(0))
    .catch((e) => { log.error(e.stack || e.message); process.exit(1); });
}

module.exports = { main };
