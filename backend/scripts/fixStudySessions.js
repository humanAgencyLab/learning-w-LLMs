/**
 * Script to fix study sessions that were incorrectly switched to 'reviewing' mode
 * This fixes sessions that should be in 'studying' mode but were switched due to the revision button bug
 * 
 * Usage: node scripts/fixStudySessions.js [userId]
 * If userId is not provided, it will fix all affected sessions
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function fixStudySessions(userId = null) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // First, let's check all sessions in 'reviewing' mode to see what we have
    let query = { mode: 'reviewing' };
    
    if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId);
      console.log(`🔍 Finding sessions for user: ${userId}`);
    } else {
      console.log('🔍 Finding all sessions in reviewing mode...');
    }

    const allReviewingSessions = await Session.find(query);
    console.log(`📊 Found ${allReviewingSessions.length} session(s) in reviewing mode`);

    // Display all reviewing sessions for debugging
    if (allReviewingSessions.length > 0) {
      console.log('\n📋 All sessions in reviewing mode:');
      allReviewingSessions.forEach((session, index) => {
        console.log(`${index + 1}. Session ID: ${session._id}`);
        console.log(`   Topic: ${session.topic}`);
        console.log(`   Chat Title: ${session.chatTitle || 'N/A'}`);
        console.log(`   Phase: ${session.phase}`);
        console.log(`   Has Plan: ${session.plan && session.plan.length > 0 ? 'Yes' : 'No'}`);
        console.log(`   Modules: ${session.plan?.length || 0}`);
        console.log(`   Created: ${session.createdAt}`);
        console.log('');
      });
    }

    // Find sessions that should be in 'studying' mode
    // Criteria: mode='reviewing' and has a plan (indicating it was a study session)
    query = {
      mode: 'reviewing',
      'plan.0': { $exists: true } // Has at least one module in plan
    };

    if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId);
    }

    const affectedSessions = await Session.find(query);
    console.log(`\n📊 Found ${affectedSessions.length} affected session(s) that need fixing`);

    if (affectedSessions.length === 0) {
      console.log('✅ No sessions need fixing');
      await mongoose.disconnect();
      return;
    }

    // Display affected sessions
    console.log('\n📋 Affected Sessions:');
    affectedSessions.forEach((session, index) => {
      console.log(`${index + 1}. Session ID: ${session._id}`);
      console.log(`   Topic: ${session.topic}`);
      console.log(`   Chat Title: ${session.chatTitle || 'N/A'}`);
      console.log(`   User ID: ${session.userId}`);
      console.log(`   Modules: ${session.plan?.length || 0}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log('');
    });

    // Fix the sessions
    console.log('🔧 Fixing sessions...');
    let fixedCount = 0;

    for (const session of affectedSessions) {
      try {
        session.mode = 'studying';
        await session.save();
        fixedCount++;
        console.log(`✅ Fixed session: ${session._id} - ${session.topic || session.chatTitle || 'Untitled'}`);
      } catch (error) {
        console.error(`❌ Failed to fix session ${session._id}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully fixed ${fixedCount} out of ${affectedSessions.length} session(s)`);
    console.log('🎉 Done! Your study sessions should now appear in the study section.');

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get userId from command line arguments
const userId = process.argv[2] || null;

// Run the script
fixStudySessions(userId);

