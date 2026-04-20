const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const Course = require('../models/Course');
const InstructorChatSession = require('../models/InstructorChatSession');
const { runInstructorInsights } = require('../agents/instructorInsightsAgent');

const router = express.Router();

const MAX_USER_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 40;

// Resolve and validate the optional course scope. Returns the ObjectId or null.
async function resolveCourseScope(instructorId, rawCourseId) {
  if (!rawCourseId) return null;
  if (!mongoose.Types.ObjectId.isValid(rawCourseId)) {
    const err = new Error('Invalid courseId');
    err.statusCode = 400;
    throw err;
  }
  const owned = await Course.findOne({ _id: rawCourseId, instructorId }).select('_id').lean();
  if (!owned) {
    const err = new Error('Course not found or not owned by you');
    err.statusCode = 404;
    throw err;
  }
  return new mongoose.Types.ObjectId(rawCourseId);
}

/** GET /v1/instructor/chat?courseId=... — fetch history for this scope. */
router.get('/', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const scope = await resolveCourseScope(req.userId, req.query.courseId || null);
    const session = await InstructorChatSession.findOne({
      instructorId: req.userId,
      courseId: scope,
    })
      .select('messages updatedAt')
      .lean();
    res.json({
      success: true,
      data: {
        courseId: scope ? scope.toString() : null,
        messages: session?.messages || [],
        updatedAt: session?.updatedAt || null,
      },
    });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ success: false, error: e.message });
    next(e);
  }
});

/** POST /v1/instructor/chat — send a message, receive the agent's reply. */
router.post('/', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const { message, courseId, studentId, includeSynthetic } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    const trimmed = message.trim().slice(0, MAX_USER_MESSAGE_CHARS);

    if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid studentId' });
    }

    const scope = await resolveCourseScope(req.userId, courseId || null);

    const session = await InstructorChatSession.findOneAndUpdate(
      { instructorId: req.userId, courseId: scope },
      { $setOnInsert: { instructorId: req.userId, courseId: scope, messages: [] } },
      { upsert: true, new: true }
    );

    const priorMessages = (session.messages || [])
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    const { reply, toolCalls, iterations } = await runInstructorInsights({
      instructorId: req.userId,
      courseId: scope ? scope.toString() : null,
      studentId: studentId || null,
      includeSynthetic: includeSynthetic !== false,
      messages: priorMessages,
      userMessage: trimmed,
    });

    session.messages.push({
      role: 'user',
      content: trimmed,
      createdAt: new Date(),
    });
    session.messages.push({
      role: 'assistant',
      content: reply,
      toolCalls: toolCalls?.length ? toolCalls : null,
      createdAt: new Date(),
    });
    // Cap persisted history.
    if (session.messages.length > MAX_HISTORY_MESSAGES * 2) {
      session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES * 2);
    }
    await session.save();

    res.json({
      success: true,
      data: {
        reply,
        toolCalls: toolCalls || [],
        iterations,
        courseId: scope ? scope.toString() : null,
      },
    });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ success: false, error: e.message });
    next(e);
  }
});

/** DELETE /v1/instructor/chat?courseId=... — clear history for this scope. */
router.delete('/', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const scope = await resolveCourseScope(req.userId, req.query.courseId || null);
    await InstructorChatSession.deleteOne({
      instructorId: req.userId,
      courseId: scope,
    });
    res.json({ success: true, data: { cleared: true } });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ success: false, error: e.message });
    next(e);
  }
});

module.exports = router;
