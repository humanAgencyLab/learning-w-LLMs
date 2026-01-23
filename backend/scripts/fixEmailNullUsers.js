const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Script to fix users with email: null by removing the email field entirely
 * This prevents conflicts with the sparse unique index
 */
async function fixEmailNullUsers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    // Find all users with email: null or email: undefined
    const usersWithNullEmail = await User.find({
      $or: [
        { email: null },
        { email: { $exists: false } },
        { email: '' }
      ]
    });
    
    console.log(`Found ${usersWithNullEmail.length} users with null/empty email`);

    if (usersWithNullEmail.length === 0) {
      console.log('No users with null email found. Nothing to fix.');
      await mongoose.connection.close();
      return;
    }

    let fixedCount = 0;
    let errorCount = 0;

    // Update each user to remove the email field
    for (const user of usersWithNullEmail) {
      try {
        // Use $unset to remove the email field from the document
        await User.updateOne(
          { _id: user._id },
          { $unset: { email: '' } }
        );
        fixedCount++;
        console.log(`✅ Fixed user: ${user.username || user.name} (removed email field)`);
      } catch (error) {
        console.error(`❌ Error fixing user ${user.username || user.name}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Email cleanup complete:`);
    console.log(`- Users fixed: ${fixedCount}`);
    console.log(`- Errors: ${errorCount}`);
    console.log(`- Total users with null email: ${usersWithNullEmail.length}`);

    // Drop and recreate the email index to ensure it's properly sparse
    console.log('\n🔄 Recreating email index...');
    try {
      await User.collection.dropIndex('email_1');
      console.log('✅ Dropped existing email index');
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Email index does not exist (this is fine)');
      } else {
        console.log('⚠️  Warning dropping index:', error.message);
      }
    }

    // Create sparse unique index
    await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true });
    console.log('✅ Created sparse unique email index');

  } catch (error) {
    console.error('❌ Failed to fix users:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  fixEmailNullUsers()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = fixEmailNullUsers;
