#!/usr/bin/env node

/**
 * Export performance data for multiple users into a single CSV file.
 *
 * Usage (from backend/):
 *   node scripts/exportUsersPerformance.js <userIdOrUsername1> [userIdOrUsername2] ...
 *   node scripts/exportUsersPerformance.js --format=quiz_attempts <userIdOrUsername1> ...
 *
 * You can pass MongoDB ObjectIds (e.g. 6972e009ae7b4ab62853cfaf) or usernames (e.g. johndoe).
 * Script uses MONGODB_URI from backend/.env — for Atlas, set MONGODB_URI to your Atlas connection string.
 *
 * --format=quiz_attempts  Flat table: user_id, topic_name, module_id, attempt_number, quiz_score, passed, module_completed, num_user_messages, time_spent_seconds.
 *
 * Output: performance-export-<timestamp>.csv or quiz-attempts-export-<timestamp>.csv in backend/.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Session = require('../models/Session');
const { getUserPerformance } = require('../services/performanceService');

function isValidObjectId(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}

/** Resolve usernames to user IDs. Accepts array of userId (ObjectId string) or username; returns array of ObjectId strings. */
async function resolveUserIds(userIdsOrUsernames) {
  const User = require('../models/User');
  const resolved = [];
  for (const arg of userIdsOrUsernames) {
    if (isValidObjectId(arg)) {
      resolved.push(arg);
      continue;
    }
    const u = await User.findOne({ username: arg }).select('_id').lean();
    if (u) resolved.push(u._id.toString());
    else {
      console.warn(`User not found: "${arg}" (no user with this username or ObjectId)`);
    }
  }
  return resolved;
}

function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function computeSessionTimeSeconds(session) {
  if (session.messages && session.messages.length >= 2) {
    const first = session.messages[0].timestamp;
    const last = session.messages[session.messages.length - 1].timestamp;
    if (first && last) return Math.round((new Date(last) - new Date(first)) / 1000);
  }
  if (session.updatedAt && session.createdAt) {
    return Math.round((new Date(session.updatedAt) - new Date(session.createdAt)) / 1000);
  }
  return '';
}

function isFilteredTopic(topicName, session) {
  const t = (topicName || '').trim().toLowerCase();
  if (t === 'general learning') return true;
  if (t.includes('revision')) return true;
  if (session.mode === 'reviewing') return true;
  return false;
}

async function buildQuizAttemptsFlatCsv(userIds) {
  const sessions = await Session.find({ userId: { $in: userIds } })
    .select('userId topic mode plan messages quizAttempts createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();

  const uniqueUserIds = [...new Set(sessions.map(s => (s.userId && s.userId.toString ? s.userId.toString() : String(s.userId))))];
  const users = await User.find({ _id: { $in: uniqueUserIds } }).select('username _id').lean();
  const userIdToUsername = new Map(users.map(u => [u._id.toString(), u.username || u._id.toString()]));

  const rows = [];
  for (const session of sessions) {
    const topicName = (session.topic || '').trim();
    if (isFilteredTopic(topicName, session)) continue;
    const userId = session.userId && session.userId.toString ? session.userId.toString() : String(session.userId);
    const username = userIdToUsername.get(userId) || userId;
    const numUserMessages = (session.messages && Array.isArray(session.messages))
      ? session.messages.filter(m => m && m.role === 'user').length
      : 0;
    const timeSpentSeconds = computeSessionTimeSeconds(session);

    const plan = (session.plan && Array.isArray(session.plan)) ? session.plan : [];
    const submittedNonRevision = (session.quizAttempts && Array.isArray(session.quizAttempts))
      ? session.quizAttempts.filter(a => a && a.status === 'submitted' && !a.isRevision)
      : [];

    if (plan.length === 0) {
      rows.push({ username, topicName, moduleId: '', attemptNumber: '', quizScore: '', passed: '', moduleCompleted: '', numUserMessages, timeSpentSeconds });
      continue;
    }

    for (const module of plan) {
      const moduleId = module.id != null ? String(module.id) : '';
      const moduleCompleted = module.status === 'passed' ? 1 : 0;
      const attemptsForModule = submittedNonRevision
        .filter(a => (a.moduleId != null ? String(a.moduleId) : '') === moduleId)
        .sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0));

      let attemptNumber = '';
      let quizScore = '';
      let passed = '';
      if (attemptsForModule.length > 0) {
        attemptNumber = attemptsForModule.length;
        quizScore = attemptsForModule.map(a => (a.scorePct != null ? Number(a.scorePct) : '')).join(',');
        passed = attemptsForModule.map(a => (a.passed === true ? 1 : 0)).join(',');
      }
      rows.push({ username, topicName, moduleId, attemptNumber, quizScore, passed, moduleCompleted, numUserMessages, timeSpentSeconds });
    }
  }

  rows.sort((a, b) => {
    const u = (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' });
    if (u !== 0) return u;
    const t = (a.topicName || '').localeCompare(b.topicName || '', undefined, { sensitivity: 'base' });
    if (t !== 0) return t;
    return String(a.moduleId).localeCompare(String(b.moduleId));
  });

  let csv = 'user_id,topic_name,module_id,attempt_number,quiz_score,passed,module_completed,num_user_messages,time_spent_seconds\n';
  for (const r of rows) {
    csv += `${escapeCsv(r.username)},${escapeCsv(r.topicName)},${escapeCsv(r.moduleId)},${r.attemptNumber},${escapeCsv(r.quizScore)},${escapeCsv(r.passed)},${r.moduleCompleted},${r.numUserMessages},${r.timeSpentSeconds}\n`;
  }
  return csv;
}

async function run() {
  const args = process.argv.slice(2);
  const formatArg = args.find(a => a.startsWith('--format='));
  const format = formatArg ? (formatArg.split('=')[1] || '').toLowerCase() : '';
  const userIds = args.filter(a => !a.startsWith('--')).filter(Boolean);

  if (userIds.length === 0) {
    console.log('Usage: node scripts/exportUsersPerformance.js [--format=quiz_attempts] <userId1> [userId2] ...');
    console.log('  --format=quiz_attempts  Flat CSV: user_id, topic_name, module_id, attempt_number, quiz_score, passed, module_completed, num_user_messages, time_spent_seconds');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
  const dbDisplay = mongoUri.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB:', dbDisplay);

  const resolvedIds = await resolveUserIds(userIds);
  if (resolvedIds.length === 0) {
    console.error('No valid users found. Check usernames/IDs and that MONGODB_URI points to the right database (e.g. Atlas).');
    await mongoose.connection.close();
    process.exit(1);
  }
  if (resolvedIds.length < userIds.length) {
    console.warn(`Resolved ${resolvedIds.length} of ${userIds.length} user(s).`);
  }

  if (format === 'quiz_attempts') {
    const csv = await buildQuizAttemptsFlatCsv(resolvedIds);
    const outDir = path.resolve(__dirname, '..');
    const filename = `quiz-attempts-export-${Date.now()}.csv`;
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(filepath, csv, 'utf8');
    console.log(`Exported quiz-attempts for ${resolvedIds.length} user(s) to ${filepath}`);
    await mongoose.connection.close();
    return;
  }

  const users = await User.find({ _id: { $in: resolvedIds } }).select('username name _id').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const allSessionsByUser = new Map();

  let csv = 'Admin Performance Export (multiple users)\n';
  csv += `Generated: ${new Date().toISOString()}\n`;
  csv += `User IDs: ${resolvedIds.join(', ')}\n\n`;

  csv += 'SUMMARY METRICS\n';
  csv += 'User ID,Username,Name,Total Minutes Spent,Accuracy Rate %,Quiz Average Score %,Quiz Pass Rate %,Modules Completed,Module Completion Rate %,Sessions Completed,Session Completion Rate %,Activity Streak (days)\n';

  for (const userId of resolvedIds) {
    const user = userMap.get(userId);
    const username = user ? (user.username || '') : '';
    const name = user ? (user.name || '') : '';

    let performanceData;
    let sessions = [];
    try {
      performanceData = await getUserPerformance(userId);
      sessions = await Session.find({ userId }).sort({ createdAt: -1 });
    } catch (err) {
      console.warn(`Skipping user ${userId}:`, err.message);
      csv += `${userId},${escapeCsv(username)},${escapeCsv(name)},N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A\n`;
      continue;
    }

    allSessionsByUser.set(userId, sessions);

    const modCompletion = performanceData.moduleCompletion || {};
    const sessionStats = performanceData.sessionStats || {};
    const streak = (performanceData.activityStreak && performanceData.activityStreak.currentStreak) ?? 0;

    csv += `${userId},${escapeCsv(username)},${escapeCsv(name)},${performanceData.minutesSpent ?? ''},${performanceData.accuracyRate ?? ''},${(performanceData.quizScores && performanceData.quizScores.average) ?? ''},${(performanceData.quizScores && performanceData.quizScores.passRate) ?? ''},${modCompletion.completed ?? ''}/${modCompletion.total ?? ''},${modCompletion.completionRate ?? ''},${sessionStats.completed ?? ''}/${sessionStats.total ?? ''},${sessionStats.completionRate ?? ''},${streak}\n`;
  }

  csv += '\nSESSION DETAILS\n';
  csv += 'User ID,Session ID,Topic,Phase,Points,Status,Created At,Updated At\n';
  for (const userId of resolvedIds) {
    const sessions = allSessionsByUser.get(userId) || [];
    for (const session of sessions) {
      const createdAt = session.createdAt ? new Date(session.createdAt).toISOString() : 'N/A';
      const updatedAt = session.updatedAt ? new Date(session.updatedAt).toISOString() : 'N/A';
      const status = session.phase === 'completed' ? 'Completed' : 'In Progress';
      csv += `${userId},${session._id},${escapeCsv(session.topic || 'N/A')},${session.phase || 'N/A'},${session.points || 0},${status},${createdAt},${updatedAt}\n`;
    }
  }

  csv += '\nQUIZ ATTEMPTS\n';
  csv += 'User ID,Module ID,Attempt Number,Score,Passed,Status,Date\n';
  for (const userId of resolvedIds) {
    const sessions = allSessionsByUser.get(userId) || [];
    for (const session of sessions) {
      if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
        for (const attempt of session.quizAttempts) {
          if (attempt.status === 'submitted') {
            const attemptDate = attempt.submittedAt || attempt.createdAt || session.createdAt;
            const formattedDate = attemptDate ? new Date(attemptDate).toISOString() : 'N/A';
            csv += `${userId},${attempt.moduleId || 'N/A'},${attempt.attemptNo || 1},${attempt.scorePct != null ? attempt.scorePct + '%' : ''},${attempt.passed ? 'Yes' : 'No'},${attempt.status},${formattedDate}\n`;
          }
        }
      }
    }
  }

  const outDir = path.resolve(__dirname, '..');
  const filename = `performance-export-${Date.now()}.csv`;
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, csv, 'utf8');

  console.log(`Exported ${resolvedIds.length} user(s) to ${filepath}`);
  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
