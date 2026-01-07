/**
 * List all sessions for a user to see their current state
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function listAllSessions(userId) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-LLMs');
    console.log('✅ Connected to MongoDB\n');

    const sessions = await Session.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(`📊 Found ${sessions.length} session(s) for user ${userId}:\n`);

    if (sessions.length === 0) {
      console.log('No sessions found.');
      await mongoose.disconnect();
      return;
    }

    sessions.forEach((session, index) => {
      console.log(`${index + 1}. ${session.chatTitle || session.topic || 'Untitled'}`);
      console.log(`   ID: ${session._id}`);
      console.log(`   Mode: ${session.mode}`);
      console.log(`   Phase: ${session.phase}`);
      console.log(`   Has Plan: ${session.plan && session.plan.length > 0 ? `Yes (${session.plan.length} modules)` : 'No'}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log('');
    });

    const studyCount = sessions.filter(s => s.mode === 'studying').length;
    const revisionCount = sessions.filter(s => s.mode === 'reviewing').length;
    const completedCount = sessions.filter(s => s.phase === 'completed').length;

    console.log('\n📈 Summary:');
    console.log(`   Total sessions: ${sessions.length}`);
    console.log(`   Study mode: ${studyCount}`);
    console.log(`   Revision mode: ${revisionCount}`);
    console.log(`   Completed phase: ${completedCount}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/listAllSessions.js <userId>');
  process.exit(1);
}

listAllSessions(userId);


