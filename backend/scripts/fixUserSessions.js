/**
 * Find and fix sessions in reviewing mode for a specific user
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function fixUserSessions(userId) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-LLMs');
    console.log('✅ Connected to MongoDB\n');

    // Find all sessions in reviewing mode for this user
    const reviewingSessions = await Session.find({
      userId: new mongoose.Types.ObjectId(userId),
      mode: 'reviewing'
    });

    console.log(`📊 Found ${reviewingSessions.length} session(s) in reviewing mode:\n`);

    if (reviewingSessions.length === 0) {
      console.log('No sessions in reviewing mode found.');
      await mongoose.disconnect();
      return;
    }

    // Display sessions
    reviewingSessions.forEach((session, index) => {
      console.log(`${index + 1}. Session ID: ${session._id}`);
      console.log(`   Topic: ${session.topic || 'N/A'}`);
      console.log(`   Chat Title: ${session.chatTitle || 'N/A'}`);
      console.log(`   Mode: ${session.mode}`);
      console.log(`   Phase: ${session.phase}`);
      console.log(`   Has Plan: ${session.plan && session.plan.length > 0 ? `Yes (${session.plan.length} modules)` : 'No'}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log('');
    });

    // Fix the sessions
    console.log('🔧 Fixing sessions...\n');
    let fixedCount = 0;

    for (const session of reviewingSessions) {
      try {
        session.mode = 'studying';
        await session.save();
        fixedCount++;
        console.log(`✅ Fixed session: ${session._id}`);
        console.log(`   Topic: ${session.topic || session.chatTitle || 'Untitled'}`);
        console.log(`   Changed mode from 'reviewing' to 'studying'\n`);
      } catch (error) {
        console.error(`❌ Failed to fix session ${session._id}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully fixed ${fixedCount} out of ${reviewingSessions.length} session(s)`);
    console.log('🎉 Done! Your study sessions should now appear in the study section.');
    console.log('💡 Please refresh your browser to see the changes.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/fixUserSessions.js <userId>');
  process.exit(1);
}

fixUserSessions(userId);


