const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');

/**
 * Requires :courseId and active enrollment for req.userId.
 * Sets req.enrollment.
 */
async function requireEnrolledStudent(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course id',
        code: 'VALIDATION_ERROR'
      });
    }
    const enrollment = await Enrollment.findOne({
      studentId: req.userId,
      courseId,
      status: 'active'
    });
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        error: 'Not enrolled in this course',
        code: 'NOT_ENROLLED'
      });
    }

    // If the instructor archived/deleted the course, students should lose access.
    const course = await Course.findById(courseId).select('status');
    if (!course || course.status === 'archived') {
      return res.status(403).json({
        success: false,
        error: 'Not enrolled in this course',
        code: 'NOT_ENROLLED'
      });
    }
    req.enrollment = enrollment;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireEnrolledStudent };
