#!/usr/bin/env node

/**
 * Script to clear all profile data from users
 * This resets all user profiles to default values
 * Run with: node scripts/clearProfileData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function clearProfileData() {
  try {
    // Connect to MongoDB - use same database as server.js
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    // Find all users
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    let clearedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        // Reset profile to default values
        user.profile = {
          source: 'user',
          background: '',
          goals: [],
          strengths: [],
          gaps: [],
          timePerDayMins: 30,
          preferredStyle: 'mixed',
          skillLevel: 'Beginner',
          learningType: 'Visual',
          major: '',
          currentCourses: [],
          daysPerWeek: 3,
          minutesPerSession: 30,
          recentTopics: [],
          selfRating: '',
          primaryGoal: '',
          defaultMode: 'Studying',
          explanationLength: 'Balanced',
          examplesPreference: 'Many',
          language: 'English',
          onboardingCompleted: false
        };

        await user.save();
        clearedCount++;
        console.log(`✅ Cleared profile for user: ${user.email}`);
      } catch (error) {
        console.error(`❌ Error clearing profile for user ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Profile data clearing complete:`);
    console.log(`- Profiles cleared: ${clearedCount}`);
    console.log(`- Errors: ${errorCount}`);
    console.log(`- Total users: ${users.length}`);

  } catch (error) {
    console.error('❌ Failed to clear profile data:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  clearProfileData()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = clearProfileData;

