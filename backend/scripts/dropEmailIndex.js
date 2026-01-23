/**
 * Script to drop email index from users collection
 * This is needed after removing the email field from the User schema
 */

const mongoose = require('mongoose');

async function dropEmailIndex() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    const User = require('../models/User');
    const collection = User.collection;

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes on users collection:');
    indexes.forEach((index, idx) => {
      console.log(`  ${idx + 1}. ${index.name}:`, JSON.stringify(index.key));
    });

    // Check if email index exists
    const emailIndex = indexes.find(idx => idx.key && idx.key.email);
    
    if (emailIndex) {
      console.log(`\n🗑️  Dropping email index: ${emailIndex.name}`);
      await collection.dropIndex(emailIndex.name);
      console.log('✅ Email index dropped successfully');
    } else {
      console.log('\n✅ No email index found - already removed');
    }
    
    // Check if certificates.certificateId unique index exists (shouldn't - uniqueness handled at app level)
    const certIndex = indexes.find(idx => 
      idx.key && idx.key['certificates.certificateId'] && idx.unique === true
    );
    
    if (certIndex) {
      console.log(`\n🗑️  Dropping certificates.certificateId unique index: ${certIndex.name}`);
      await collection.dropIndex(certIndex.name);
      console.log('✅ Certificates index dropped successfully');
    } else {
      console.log('\n✅ No certificates.certificateId unique index found');
    }

    // Show updated indexes
    const updatedIndexes = await collection.indexes();
    console.log('\n📋 Updated indexes:');
    updatedIndexes.forEach((index, idx) => {
      console.log(`  ${idx + 1}. ${index.name}:`, JSON.stringify(index.key));
    });

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 27) {
      console.log('   (Index not found - this is OK, it means the index was already removed)');
    }
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  dropEmailIndex();
}

module.exports = dropEmailIndex;
