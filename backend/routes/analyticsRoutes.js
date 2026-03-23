const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const { requireCourseOwner } = require('../middleware/instructorOwnership');
const { getCourseAnalytics, getStudentProgress } = require('../services/analyticsService');
const { runStruggleSummary } = require('../agents/struggleSummaryAgent');

const router = express.Router();

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

module.exports = router;
