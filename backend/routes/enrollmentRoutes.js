const express = require('express');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseTopic = require('../models/CourseTopic');
const Enrollment = require('../models/Enrollment');
const Session = require('../models/Session');
const { requireAuth } = require('../middleware/auth');
const { requireEnrolledStudent } = require('../middleware/enrollmentAccess');
const { seedSessionForCourseTopic } = require('../services/sessionSeedingService');

const router = express.Router();

// Pilot B1: the join modal shipped enum values the Enrollment schema never
// accepted (selfRating 'some_knowledge' → ValidationError → opaque 500, and
// the modal silently stalled). Sanitize here so any deployed client version
// joins cleanly; unknown values degrade to the schema defaults rather than
// throwing. Vocabulary mirrors simulation/syntheticStudent.js.
const SELF_RATING_MAP = {
  none: 'none',
  basic: 'beginner',
  beginner: 'beginner',
  some_knowledge: 'beginner',
  some: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced'
};
const EXPOSURES = new Set(['none', 'some', 'lots', 'unknown']);
const MOTIVATIONS = new Set(['grade', 'curiosity', 'career', 'requirement', 'unknown']);

function sanitizePriorKnowledge(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  if (raw.selfRating != null) {
    out.selfRating = SELF_RATING_MAP[String(raw.selfRating).trim().toLowerCase()] || 'none';
  }
  if (raw.programmingExposure != null) {
    const v = String(raw.programmingExposure).trim().toLowerCase();
    out.programmingExposure = EXPOSURES.has(v) ? v : 'unknown';
  }
  if (raw.motivationType != null) {
    const v = String(raw.motivationType).trim().toLowerCase();
    out.motivationType = MOTIVATIONS.has(v) ? v : 'unknown';
  }
  const conf = Number(raw.selfConfidence);
  if (Number.isFinite(conf)) out.selfConfidence = Math.min(5, Math.max(1, Math.round(conf)));
  if (raw.relevantExperience != null) out.relevantExperience = String(raw.relevantExperience).slice(0, 500);
  if (raw.specificGoals != null) out.specificGoals = String(raw.specificGoals).slice(0, 500);
  return Object.keys(out).length ? out : undefined;
}

/** POST /v1/courses/join */
router.post('/join', requireAuth, async (req, res, next) => {
  try {
    const code = String(req.body?.accessCode || '').trim().toUpperCase();
    if (!code || code.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'accessCode is required',
        code: 'VALIDATION_ERROR'
      });
    }
    const course = await Course.findOne({ accessCode: code, status: { $ne: 'archived' } });
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Invalid access code',
        code: 'INVALID_CODE'
      });
    }
    const existing = await Enrollment.findOne({
      studentId: req.userId,
      courseId: course._id
    });
    if (existing) {
      if (existing.status === 'dropped') {
        existing.status = 'active';
        await existing.save();
      }
      return res.json({
        success: true,
        data: { enrollment: existing, course: { _id: course._id, title: course.title } }
      });
    }
    const enrollment = await Enrollment.create({
      studentId: req.userId,
      courseId: course._id,
      status: 'active',
      priorKnowledge: sanitizePriorKnowledge(req.body?.priorKnowledge)
    });
    res.status(201).json({
      success: true,
      data: { enrollment, course: { _id: course._id, title: course.title, accessCode: course.accessCode } }
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Already enrolled',
        code: 'ALREADY_ENROLLED'
      });
    }
    // Schema drift must read as a client error with a JSON body, never as
    // Express's default 500 HTML page (which the modal cannot even parse).
    if (e.name === 'ValidationError' || e.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Some profile answers were not understood. You can retry, or skip the profile questions.',
        code: 'VALIDATION_ERROR'
      });
    }
    next(e);
  }
});

/** GET /v1/courses/mine */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.userId, status: 'active' })
      .populate({
        path: 'courseId',
        match: { status: { $ne: 'archived' } },
        select: 'title description status accessCode'
      })
      .sort({ joinedAt: -1 })
      .lean();
    // When a course is archived/deleted, populated `courseId` becomes null. Hide those entries.
    res.json({ success: true, data: { enrollments: enrollments.filter((e) => e.courseId) } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/courses/:courseId/topics — published only, enrolled students */
router.get('/:courseId/topics', requireAuth, requireEnrolledStudent, async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const topics = await CourseTopic.find({
      courseId: req.params.courseId,
      status: 'published'
    })
      .sort({ orderIndex: 1, createdAt: 1 })
      // 2b: `modules` was absent, so the student topic card counted over
      // undefined and rendered "0 modules · 0 milestones" for every published
      // topic, and suppressed the points badge and difficulty pills too.
      .select('title objective orderIndex status publishedAt version modules')
      .lean();

    // Attach existing sessionId (if any) so UI can show "Continue learning".
    // We query once and map by courseTopicId to avoid N queries.
    const sessions = await Session.find({
      userId: req.userId,
      courseId: new mongoose.Types.ObjectId(courseId),
      enrollmentId: req.enrollment._id,
      courseTopicId: { $in: topics.map(t => t._id) },
    })
      .select('_id courseTopicId updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    const byTopicId = new Map();
    for (const s of sessions) {
      const key = String(s.courseTopicId);
      if (!byTopicId.has(key)) byTopicId.set(key, s._id.toString());
    }

    const topicsWithSession = topics.map((t) => ({
      ...t,
      sessionId: byTopicId.get(String(t._id)) || null,
    }));

    res.json({ success: true, data: { topics: topicsWithSession } });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/courses/:courseId/topics/:topicId/start */
router.post('/:courseId/topics/:topicId/start', requireAuth, requireEnrolledStudent, async (req, res, next) => {
  try {
    const { courseId, topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic id', code: 'VALIDATION_ERROR' });
    }
    const topic = await CourseTopic.findById(topicId);
    if (!topic || topic.courseId.toString() !== courseId) {
      return res.status(404).json({ success: false, error: 'Topic not found', code: 'NOT_FOUND' });
    }
    if (topic.status !== 'published') {
      return res.status(403).json({
        success: false,
        error: 'Topic is not published',
        code: 'TOPIC_NOT_PUBLISHED'
      });
    }

    // Reuse existing session for this enrollment/topic so "Start learning" resumes the same thread.
    // This prevents creating a new chat thread every time the student clicks the button.
    const existing = await Session.findOne({
      userId: req.userId,
      courseId: new mongoose.Types.ObjectId(courseId),
      courseTopicId: topic._id,
      enrollmentId: req.enrollment._id,
    })
      .sort({ updatedAt: -1 })
      .select('_id phase activeModuleId')
      .lean();

    if (existing?._id) {
      return res.status(200).json({
        success: true,
        data: {
          sessionId: existing._id.toString(),
          phase: existing.phase,
          activeModuleId: existing.activeModuleId,
          reused: true,
        },
      });
    }

    const session = await seedSessionForCourseTopic({
      userId: req.userId,
      topic,
      courseId,
      enrollmentId: req.enrollment._id.toString()
    });
    res.status(201).json({
      success: true,
      data: {
        sessionId: session._id.toString(),
        phase: session.phase,
        activeModuleId: session.activeModuleId,
        reused: false,
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
