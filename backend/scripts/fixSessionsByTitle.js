/**
 * Fix sessions by matching titles - for when we can't find them by userId
 * Usage: node scripts/fixSessionsByTitle.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function fixSessionsByTitle() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-LLMs');
    console.log('✅ Connected to MongoDB\n');

    // Search for sessions matching the titles
    const swiftSessions = await Session.find({
      $or: [
        { topic: /swift.*basics/i },
        { chatTitle: /swift.*basics/i }
      ]
    });

    const pythonSessions = await Session.find({
      $or: [
        { topic: /python.*basics.*plan/i },
        { chatTitle: /python.*basics.*plan/i },
        { chatTitle: /python.*basics/i, topic: /python/i }
      ]
    });

    const allSessions = [...swiftSessions, ...pythonSessions];
    console.log(`📊 Found ${allSessions.length} matching sessions:\n`);

    let fixedCount = 0;
    for (const session of allSessions) {
      const date = new Date(session.createdAt).toISOString().split('T')[0];
      console.log(`Session: ${session._id}`);
      console.log(`  Date: ${date}`);
      console.log(`  Topic: ${session.topic || 'N/A'}`);
      console.log(`  ChatTitle: ${session.chatTitle || 'N/A'}`);
      console.log(`  Current Mode: ${session.mode}`);
      console.log(`  UserId: ${session.userId || 'null'}`);

      if (session.mode === 'reviewing') {
        session.mode = 'studying';
        await session.save();
        fixedCount++;
        console.log(`  ✅ Fixed! Changed mode from 'reviewing' to 'studying'\n`);
      } else {
        console.log(`  ℹ️  Already in 'studying' mode\n`);
      }
    }

    console.log(`\n✅ Summary: Fixed ${fixedCount} out of ${allSessions.length} session(s)`);
    console.log('💡 Please refresh your browser to see the changes.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixSessionsByTitle();


