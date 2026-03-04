const express = require('express');
const router = express.Router();
const pino = require('pino');
const { getUserPerformance } = require('../services/performanceService');
const { requireAdminKey } = require('../middleware/adminAuth');
const Session = require('../models/Session');
const User = require('../models/User');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const addRequestId = (req, res, next) => {
  req.logger = logger.child({ requestId: req.requestId });
  next();
};

/** Allow listing users from localhost in development without admin key. */
function optionalAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_API_KEY;
  const isLocal = req.get('host') && (req.get('host').startsWith('localhost') || req.get('host').startsWith('127.0.0.1'));
  if (process.env.NODE_ENV === 'development' && isLocal) return next();
  if (expected && key === expected) return next();
  return res.status(403).json({ success: false, error: 'Invalid or missing admin key', code: 'ADMIN_FORBIDDEN' });
}

/**
 * GET /v1/admin/users/list
 * Return all usernames (and name, _id, createdAt). In development from localhost, no key required; otherwise requires x-admin-key.
 */
router.get('/v1/admin/users/list', optionalAdminKey, addRequestId, async (req, res) => {
  try {
    const users = await User.find({}).select('username name _id createdAt').sort({ createdAt: 1 }).lean();
    const list = users.map(u => ({
      username: u.username,
      name: u.name,
      _id: u._id && u._id.toString(),
      createdAt: u.createdAt
    }));
    res.json({ success: true, count: list.length, users: list });
  } catch (err) {
    req.logger.error({ err: err.message }, 'Admin list users failed');
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /v1/admin/performance/export?userIds=id1,id2,id3[&format=quiz_attempts]
 * Export performance data for multiple users as a single CSV.
 * format=quiz_attempts: flat table with one row per quiz attempt (user_id, topic_name, module_id, attempt_number, quiz_score, passed, module_completed, num_user_messages, time_spent_seconds).
 * Requires header: x-admin-key: <ADMIN_API_KEY>
 */
router.get('/v1/admin/performance/export', requireAdminKey, addRequestId, async (req, res) => {
  const startTime = Date.now();
  const format = (req.query.format || '').toLowerCase();

  try {
    const raw = req.query.userIds;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter userIds is required (e.g. ?userIds=id1,id2,id3)',
        code: 'MISSING_USER_IDS'
      });
    }

    const userIds = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one user ID is required',
        code: 'EMPTY_USER_IDS'
      });
    }

    req.logger.info({ userIds, count: userIds.length, format }, 'Admin performance export request');

    if (format === 'quiz_attempts') {
      const csv = await buildQuizAttemptsFlatCsv(userIds, req.logger);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="quiz-attempts-export-${Date.now()}.csv"`);
      res.send(csv);
      const duration = Date.now() - startTime;
      req.logger.info({ userIds: userIds.length, duration, csvLength: csv.length }, 'Admin quiz-attempts export completed');
      return;
    }

    const users = await User.find({ _id: { $in: userIds } }).select('username name _id').lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    let csv = 'Admin Performance Export (multiple users)\n';
    csv += `Generated: ${new Date().toISOString()}\n`;
    csv += `User IDs: ${userIds.join(', ')}\n\n`;

    // Summary metrics – one row per user (single sheet)
    csv += 'SUMMARY METRICS\n';
    csv += 'User ID,Username,Name,Total Minutes Spent,Accuracy Rate %,Quiz Average Score %,Quiz Pass Rate %,Modules Completed,Module Completion Rate %,Sessions Completed,Session Completion Rate %,Activity Streak (days)\n';

    const allSessionsByUser = new Map();

    for (const userId of userIds) {
      const user = userMap.get(userId);
      const username = user ? (user.username || '') : '';
      const name = user ? (user.name || '') : '';

      let performanceData;
      let sessions = [];
      try {
        performanceData = await getUserPerformance(userId);
        sessions = await Session.find({ userId }).sort({ createdAt: -1 });
      } catch (err) {
        req.logger.warn({ userId, error: err.message }, 'Skipping user (not found or error)');
        csv += `${userId},${escapeCsv(username)},${escapeCsv(name)},N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A\n`;
        continue;
      }

      allSessionsByUser.set(userId, sessions);

      const modCompletion = performanceData.moduleCompletion || {};
      const sessionStats = performanceData.sessionStats || {};
      const streak = (performanceData.activityStreak && performanceData.activityStreak.currentStreak) ?? 0;

      csv += `${userId},${escapeCsv(username)},${escapeCsv(name)},${performanceData.minutesSpent ?? ''},${performanceData.accuracyRate ?? ''},${(performanceData.quizScores && performanceData.quizScores.average) ?? ''},${(performanceData.quizScores && performanceData.quizScores.passRate) ?? ''},${modCompletion.completed ?? ''}/${modCompletion.total ?? ''},${modCompletion.completionRate ?? ''},${sessionStats.completed ?? ''}/${sessionStats.total ?? ''},${sessionStats.completionRate ?? ''},${streak}\n`;
    }

    csv += '\n';

    // Session details – one row per session with User ID
    csv += 'SESSION DETAILS\n';
    csv += 'User ID,Session ID,Topic,Phase,Points,Status,Created At,Updated At\n';
    for (const userId of userIds) {
      const sessions = allSessionsByUser.get(userId) || [];
      for (const session of sessions) {
        const createdAt = session.createdAt ? new Date(session.createdAt).toISOString() : 'N/A';
        const updatedAt = session.updatedAt ? new Date(session.updatedAt).toISOString() : 'N/A';
        const status = session.phase === 'completed' ? 'Completed' : 'In Progress';
        csv += `${userId},${session._id},${escapeCsv(session.topic || 'N/A')},${session.phase || 'N/A'},${session.points || 0},${status},${createdAt},${updatedAt}\n`;
      }
    }

    csv += '\n';

    // Quiz attempts – one row per attempt with User ID
    csv += 'QUIZ ATTEMPTS\n';
    csv += 'User ID,Module ID,Attempt Number,Score,Passed,Status,Date\n';
    for (const userId of userIds) {
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

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="admin-performance-export-${Date.now()}.csv"`);
    res.send(csv);

    const duration = Date.now() - startTime;
    req.logger.info({ userIds: userIds.length, duration, csvLength: csv.length }, 'Admin performance export completed');
  } catch (error) {
    const duration = Date.now() - startTime;
    req.logger.error({ error: error.message, stack: error.stack, duration }, 'Admin performance export error');
    res.status(500).json({
      success: false,
      error: 'Failed to export performance data',
      code: 'EXPORT_ERROR',
      message: error.message
    });
  }
});

function isFilteredTopic(topicName, session) {
  const t = (topicName || '').trim().toLowerCase();
  if (t === 'general learning') return true;
  if (t.includes('revision')) return true;
  if (session.mode === 'reviewing') return true;
  return false;
}

/**
 * Build flat CSV: one row per module (per topic). Revision topics/sessions excluded.
 * user_id = username. attempt_number = total attempts for that module; quiz_score/passed = comma-separated for multiple attempts.
 */
async function buildQuizAttemptsFlatCsv(userIds, log) {
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

function computeSessionTimeSeconds(session) {
  if (session.messages && session.messages.length >= 2) {
    const first = session.messages[0].timestamp;
    const last = session.messages[session.messages.length - 1].timestamp;
    if (first && last) {
      const ms = new Date(last) - new Date(first);
      return Math.round(ms / 1000);
    }
  }
  if (session.updatedAt && session.createdAt) {
    return Math.round((new Date(session.updatedAt) - new Date(session.createdAt)) / 1000);
  }
  return '';
}

function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

module.exports = router;
