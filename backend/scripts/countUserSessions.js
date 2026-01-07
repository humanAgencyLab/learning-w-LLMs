/**
 * Count sessions for a specific user
 * Usage: node scripts/countUserSessions.js <email>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/Session');
const User = require('../models/User');

async function countUserSessions(email) {
  try {
    // Use the same database as server.js
    const dbName = process.env.MONGODB_URI 
      ? new URL(process.env.MONGODB_URI).pathname.substring(1)
      : 'ai_edu_app';
    
    const mongoUri = process.env.MONGODB_URI || `mongodb://localhost:27017/${dbName}`;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database:', mongoose.connection.db.databaseName);

    const totalSessions = await Session.countDocuments({});
    console.log(`\n📊 Total sessions in database: ${totalSessions}`);
    
    const totalUsers = await User.countDocuments({});
    console.log(`👥 Total users in database: ${totalUsers}`);

    const user = await User.findOne({ email: email });
    if (!user) {
      console.log(`\n❌ User not found: ${email}`);
      await mongoose.disconnect();
      return;
    }

    console.log(`\n✅ Found user: ${user.name}`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Email: ${user.email}`);

    const sessions = await Session.find({ userId: user._id }).sort({ createdAt: -1 });
    console.log(`\n📊 Total sessions for this user: ${sessions.length}\n`);

    if (sessions.length > 0) {
      console.log('Session details:');
      sessions.forEach((s, i) => {
        const date = s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : 'N/A';
        console.log(`${i+1}. ${date} - ${s.chatTitle || s.topic || 'Untitled'}`);
        console.log(`   ID: ${s._id}`);
        console.log(`   Mode: ${s.mode} ${s.mode === 'reviewing' ? '⚠️' : '✅'}`);
        console.log(`   Phase: ${s.phase}`);
        console.log(`   Modules: ${s.plan?.length || 0}`);
        console.log('');
      });

      const reviewing = sessions.filter(s => s.mode === 'reviewing');
      if (reviewing.length > 0) {
        console.log(`\n⚠️  Found ${reviewing.length} session(s) in reviewing mode:`);
        for (const s of reviewing) {
          console.log(`  Fixing: ${s._id} - ${s.chatTitle || s.topic}`);
          s.mode = 'studying';
          await s.save();
          console.log(`  ✅ Fixed!`);
        }
      } else {
        console.log('✅ All sessions are in studying mode');
      }
    } else {
      console.log('No sessions found for this user');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/countUserSessions.js <email>');
  console.error('Example: node scripts/countUserSessions.js jonayedhossain1995@gmail.com');
  process.exit(1);
}

countUserSessions(email);


