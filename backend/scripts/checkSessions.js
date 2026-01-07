/**
 * Script to check all sessions and their modes
 * Helps identify which sessions need to be fixed
 * 
 * Usage: node scripts/checkSessions.js [userId]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');

async function checkSessions(userId = null) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-LLMs');
    console.log('✅ Connected to MongoDB\n');

    const query = {};
    if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId);
      console.log(`🔍 Checking sessions for user: ${userId}\n`);
    } else {
      console.log('🔍 Checking all sessions...\n');
    }

    // Get all sessions with plans (regardless of phase)
    query['plan.0'] = { $exists: true }; // Has a plan

    const sessions = await Session.find(query).sort({ createdAt: -1 });
    
    console.log(`📊 Found ${sessions.length} session(s) with plans:\n`);

    if (sessions.length === 0) {
      console.log('No completed sessions found.');
      await mongoose.disconnect();
      return;
    }

    const studySessions = [];
    const revisionSessions = [];

    sessions.forEach((session, index) => {
      const info = {
        id: session._id,
        topic: session.topic,
        chatTitle: session.chatTitle || 'N/A',
        mode: session.mode,
        phase: session.phase,
        modules: session.plan?.length || 0,
        createdAt: session.createdAt
      };

      if (session.mode === 'studying') {
        studySessions.push(info);
      } else {
        revisionSessions.push(info);
      }

      console.log(`${index + 1}. ${info.chatTitle || info.topic}`);
      console.log(`   Mode: ${info.mode} ${info.mode !== 'studying' ? '⚠️  (Should be studying!)' : '✅'}`);
      console.log(`   Phase: ${info.phase}`);
      console.log(`   Modules: ${info.modules}`);
      console.log(`   ID: ${info.id}`);
      console.log('');
    });

    console.log('\n📈 Summary:');
    console.log(`   Study sessions (correct): ${studySessions.length}`);
    console.log(`   Revision sessions (need fixing): ${revisionSessions.length}`);

    if (revisionSessions.length > 0) {
      console.log('\n⚠️  Sessions that need to be fixed:');
      revisionSessions.forEach((session, index) => {
        console.log(`   ${index + 1}. ${session.chatTitle || session.topic} (ID: ${session.id})`);
      });
      console.log('\n💡 To fix these sessions, run:');
      console.log('   node scripts/fixStudySessions.js');
      if (userId) {
        console.log(`   Or for your user: node scripts/fixStudySessions.js ${userId}`);
      }
    } else {
      console.log('\n✅ All sessions are in the correct mode!');
      console.log('💡 If sessions still appear in the wrong section, try:');
      console.log('   1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)');
      console.log('   2. Clear browser cache');
      console.log('   3. Log out and log back in');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const userId = process.argv[2] || null;
checkSessions(userId);

