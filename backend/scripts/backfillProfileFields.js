#!/usr/bin/env node

/**
 * Phase D1 backfill: set persona-aligned defaults on existing User and Enrollment
 * documents so analytics and prompts can read the fields without guarding every access.
 *
 * Idempotent — running twice is a no-op for already-backfilled docs.
 *
 * Usage: node scripts/backfillProfileFields.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

async function backfillUsers() {
  const filter = {
    $or: [
      { 'profile.programmingExposure': { $exists: false } },
      { 'profile.motivationType': { $exists: false } },
      { 'profile.selfConfidence': { $exists: false } },
      { 'profile.isSynthetic': { $exists: false } }
    ]
  };

  const update = {
    $set: {
      'profile.programmingExposure': 'unknown',
      'profile.motivationType': 'unknown',
      'profile.selfConfidence': null,
      'profile.isSynthetic': false
    }
  };

  const result = await User.updateMany(filter, update);
  return { matched: result.matchedCount, modified: result.modifiedCount };
}

async function backfillEnrollments() {
  const filter = {
    $or: [
      { 'priorKnowledge.programmingExposure': { $exists: false } },
      { 'priorKnowledge.motivationType': { $exists: false } },
      { 'priorKnowledge.selfConfidence': { $exists: false } }
    ]
  };

  const update = {
    $set: {
      'priorKnowledge.programmingExposure': 'unknown',
      'priorKnowledge.motivationType': 'unknown',
      'priorKnowledge.selfConfidence': null
    }
  };

  const result = await Enrollment.updateMany(filter, update);
  return { matched: result.matchedCount, modified: result.modifiedCount };
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB:', mongoUri);

  try {
    const userResult = await backfillUsers();
    console.log(`Users: matched=${userResult.matched}, modified=${userResult.modified}`);

    const enrollmentResult = await backfillEnrollments();
    console.log(`Enrollments: matched=${enrollmentResult.matched}, modified=${enrollmentResult.modified}`);

    const totalUsers = await User.countDocuments();
    const usersWithExposure = await User.countDocuments({ 'profile.programmingExposure': { $exists: true } });
    console.log(`Verification: ${usersWithExposure}/${totalUsers} users have programmingExposure set`);

    if (usersWithExposure !== totalUsers) {
      throw new Error('Backfill verification failed: some users still missing programmingExposure');
    }
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}

module.exports = { run, backfillUsers, backfillEnrollments };
