#!/usr/bin/env node

/**
 * Script to delete ALL users from the database
 * This completely removes all user accounts, credentials, and profile data
 * WARNING: This is irreversible!
 * Run with: node scripts/clearAllUsers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');

async function clearAllUsers() {
  try {
    // Connect to MongoDB - use same database as server.js
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    // Find all users
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    if (users.length === 0) {
      console.log('No users found. Nothing to delete.');
      await mongoose.connection.close();
      return;
    }

    // Show warning
    console.log('\n⚠️  WARNING: This will delete ALL users and their data!');
    console.log('Users to be deleted:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.email} (${user.name})`);
    });

    // Count sessions associated with these users
    const userIds = users.map(u => u._id);
    const sessionCount = await Session.countDocuments({ userId: { $in: userIds } });
    console.log(`\nAlso found ${sessionCount} sessions associated with these users.`);

    let deletedCount = 0;
    let errorCount = 0;

    // Delete all sessions first (including orphaned sessions without users)
    const allSessionsDeleted = await Session.deleteMany({});
    console.log(`✅ Deleted ${allSessionsDeleted.deletedCount} sessions`);

    // Delete all users
    for (const user of users) {
      try {
        // Delete the user
        await User.findByIdAndDelete(user._id);
        deletedCount++;
        console.log(`✅ Deleted user: ${user.email}`);
      } catch (error) {
        console.error(`❌ Error deleting user ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Complete deletion summary:`);
    console.log(`- Users deleted: ${deletedCount}`);
    console.log(`- Sessions deleted: ${allSessionsDeleted.deletedCount}`);
    console.log(`- Errors: ${errorCount}`);
    console.log(`- Total users: ${users.length}`);

  } catch (error) {
    console.error('❌ Failed to delete users:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  clearAllUsers()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      console.log('You can now create fresh accounts from scratch.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = clearAllUsers;

