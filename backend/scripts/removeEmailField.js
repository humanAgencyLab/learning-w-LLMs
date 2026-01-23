const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Script to completely remove email field from database
 * - Drops email index
 * - Removes email field from all users
 * - Safe to run multiple times
 */
async function removeEmailField() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    // Step 1: Drop email index if it exists
    console.log('\n📋 Step 1: Dropping email index...');
    try {
      await User.collection.dropIndex('email_1');
      console.log('✅ Dropped email_1 index');
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Email index does not exist (already removed)');
      } else {
        console.log('⚠️  Warning dropping index:', error.message);
      }
    }

    // Step 2: Remove email field from all users
    console.log('\n📋 Step 2: Removing email field from all users...');
    const result = await User.updateMany(
      {},
      { $unset: { email: '', emailVerified: '' } },
      { multi: true }
    );
    console.log(`✅ Removed email field from ${result.modifiedCount} users`);

    // Step 3: Verify no users have email field
    console.log('\n📋 Step 3: Verifying cleanup...');
    const usersWithEmail = await User.countDocuments({ email: { $exists: true } });
    if (usersWithEmail === 0) {
      console.log('✅ No users have email field - cleanup successful!');
    } else {
      console.log(`⚠️  Warning: ${usersWithEmail} users still have email field`);
    }

    console.log('\n✅ Email field removal complete!');
    console.log(`- Users updated: ${result.modifiedCount}`);
    console.log(`- Users with email remaining: ${usersWithEmail}`);

  } catch (error) {
    console.error('❌ Failed to remove email field:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  removeEmailField()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = removeEmailField;
