const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Session = require('../models/Session');
const CourseTopic = require('../models/CourseTopic');

/**
 * @param {string} courseId
 */
async function getCourseAnalytics(courseId) {
  const topics = await CourseTopic.find({ courseId }).select('_id title status orderIndex').lean();
  const enrollmentCount = await Enrollment.countDocuments({ courseId, status: 'active' });
  const sessions = await Session.find({
    courseId: new mongoose.Types.ObjectId(courseId)
  })
    .select('courseTopicId phase progressPct quizAttempts')
    .lean();

  const byTopic = {};
  for (const t of topics) {
    byTopic[t._id.toString()] = {
      topicId: t._id.toString(),
      title: t.title,
      status: t.status,
      startedSessions: 0,
      completedSessions: 0,
      quizAttempts: 0,
      quizPasses: 0
    };
  }

  for (const s of sessions) {
    const tid = s.courseTopicId ? s.courseTopicId.toString() : null;
    if (!tid || !byTopic[tid]) continue;
    byTopic[tid].startedSessions += 1;
    if (s.phase === 'completed' || (s.progressPct != null && s.progressPct >= 100)) {
      byTopic[tid].completedSessions += 1;
    }
    for (const a of s.quizAttempts || []) {
      if (a.status === 'submitted') {
        byTopic[tid].quizAttempts += 1;
        if (a.passed) byTopic[tid].quizPasses += 1;
      }
    }
  }

  const topicStats = Object.values(byTopic);
  const totalStarted = sessions.length;
  const totalCompleted = sessions.filter((s) => s.phase === 'completed' || (s.progressPct != null && s.progressPct >= 100)).length;

  return {
    courseId,
    enrollmentCount,
    sessionCount: totalStarted,
    completedSessionCount: totalCompleted,
    completionRate: totalStarted ? Math.round((totalCompleted / totalStarted) * 1000) / 10 : 0,
    topics: topicStats
  };
}

module.exports = { getCourseAnalytics };
