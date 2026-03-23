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

/**
 * Per-student progress for a course.
 * Returns one row per enrolled student with their session stats.
 */
async function getStudentProgress(courseId) {
  const User = require('../models/User');

  const enrollments = await Enrollment.find({ courseId, status: 'active' })
    .select('userId joinedAt priorKnowledge')
    .lean();

  const userIds = enrollments.map((e) => e.userId);
  const [users, sessions, topics] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('name username avatarUrl').lean(),
    Session.find({ courseId: new mongoose.Types.ObjectId(courseId), userId: { $in: userIds } })
      .select('userId courseTopicId phase progressPct quizAttempts points')
      .lean(),
    CourseTopic.find({ courseId }).select('_id title').lean(),
  ]);

  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = u;

  const topicMap = {};
  for (const t of topics) topicMap[t._id.toString()] = t.title;

  const rows = enrollments.map((en) => {
    const uid = en.userId.toString();
    const user = userMap[uid] || {};
    const studentSessions = sessions.filter((s) => s.userId?.toString() === uid);

    let totalPoints = 0;
    let completedTopics = 0;
    let quizAttempts = 0;
    let quizPasses = 0;
    const topicProgress = {};

    for (const s of studentSessions) {
      totalPoints += s.points || 0;
      const tid = s.courseTopicId?.toString();
      if (tid) {
        const isComplete = s.phase === 'completed' || (s.progressPct != null && s.progressPct >= 100);
        topicProgress[tid] = {
          topicId: tid,
          topicTitle: topicMap[tid] || 'Unknown',
          progressPct: s.progressPct || 0,
          phase: s.phase,
          completed: isComplete,
        };
        if (isComplete) completedTopics++;
      }
      for (const a of s.quizAttempts || []) {
        if (a.status === 'submitted') {
          quizAttempts++;
          if (a.passed) quizPasses++;
        }
      }
    }

    return {
      userId: uid,
      name: user.name || user.username || 'Student',
      avatarUrl: user.avatarUrl || null,
      joinedAt: en.joinedAt,
      priorKnowledge: en.priorKnowledge || null,
      sessionsStarted: studentSessions.length,
      completedTopics,
      totalTopics: topics.length,
      totalPoints,
      quizAttempts,
      quizPasses,
      quizPassRate: quizAttempts > 0 ? Math.round((quizPasses / quizAttempts) * 100) : null,
      topicProgress: Object.values(topicProgress),
    };
  });

  return { courseId, students: rows };
}

module.exports = { getCourseAnalytics, getStudentProgress };
