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
      priorKnowledge: req.body?.priorKnowledge || undefined
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
    const topics = await CourseTopic.find({
      courseId: req.params.courseId,
      status: 'published'
    })
      .sort({ orderIndex: 1, createdAt: 1 })
      .select('title objective orderIndex status publishedAt version')
      .lean();
    res.json({ success: true, data: { topics } });
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
