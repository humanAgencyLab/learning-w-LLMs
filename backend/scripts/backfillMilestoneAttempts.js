#!/usr/bin/env node

/**
 * Phase A backfill: derive MilestoneAttempt rows from historical
 * Session.plan[].completedMilestones so the instructor Insights dashboard
 * has non-empty data the moment it ships.
 *
 * Since completedMilestones is a set of indexes (no pass/fail/timestamp info),
 * each historical completion becomes a single synthetic-but-passed attempt
 * timestamped at session.updatedAt. Skipped if a matching attempt already
 * exists — safe to re-run.
 *
 * Usage: node scripts/backfillMilestoneAttempts.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');
const User = require('../models/User');
const MilestoneAttempt = require('../models/MilestoneAttempt');

async function run({ dryRun = false } = {}) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB:', mongoUri);

  try {
    const cursor = Session.find({
      courseId: { $ne: null },
      'plan.completedMilestones': { $exists: true, $ne: [] },
    })
      .select('userId courseId courseTopicId _id plan activeModuleId updatedAt')
      .lean()
      .cursor();

    // User-synthetic lookup cache to avoid a per-session query.
    const userIds = new Set();
    const syntheticCache = new Map();

    let sessionsScanned = 0;
    let candidates = 0;
    let inserted = 0;
    let skipped = 0;

    const bulkBuffer = [];
    const FLUSH_SIZE = 500;

    async function primeUser(uid) {
      const key = uid.toString();
      if (syntheticCache.has(key)) return syntheticCache.get(key);
      const u = await User.findById(uid).select('profile.isSynthetic').lean();
      const v = !!(u && u.profile && u.profile.isSynthetic);
      syntheticCache.set(key, v);
      return v;
    }

    async function flush() {
      if (!bulkBuffer.length) return;
      if (dryRun) {
        skipped += bulkBuffer.length;
        bulkBuffer.length = 0;
        return;
      }
      const batch = bulkBuffer.splice(0, bulkBuffer.length);
      try {
        const res = await MilestoneAttempt.insertMany(batch, { ordered: false });
        inserted += res.length;
      } catch (err) {
        // ordered:false + bulk may throw BulkWriteError; count inserts from writeErrors
        const writeErrors = err?.writeErrors?.length || 0;
        inserted += batch.length - writeErrors;
        skipped += writeErrors;
      }
    }

    for await (const s of cursor) {
      sessionsScanned++;
      if (!s.userId || !s.courseId || !Array.isArray(s.plan)) continue;
      userIds.add(s.userId.toString());
      const isSynthetic = await primeUser(s.userId);

      for (const mod of s.plan) {
        const cm = Array.isArray(mod.completedMilestones) ? mod.completedMilestones : [];
        if (!cm.length) continue;
        for (const idx of cm) {
          if (typeof idx !== 'number' || idx < 0) continue;
          candidates++;

          // Skip if a matching attempt already exists (allow re-runs).
          const exists = await MilestoneAttempt.exists({
            sessionId: s._id,
            moduleId: mod.id || null,
            milestoneIndex: idx,
          });
          if (exists) {
            skipped++;
            continue;
          }

          const mText = mod.milestones?.[idx]?.text || '';
          bulkBuffer.push({
            userId: s.userId,
            courseId: s.courseId,
            courseTopicId: s.courseTopicId || null,
            sessionId: s._id,
            moduleId: mod.id || null,
            milestoneIndex: idx,
            milestoneText: mText,
            passed: true,
            autoAdvanced: false,
            attemptNumber: 1,
            isSynthetic,
            createdAt: s.updatedAt || new Date(),
            updatedAt: s.updatedAt || new Date(),
          });
          if (bulkBuffer.length >= FLUSH_SIZE) await flush();
        }
      }
    }
    await flush();

    console.log(
      `Done. sessionsScanned=${sessionsScanned} candidates=${candidates} inserted=${inserted} skipped=${skipped} users=${userIds.size}${dryRun ? ' (dry-run)' : ''}`
    );
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}

module.exports = { run };
