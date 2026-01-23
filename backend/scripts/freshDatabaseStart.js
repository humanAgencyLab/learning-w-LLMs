const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * COMPREHENSIVE DATABASE CLEANUP SCRIPT
 * 
 * This script will:
 * 1. Drop ALL email-related indexes
 * 2. Remove email field from ALL users
 * 3. Verify cleanup
 * 4. Optionally drop and recreate the entire database (if --fresh flag is used)
 * 
 * Usage:
 *   node scripts/freshDatabaseStart.js          # Cleanup only
 *   node scripts/freshDatabaseStart.js --fresh   # Drop entire database and start fresh
 */
async function freshDatabaseStart() {
  const args = process.argv.slice(2);
  const freshStart = args.includes('--fresh');
  
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    console.log('\n📋 STEP 1: Database State Check');
    console.log('='.repeat(50));
    const totalUsers = await collection.countDocuments({});
    const usersWithEmail = await collection.countDocuments({ email: { $exists: true } });
    const usersWithNullEmail = await collection.countDocuments({ email: null });
    
    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with email field: ${usersWithEmail}`);
    console.log(`Users with email: null: ${usersWithNullEmail}`);
    
    // List all indexes
    const indexes = await collection.indexes();
    console.log('\nCurrent indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? '(UNIQUE)' : ''} ${idx.sparse ? '(SPARSE)' : ''}`);
    });

    if (freshStart) {
      console.log('\n⚠️  FRESH START MODE: This will DROP the entire database!');
      console.log('='.repeat(50));
      console.log('Dropping database:', db.databaseName);
      await db.dropDatabase();
      console.log('✅ Database dropped');
      console.log('\n✅ Fresh database ready. You can now start the server to create indexes.');
      await mongoose.connection.close();
      return;
    }

    console.log('\n📋 STEP 2: Dropping Email Indexes');
    console.log('='.repeat(50));
    
    // Try to drop all possible email index names
    const emailIndexNames = ['email_1', 'email', 'emailVerificationToken_1'];
    for (const indexName of emailIndexNames) {
      try {
        await collection.dropIndex(indexName);
        console.log(`✅ Dropped index: ${indexName}`);
      } catch (error) {
        if (error.code === 27 || error.message.includes('index not found')) {
          console.log(`ℹ️  Index ${indexName} does not exist (skipping)`);
        } else {
          console.log(`⚠️  Warning dropping ${indexName}:`, error.message);
        }
      }
    }

    console.log('\n📋 STEP 3: Removing Email Field from All Users');
    console.log('='.repeat(50));
    
    // Remove email and emailVerified fields - handle both exists and null cases
    const result1 = await collection.updateMany(
      { email: { $exists: true } },
      { $unset: { email: '', emailVerified: '' } },
      { multi: true }
    );
    console.log(`✅ Removed email field (exists) from ${result1.modifiedCount} users`);
    
    // Also handle users with email: null explicitly
    const result2 = await collection.updateMany(
      { email: null },
      { $unset: { email: '', emailVerified: '' } },
      { multi: true }
    );
    console.log(`✅ Removed email field (null) from ${result2.modifiedCount} users`);
    
    // Final cleanup - remove from ALL documents regardless of value
    const result3 = await collection.updateMany(
      {},
      { $unset: { email: '', emailVerified: '' } },
      { multi: true }
    );
    console.log(`✅ Final cleanup: processed ${result3.modifiedCount} users`);

    console.log('\n📋 STEP 4: Verification');
    console.log('='.repeat(50));
    
    const usersWithEmailAfter = await collection.countDocuments({ email: { $exists: true } });
    const finalIndexes = await collection.indexes();
    
    console.log(`Users with email field remaining: ${usersWithEmailAfter}`);
    console.log('\nFinal indexes:');
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    if (usersWithEmailAfter === 0) {
      console.log('\n✅ SUCCESS: All email fields removed!');
    } else {
      console.log(`\n⚠️  WARNING: ${usersWithEmailAfter} users still have email field`);
    }

    // Check for any email indexes
    const emailIndexes = finalIndexes.filter(idx => 
      idx.name.includes('email') || 
      (idx.key && Object.keys(idx.key).includes('email'))
    );
    
    if (emailIndexes.length === 0) {
      console.log('✅ SUCCESS: No email indexes found!');
    } else {
      console.log(`\n⚠️  WARNING: Found ${emailIndexes.length} email-related indexes:`);
      emailIndexes.forEach(idx => console.log(`  - ${idx.name}`));
    }

    console.log('\n✅ Cleanup complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Restart your backend server');
    console.log('  2. Try signing up again');
    console.log('  3. If issues persist, run: node scripts/freshDatabaseStart.js --fresh');

  } catch (error) {
    console.error('❌ Failed to cleanup database:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  freshDatabaseStart()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = freshDatabaseStart;
