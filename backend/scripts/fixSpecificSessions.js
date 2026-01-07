/**
 * Fix specific sessions by their IDs
 * Usage: node scripts/fixSpecificSessions.js <sessionId1> <sessionId2> ...
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function fixSpecificSessions(sessionIds) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-LLMs');
    console.log('✅ Connected to MongoDB\n');

    let fixedCount = 0;
    let notFoundCount = 0;

    for (const sessionId of sessionIds) {
      try {
        const session = await Session.findById(sessionId);
        
        if (!session) {
          console.log(`❌ Session not found: ${sessionId}`);
          notFoundCount++;
          continue;
        }

        console.log(`📋 Found session: ${sessionId}`);
        console.log(`   Topic: ${session.topic || session.chatTitle || 'N/A'}`);
        console.log(`   Current Mode: ${session.mode}`);
        console.log(`   Phase: ${session.phase}`);

        if (session.mode === 'reviewing') {
          session.mode = 'studying';
          await session.save();
          console.log(`   ✅ Changed mode from 'reviewing' to 'studying'\n`);
          fixedCount++;
        } else {
          console.log(`   ℹ️  Already in 'studying' mode, no change needed\n`);
        }
      } catch (error) {
        console.error(`❌ Error processing session ${sessionId}:`, error.message);
      }
    }

    console.log(`\n✅ Summary:`);
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Not found: ${notFoundCount}`);
    console.log(`\n🎉 Done! Please refresh your browser to see the changes.`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const sessionIds = process.argv.slice(2);
if (sessionIds.length === 0) {
  console.error('Usage: node scripts/fixSpecificSessions.js <sessionId1> <sessionId2> ...');
  console.error('Example: node scripts/fixSpecificSessions.js 507f1f77bcf86cd799439011 507f191e810c19729de860ea');
  process.exit(1);
}

fixSpecificSessions(sessionIds);


