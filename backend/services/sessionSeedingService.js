const mongoose = require('mongoose');
const Session = require('../models/Session');
const User = require('../models/User');
const { userProfileToSessionProfile } = require('../utils/userProfileToSessionProfile');

/**
 * Map instructor topic module difficulty to session plan enum (adds challenge unused).
 */
function mapDifficulty(d) {
  if (d === 'intro' || d === 'apply') return d;
  return 'core';
}

/**
 * Build Session.plan[] from a published CourseTopic document.
 */
function topicModulesToPlan(modules) {
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('Topic has no modules to seed');
  }
  return modules.map((m, idx) => ({
    id: m.moduleId,
    title: m.title,
    description: m.description || m.title,
    status: idx === 0 ? 'in_progress' : 'locked',
    milestones: (m.milestones || []).map((ms) => ({
      text: ms.text,
      completed: false
    })),
    completedMilestones: [],
    points: typeof m.points === 'number' ? m.points : 10,
    difficulty: mapDifficulty(m.difficulty),
    quizPattern: m.quizPattern && Object.keys(m.quizPattern).length ? m.quizPattern : undefined
  }));
}

/**
 * Create a new session for a student starting a course topic: learning phase, plan approved.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {import('mongoose').Document} opts.topic - CourseTopic mongoose doc
 * @param {string} opts.courseId
 * @param {string} opts.enrollmentId
 * @returns {Promise<import('mongoose').Document>}
 */
async function seedSessionForCourseTopic({ userId, topic, courseId, enrollmentId }) {
  const plan = topicModulesToPlan(topic.modules);
  const firstModuleId = plan[0].id;

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found for session seeding');
  }
  const profile = userProfileToSessionProfile(user);

  const session = new Session({
    userId: new mongoose.Types.ObjectId(userId),
    phase: 'learning',
    planApproved: true,
    clarifyCount: 0,
    mode: 'studying',
    topic: topic.title,
    chatTitle: topic.title,
    plan,
    activeModuleId: firstModuleId,
    points: 0,
    gems: 0,
    isViewOnly: false,
    progressPct: 0,
    profile,
    courseId: new mongoose.Types.ObjectId(courseId),
    courseTopicId: topic._id,
    enrollmentId: new mongoose.Types.ObjectId(enrollmentId),
    messages: [],
    quizAttempts: [],
    meta: {
      countSinceLastCheck: 0,
      outstandingCheck: null,
      summaryVersion: 0,
      summarizedUpToIndex: 0,
      assessClarifyCount: 0,
      contextSummary: null,
      contextSummaryUpdated: null,
      currentMilestoneIndex: 0,
      milestoneBeingTaught: false,
      milestoneRetryCount: {},
      milestonesToReview: []
    }
  });

  await session.save();
  return session;
}

module.exports = {
  topicModulesToPlan,
  seedSessionForCourseTopic
};
