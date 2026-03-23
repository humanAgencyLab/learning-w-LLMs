const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseTopic = require('../models/CourseTopic');
const logger = require('../utils/logger');

/**
 * Load course by :courseId param and ensure req.user is the instructor owner.
 * Sets req.course for handlers.
 */
async function requireCourseOwner(req, res, next) {
  try {
    const courseId = req.params.courseId;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course id',
        code: 'VALIDATION_ERROR'
      });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found',
        code: 'NOT_FOUND'
      });
    }
    if (course.instructorId.toString() !== req.userId) {
      logger.warn({
        requestId: req.requestId,
        userId: req.userId,
        courseId,
        ownerId: course.instructorId.toString()
      }, 'Course ownership denied');
      return res.status(403).json({
        success: false,
        error: 'You do not own this course',
        code: 'FORBIDDEN'
      });
    }
    req.course = course;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Load topic by :topicId, ensure it belongs to :courseId and instructor owns the course.
 * Sets req.course and req.courseTopic for handlers.
 */
async function requireCourseTopicOwner(req, res, next) {
  try {
    const { courseId, topicId } = req.params;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course id',
        code: 'VALIDATION_ERROR'
      });
    }
    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid topic id',
        code: 'VALIDATION_ERROR'
      });
    }
    const topic = await CourseTopic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        error: 'Topic not found',
        code: 'NOT_FOUND'
      });
    }
    if (topic.courseId.toString() !== courseId) {
      return res.status(400).json({
        success: false,
        error: 'Topic does not belong to this course',
        code: 'VALIDATION_ERROR'
      });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found',
        code: 'NOT_FOUND'
      });
    }
    if (course.instructorId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this course',
        code: 'FORBIDDEN'
      });
    }
    req.course = course;
    req.courseTopic = topic;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireCourseOwner,
  requireCourseTopicOwner
};
