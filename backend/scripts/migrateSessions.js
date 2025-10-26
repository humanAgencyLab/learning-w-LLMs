#!/usr/bin/env node

/**
 * Migration script to add points to legacy sessions and normalize phase
 * Run with: node scripts/migrateSessions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function migrateSessions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms');
    console.log('Connected to MongoDB');

    // Find sessions that need migration
    const sessionsToMigrate = await Session.find({
      $or: [
        { 'plan.points': { $exists: false } },
        { 'plan.0.points': { $exists: false } },
        { phase: 'complete' } // Old phase name
      ]
    });

    console.log(`Found ${sessionsToMigrate.length} sessions to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const session of sessionsToMigrate) {
      try {
        let needsUpdate = false;

        // Fix phase if it's 'complete' instead of 'completed'
        if (session.phase === 'complete') {
          session.phase = 'completed';
          needsUpdate = true;
        }

        // Add points to plan modules if missing
        if (session.plan && session.plan.length > 0) {
          const totalPoints = session.plan.reduce((sum, module) => sum + (module.points || 0), 0);
          
          if (totalPoints === 0) {
            // Distribute 100 points evenly across modules
            const pointsPerModule = Math.floor(100 / session.plan.length);
            const remainder = 100 - (pointsPerModule * session.plan.length);
            
            session.plan.forEach((module, index) => {
              module.points = pointsPerModule + (index < remainder ? 1 : 0);
            });
            needsUpdate = true;
          } else if (totalPoints !== 100) {
            // Normalize points to sum to 100
            const scaleFactor = 100 / totalPoints;
            session.plan.forEach(module => {
              if (module.points) {
                module.points = Math.round(module.points * scaleFactor);
              }
            });
            needsUpdate = true;
          }
        }

        // Ensure profile.source is set
        if (!session.profile || !session.profile.source) {
          session.profile = {
            source: 'dummy',
            name: 'Anonymous Learner',
            background: 'General background',
            goals: ['Learn new concepts'],
            strengths: ['Basic knowledge'],
            gaps: ['Advanced topics'],
            timePerDayMins: 30,
            preferredStyle: 'examples-first',
            lastUpdated: new Date().toISOString()
          };
          needsUpdate = true;
        }

        if (needsUpdate) {
          await session.save();
          migratedCount++;
          console.log(`Migrated session ${session._id}`);
        }
      } catch (error) {
        console.error(`Error migrating session ${session._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`- Sessions migrated: ${migratedCount}`);
    console.log(`- Errors: ${errorCount}`);
    console.log(`- Total processed: ${sessionsToMigrate.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateSessions();
}

module.exports = migrateSessions;
