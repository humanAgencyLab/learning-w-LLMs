'use strict';

/**
 * Bookkeeping DB touch that stamps `profile.isSynthetic = true` and
 * `profile.personaTag = <bg__pos>` on a simulated user. Must run RIGHT
 * AFTER signup, before the student produces any MilestoneAttempt rows,
 * because MilestoneAttempt caches isSynthetic at write time (see
 * backend/services/milestoneAttemptService.js). Tagging after the fact
 * would leave every attempt row cached as isSynthetic=false and break
 * the analytics filter.
 *
 * The public profile route deliberately does not accept these fields —
 * a real student must not be able to mark themselves synthetic — so the
 * simulator uses a direct DB write gated on the researcher having
 * MONGODB_URI set.
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');
const { make } = require('./logger');

const log = make('tag-synth');

let connected = false;

async function ensureConnection() {
  if (!MONGO_URI) throw new Error('MONGODB_URI not set.');
  if (mongoose.connection.readyState === 1) { connected = true; return; }
  await mongoose.connect(MONGO_URI);
  connected = true;
}

async function disconnect() {
  if (connected) {
    await mongoose.disconnect();
    connected = false;
  }
}

async function tagOne({ userId, backgroundId, positionId }) {
  if (!userId) return false;
  await ensureConnection();
  const User = require('../models/User');
  const r = await User.updateOne(
    { _id: userId },
    {
      $set: {
        'profile.isSynthetic': true,
        'profile.personaTag': `${backgroundId}__${positionId}`,
      },
    },
    { timestamps: false },
  );
  if (r.modifiedCount) log.debug(`tagged user ${String(userId).slice(-6)}`);
  return !!r.modifiedCount;
}

module.exports = { tagOne, disconnect, ensureConnection };
