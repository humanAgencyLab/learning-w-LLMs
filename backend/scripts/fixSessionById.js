/**
 * Fix a specific session by ID - tries multiple methods
 * Usage: node scripts/fixSessionById.js <sessionId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function fixSessionById(sessionId) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms');
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔍 Searching for session: ${sessionId}\n`);

    // Try multiple methods to find the session
    let session = null;

    // Method 1: Direct findById
    try {
      session = await Session.findById(sessionId);
      if (session) console.log('✅ Found by findById');
    } catch (e) {
      console.log('❌ findById failed:', e.message);
    }

    // Method 2: Try with ObjectId
    if (!session) {
      try {
        session = await Session.findById(new mongoose.Types.ObjectId(sessionId));
        if (session) console.log('✅ Found by findById with ObjectId');
      } catch (e) {
        console.log('❌ findById with ObjectId failed:', e.message);
      }
    }

    // Method 3: Try findOne
    if (!session) {
      try {
        session = await Session.findOne({ _id: sessionId });
        if (session) console.log('✅ Found by findOne');
      } catch (e) {
        console.log('❌ findOne failed:', e.message);
      }
    }

    // Method 4: Try updateOne directly
    if (!session) {
      console.log('⚠️  Session not found by query methods. Trying direct update...');
      const result = await Session.updateOne(
        { _id: new mongoose.Types.ObjectId(sessionId) },
        { $set: { mode: 'studying' } }
      );
      console.log('Update result:', result);
      if (result.matchedCount > 0) {
        console.log('✅ Updated session directly!');
        session = await Session.findById(sessionId);
      }
    }

    if (session) {
      console.log('\n📋 Session Details:');
      console.log(`  ID: ${session._id}`);
      console.log(`  Mode: ${session.mode}`);
      console.log(`  Topic: ${session.topic || 'N/A'}`);
      console.log(`  ChatTitle: ${session.chatTitle || 'N/A'}`);
      console.log(`  Phase: ${session.phase}`);
      console.log(`  UserId: ${session.userId || 'null'}`);

      if (session.mode === 'reviewing') {
        session.mode = 'studying';
        await session.save();
        console.log('\n✅ Fixed! Changed mode from reviewing to studying');
      } else {
        console.log(`\nℹ️  Mode is already: ${session.mode}`);
      }
    } else {
      console.log('\n❌ Session not found in database.');
      console.log('💡 This might be a caching issue. Please:');
      console.log('   1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)');
      console.log('   2. Clear browser cache and localStorage');
      console.log('   3. Log out and log back in');
    }

    // Also check for any other reviewing sessions
    console.log('\n🔍 Checking for any other sessions in reviewing mode...');
    const allReviewing = await Session.find({ mode: 'reviewing' });
    console.log(`Found ${allReviewing.length} sessions in reviewing mode`);
    for (const s of allReviewing) {
      console.log(`  Fixing: ${s._id} - ${s.chatTitle || s.topic}`);
      s.mode = 'studying';
      await s.save();
      console.log('    ✅ Fixed!');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: node scripts/fixSessionById.js <sessionId>');
  process.exit(1);
}

fixSessionById(sessionId);


