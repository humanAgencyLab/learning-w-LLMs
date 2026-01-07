/**
 * Directly fix sessions by ID - uses multiple methods
 * Usage: node scripts/fixSessionsDirect.js <sessionId1> <sessionId2> ...
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function fixSessionsDirect(sessionIds) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms');
    console.log('✅ Connected to MongoDB\n');

    for (const sessionId of sessionIds) {
      console.log(`🔍 Processing session: ${sessionId}`);
      
      try {
        // Try multiple update methods
        const result1 = await Session.updateOne(
          { _id: sessionId },
          { $set: { mode: 'studying' } }
        );
        
        const result2 = await Session.updateOne(
          { _id: new mongoose.Types.ObjectId(sessionId) },
          { $set: { mode: 'studying' } }
        );

        const totalMatched = result1.matchedCount + result2.matchedCount;
        const totalModified = result1.modifiedCount + result2.modifiedCount;

        if (totalMatched > 0) {
          console.log(`  ✅ Updated session! (matched: ${totalMatched}, modified: ${totalModified})`);
        } else {
          console.log(`  ⚠️  Session not found in database`);
        }
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
      console.log('');
    }

    // Also fix any sessions in reviewing mode
    console.log('🔍 Checking for any sessions in reviewing mode...');
    const reviewing = await Session.find({ mode: 'reviewing' });
    console.log(`Found ${reviewing.length} sessions in reviewing mode`);
    for (const s of reviewing) {
      s.mode = 'studying';
      await s.save();
      console.log(`  ✅ Fixed: ${s._id} - ${s.chatTitle || s.topic}`);
    }

    console.log('\n✅ Done! Please refresh your browser.');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const sessionIds = process.argv.slice(2);
if (sessionIds.length === 0) {
  console.error('Usage: node scripts/fixSessionsDirect.js <sessionId1> <sessionId2> ...');
  console.error('Example: node scripts/fixSessionsDirect.js 6946630bf98d1fe4ad025c79');
  process.exit(1);
}

fixSessionsDirect(sessionIds);


