const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const { requireCourseOwner } = require('../middleware/instructorOwnership');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const Enrollment = require('../models/Enrollment');
const InstructorStudentNote = require('../models/InstructorStudentNote');
const {
  getCourseAnalytics,
  getStudentProgress,
  getInstructorStudentDetail,
  getCoursePerformanceSummary,
} = require('../services/analyticsService');
const {
  getTreeAnalytics,
  getMilestoneStats,
  getAtRiskStudents,
  getCrossCourseKPIs,
  getTopicStudentHeatmap,
} = require('../services/milestoneAnalyticsService');
const { runStruggleSummary } = require('../agents/struggleSummaryAgent');

// `?includeSynthetic=1` flips the excludeSynthetic default to false. The
// professor-study dashboards pass this so the synthetic cohort — which IS
// the study data — is counted.
function parseSyntheticFlag(req) {
  const raw = req.query?.includeSynthetic;
  const include = raw === '1' || raw === 'true' || raw === 'yes';
  return { excludeSynthetic: !include };
}

const router = express.Router();

/** GET /v1/instructor/courses/:courseId/analytics/performance */
router.get(
  '/courses/:courseId/analytics/performance',
  requireAuth,
  requireRole('instructor'),
  requireCourseOwner,
  async (req, res, next) => {
    try {
      const data = await getCoursePerformanceSummary(req.params.courseId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

/** GET /v1/instructor/courses/:courseId/analytics */
router.get('/courses/:courseId/analytics', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const analytics = await getCourseAnalytics(req.params.courseId);
    res.json({ success: true, data: analytics });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/insights — AI-generated struggle summary */
router.get('/courses/:courseId/insights', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const analytics = await getCourseAnalytics(req.params.courseId);
    const insights = await runStruggleSummary(analytics);
    res.json({ success: true, data: insights });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/students */
router.get('/courses/:courseId/students', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getStudentProgress(req.params.courseId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/students/:studentId — individual monitoring (summary + per-topic latest session) */
router.get('/courses/:courseId/students/:studentId', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }
    const data = await getInstructorStudentDetail(courseId, studentId);
    if (data?.error === 'STUDENT_NOT_ENROLLED') {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

function assertSessionBelongsToCourse(session, courseId) {
  if (!session) return { ok: false, status: 404, error: 'Session not found', code: 'NOT_FOUND' };
  if (!session.courseId || session.courseId.toString() !== courseId) {
    return { ok: false, status: 404, error: 'Session not found', code: 'NOT_FOUND' };
  }
  return { ok: true };
}

/** GET /v1/instructor/courses/:courseId/sessions/:sessionId — session header (no full messages) */
router.get('/courses/:courseId/sessions/:sessionId', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session id', code: 'VALIDATION_ERROR' });
    }
    const session = await Session.findById(sessionId)
      .select('phase mode topic chatTitle plan activeModuleId points gems progressPct userId courseId courseTopicId enrollmentId meta createdAt updatedAt')
      .lean();
    const ok = assertSessionBelongsToCourse(session, courseId);
    if (!ok.ok) return res.status(ok.status).json({ success: false, error: ok.error, code: ok.code });

    // Ensure enrollmentId belongs to this course (defense in depth)
    if (session.enrollmentId) {
      const enrollment = await Enrollment.findById(session.enrollmentId).select('courseId studentId userId').lean();
      const enrollmentCourseId = enrollment?.courseId?.toString();
      if (enrollmentCourseId && enrollmentCourseId !== courseId) {
        return res.status(404).json({ success: false, error: 'Session not found', code: 'NOT_FOUND' });
      }
    }

    return res.json({
      success: true,
      data: {
        id: session._id.toString(),
        phase: session.phase,
        mode: session.mode,
        topic: session.topic,
        chatTitle: session.chatTitle,
        plan: session.plan,
        activeModuleId: session.activeModuleId,
        points: session.points,
        gems: session.gems,
        progressPct: session.progressPct,
        userId: session.userId,
        courseId: session.courseId,
        courseTopicId: session.courseTopicId,
        enrollmentId: session.enrollmentId,
        meta: session.meta,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/sessions/:sessionId/messages — paginated messages */
router.get('/courses/:courseId/sessions/:sessionId/messages', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session id', code: 'VALIDATION_ERROR' });
    }
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
    const fromEnd = Math.max(0, parseInt(req.query.fromEnd) || 0);

    const session = await Session.findById(sessionId).select('courseId enrollmentId messages').lean();
    const ok = assertSessionBelongsToCourse(session, courseId);
    if (!ok.ok) return res.status(ok.status).json({ success: false, error: ok.error, code: ok.code });

    if (session.enrollmentId) {
      const enrollment = await Enrollment.findById(session.enrollmentId).select('courseId').lean();
      const enrollmentCourseId = enrollment?.courseId?.toString();
      if (enrollmentCourseId && enrollmentCourseId !== courseId) {
        return res.status(404).json({ success: false, error: 'Session not found', code: 'NOT_FOUND' });
      }
    }

    const allMessages = Array.isArray(session.messages) ? session.messages : [];
    const totalCount = allMessages.length;
    const start = Math.max(0, totalCount - fromEnd - limit);
    const end = totalCount - fromEnd;
    const messages = start < end ? allMessages.slice(start, end) : [];
    const hasMore = fromEnd + limit < totalCount;

    return res.json({ success: true, data: { messages, totalCount, hasMore } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/students/:studentId/notes */
router.get('/courses/:courseId/students/:studentId/notes', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }
    const courseTopicId = req.query.courseTopicId ? String(req.query.courseTopicId) : null;
    if (courseTopicId && !mongoose.Types.ObjectId.isValid(courseTopicId)) {
      return res.status(400).json({ success: false, error: 'Invalid courseTopicId', code: 'VALIDATION_ERROR' });
    }

    const enrollment = await Enrollment.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      studentId: new mongoose.Types.ObjectId(studentId),
      status: 'active',
    }).select('_id').lean();
    if (!enrollment?._id) {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }

    const note = await InstructorStudentNote.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      enrollmentId: enrollment._id,
      studentId: new mongoose.Types.ObjectId(studentId),
      courseTopicId: courseTopicId ? new mongoose.Types.ObjectId(courseTopicId) : null,
      createdByInstructorId: new mongoose.Types.ObjectId(req.userId),
    })
      .select('tags note courseTopicId createdAt updatedAt')
      .lean();

    return res.json({
      success: true,
      data: {
        courseId,
        studentId,
        courseTopicId: courseTopicId || null,
        tags: note?.tags || [],
        note: note?.note || '',
        updatedAt: note?.updatedAt || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/students/:studentId/notes (upsert) */
router.post('/courses/:courseId/students/:studentId/notes', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }

    const courseTopicId = req.body?.courseTopicId ? String(req.body.courseTopicId) : null;
    if (courseTopicId && !mongoose.Types.ObjectId.isValid(courseTopicId)) {
      return res.status(400).json({ success: false, error: 'Invalid courseTopicId', code: 'VALIDATION_ERROR' });
    }

    const tagsRaw = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const tags = tagsRaw
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .slice(0, 20);

    const noteText = typeof req.body?.note === 'string' ? req.body.note : '';
    const note = noteText.trim().slice(0, 4000);

    const enrollment = await Enrollment.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      studentId: new mongoose.Types.ObjectId(studentId),
      status: 'active',
    }).select('_id').lean();
    if (!enrollment?._id) {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }

    const filter = {
      courseId: new mongoose.Types.ObjectId(courseId),
      enrollmentId: enrollment._id,
      studentId: new mongoose.Types.ObjectId(studentId),
      courseTopicId: courseTopicId ? new mongoose.Types.ObjectId(courseTopicId) : null,
      createdByInstructorId: new mongoose.Types.ObjectId(req.userId),
    };

    const updated = await InstructorStudentNote.findOneAndUpdate(
      filter,
      {
        $set: {
          tags,
          note,
        },
        $setOnInsert: {
          ...filter,
        },
      },
      { upsert: true, new: true }
    )
      .select('tags note courseTopicId updatedAt')
      .lean();

    return res.json({
      success: true,
      data: {
        courseId,
        studentId,
        courseTopicId: courseTopicId || null,
        tags: updated?.tags || [],
        note: updated?.note || '',
        updatedAt: updated?.updatedAt || null,
      },
    });
  } catch (e) {
    // Handle unique index collisions gracefully
    if (e?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Note already exists', code: 'CONFLICT' });
    }
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/tree — course → topics → modules → milestones with attempt badges */
router.get('/courses/:courseId/tree', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getTreeAnalytics(req.params.courseId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/milestones — flat ranked-hardest milestone stats */
router.get('/courses/:courseId/milestones', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getMilestoneStats(req.params.courseId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/at-risk — students flagged by attempt patterns */
router.get('/courses/:courseId/at-risk', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const threshold = req.query.passRateThreshold != null
      ? Math.max(0, Math.min(100, parseInt(req.query.passRateThreshold, 10)))
      : 60;
    const data = await getAtRiskStudents(req.params.courseId, {
      ...parseSyntheticFlag(req),
      passRateThreshold: Number.isFinite(threshold) ? threshold : 60,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/heatmap — topic × student pass-rate grid */
router.get('/courses/:courseId/heatmap', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getTopicStudentHeatmap(req.params.courseId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/overview — cross-course KPIs for the instructor home */
router.get('/overview', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const data = await getCrossCourseKPIs(req.userId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
