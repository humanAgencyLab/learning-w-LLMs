const mongoose = require('mongoose');

// Event log of every milestone answer a student submits. One row per attempt.
// Read-side: milestoneAnalyticsService aggregates these for the instructor dashboard.
// Write-side: emitted from chatRoutes after each assessment analysis, and from the
// backfill script for historical Session.completedMilestones data.
const MilestoneAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    courseTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseTopic',
      default: null,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    moduleId: {
      type: String,
      default: null,
    },
    milestoneIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    milestoneText: {
      type: String,
      default: '',
    },
    passed: {
      type: Boolean,
      required: true,
    },
    // True when the system forced advancement after repeated wrong answers.
    autoAdvanced: {
      type: Boolean,
      default: false,
    },
    attemptNumber: {
      type: Number,
      default: 1,
      min: 1,
    },
    // Mirrors User.profile.isSynthetic at write time so analytics can filter
    // without a join.
    isSynthetic: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

MilestoneAttemptSchema.index({ courseId: 1, courseTopicId: 1, milestoneIndex: 1 });
MilestoneAttemptSchema.index({ userId: 1, courseId: 1 });
MilestoneAttemptSchema.index({ courseId: 1, createdAt: 1 });

module.exports = mongoose.model('MilestoneAttempt', MilestoneAttemptSchema);
