const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const { requireCourseOwner } = require('../middleware/instructorOwnership');
const { getCourseAnalytics } = require('../services/analyticsService');

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

module.exports = router;
