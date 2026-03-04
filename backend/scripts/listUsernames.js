#!/usr/bin/env node

/**
 * List all usernames from the local database.
 * Uses MONGODB_URI from backend/.env (default: mongodb://localhost:27017/ai_edu_app)
 *
 * Usage (from backend/): node scripts/listUsernames.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
  await mongoose.connect(uri);
  const users = await User.find({}).select('username name _id createdAt').sort({ createdAt: 1 }).lean();
  console.log(`Total users: ${users.length}\n`);
  if (users.length === 0) {
    console.log('No users found.');
    process.exit(0);
    return;
  }
  console.log('Username          | Name                 | User ID              | Created');
  console.log('-'.repeat(90));
  for (const u of users) {
    const username = (u.username || '').padEnd(16);
    const name = (u.name || '').substring(0, 20).padEnd(20);
    const id = (u._id && u._id.toString()) || '';
    const created = u.createdAt ? u.createdAt.toISOString().replace('T', ' ').substring(0, 19) : '';
    console.log(`${username} | ${name} | ${id} | ${created}`);
  }
  console.log('\nUsernames only:');
  console.log(users.map(u => u.username).join('\n'));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
