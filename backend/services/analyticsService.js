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
    .select('studentId joinedAt priorKnowledge')
    .lean();

  const userIds = enrollments.map((e) => e.studentId);
  const [users, sessions, topics] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('name username avatarUrl').lean(),
    Session.find({ courseId: new mongoose.Types.ObjectId(courseId), userId: { $in: userIds } })
      .select('userId courseTopicId phase progressPct quizAttempts points updatedAt')
      .sort({ updatedAt: -1 })
      .lean(),
    CourseTopic.find({ courseId }).select('_id title status').lean(),
  ]);

  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = u;

  const topicMap = {};
  for (const t of topics) topicMap[t._id.toString()] = t.title;

  // B9: topic-level pass rate uses published topics as the denominator —
  // students only ever work published topics, so that's "the syllabus" the
  // instructor expects a 100% to be measured against.
  const publishedTopicIds = new Set(
    topics.filter((t) => t.status === 'published').map((t) => t._id.toString()),
  );
  const publishedCount = publishedTopicIds.size;

  // B9: "at-risk" is owned by getAtRiskStudents — the canonical, flag-based
  // definition the dashboard tile and the Insights panel already use. Student
  // Progress must report the SAME set instead of its old quiz-pass-rate < 60
  // heuristic (that's what made the header say "2 struggling" while the
  // dashboard/Insights said "5 at-risk"). excludeSynthetic:false because the
  // synthetic cohort IS the study data (matches the "Include synthetic
  // cohort" default everywhere else).
  let atRiskIds = new Set();
  try {
    const { getAtRiskStudents } = require('./milestoneAnalyticsService');
    const atRiskRows = await getAtRiskStudents(courseId, { excludeSynthetic: false });
    atRiskIds = new Set(atRiskRows.filter((r) => r.atRisk).map((r) => r.studentId));
  } catch (e) {
    // Non-fatal: never 500 the whole roster if the risk computation hiccups.
    atRiskIds = new Set();
  }

  const rows = enrollments.map((en) => {
    const uid = en.studentId.toString();
    const user = userMap[uid] || {};
    const studentSessions = sessions.filter((s) => s.userId?.toString() === uid);

    let totalPoints = 0;
    // We'll count completed topics after we build the per-topic map to avoid double counting.
    let quizAttempts = 0;
    let quizPasses = 0;
    const topicProgress = {};

    for (const s of studentSessions) {
      totalPoints += s.points || 0;
      const tid = s.courseTopicId?.toString();
      if (tid) {
        // Keep the latest session per topic (sessions are sorted by updatedAt desc, but keep guardrails).
        const prev = topicProgress[tid];
        const prevTs = prev?.updatedAt ? new Date(prev.updatedAt).getTime() : -1;
        const curTs = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
        if (!prev || curTs >= prevTs) {
          const isComplete = s.phase === 'completed' || (s.progressPct != null && s.progressPct >= 100);
          // B9: did the student pass this topic's terminal quiz? Take the most
          // recent submitted, non-revision attempt in this (latest) session —
          // i.e. the last quiz they engaged with for the topic.
          let topicPassed = false;
          let terminalTs = -1;
          for (const a of s.quizAttempts || []) {
            if (a.status !== 'submitted' || a.isRevision) continue;
            const ats = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
            if (ats >= terminalTs) { terminalTs = ats; topicPassed = a.passed === true; }
          }
          topicProgress[tid] = {
            topicId: tid,
            topicTitle: topicMap[tid] || 'Unknown',
            progressPct: s.progressPct || 0,
            phase: s.phase,
            completed: isComplete,
            topicPassed,
            updatedAt: s.updatedAt || null,
          };
        }
      }
      for (const a of s.quizAttempts || []) {
        if (a.status === 'submitted') {
          quizAttempts++;
          if (a.passed) quizPasses++;
        }
      }
    }

    const completedTopics = Object.values(topicProgress).filter((tp) => tp.completed).length;
    // B9: topic pass rate = published topics whose terminal quiz the student
    // passed, over the published-topic count. Distinct from quizPassRate,
    // which is attempt-level (passed attempts / submitted attempts).
    const passedTopics = Object.values(topicProgress).filter(
      (tp) => tp.topicPassed && publishedTopicIds.has(tp.topicId),
    ).length;
    const topicPassRate = publishedCount > 0 ? Math.round((passedTopics / publishedCount) * 100) : null;

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
      // Attempt-level: kept for internal use / back-compat. The UI no longer
      // surfaces this on Student Progress (it shows topicPassRate instead).
      quizPassRate: quizAttempts > 0 ? Math.round((quizPasses / quizAttempts) * 100) : null,
      topicPassRate,
      atRisk: atRiskIds.has(uid),
      topicProgress: Object.values(topicProgress),
    };
  });

  return { courseId, students: rows };
}

/**
 * Instructor drill-down: detailed monitoring for a single student within a course.
 *
 * @param {string} courseId
 * @param {string} studentId
 */
async function getInstructorStudentDetail(courseId, studentId) {
  const User = require('../models/User');

  const courseObjId = new mongoose.Types.ObjectId(courseId);
  const studentObjId = new mongoose.Types.ObjectId(studentId);

  const [enrollment, user, topics, sessions] = await Promise.all([
    Enrollment.findOne({ courseId: courseObjId, studentId: studentObjId, status: 'active' })
      .select('studentId joinedAt priorKnowledge')
      .lean(),
    User.findById(studentObjId).select('name username avatarUrl').lean(),
    CourseTopic.find({ courseId: courseObjId }).select('_id title orderIndex status').sort({ orderIndex: 1 }).lean(),
    Session.find({ courseId: courseObjId, userId: studentObjId })
      .select('courseTopicId phase progressPct quizAttempts points activeModuleId plan meta updatedAt createdAt enrollmentId')
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  if (!enrollment) {
    return {
      courseId,
      student: null,
      error: 'STUDENT_NOT_ENROLLED',
    };
  }

  const topicTitleMap = new Map(topics.map((t) => [t._id.toString(), t.title]));
  const topicOrderMap = new Map(topics.map((t) => [t._id.toString(), t.orderIndex ?? 0]));
  // B9: published topics are the denominator for topic pass rate (same as
  // Student Progress) so the per-student Monitor metric matches the roster.
  const publishedTopicIds = new Set(
    topics.filter((t) => t.status === 'published').map((t) => t._id.toString()),
  );
  const publishedCount = publishedTopicIds.size;

  let totalPoints = 0;
  let quizAttempts = 0;
  let quizPasses = 0;
  let lastActiveAt = null;

  const byTopic = new Map(); // topicId -> latest session summary

  for (const s of sessions) {
    totalPoints += s.points || 0;
    if (!lastActiveAt || (s.updatedAt && new Date(s.updatedAt) > new Date(lastActiveAt))) {
      lastActiveAt = s.updatedAt || lastActiveAt;
    }

    for (const a of s.quizAttempts || []) {
      if (a.status === 'submitted') {
        quizAttempts++;
        if (a.passed) quizPasses++;
      }
    }

    const tid = s.courseTopicId?.toString();
    if (!tid) continue;
    if (byTopic.has(tid)) continue; // sessions sorted by updatedAt desc

    const modules = Array.isArray(s.plan) ? s.plan : [];
    const totalMilestones = modules.reduce((sum, m) => sum + (m.milestones?.length || 0), 0);
    const completedMilestones = modules.reduce((sum, m) => sum + (m.milestones?.filter((ms) => ms.completed).length || 0), 0);
    const moduleCount = modules.length;
    const passedModules = modules.filter((m) => m.status === 'passed').length;

    const completed = s.phase === 'completed' || (s.progressPct != null && s.progressPct >= 100);

    // B9: did the student pass this topic's terminal quiz? (most recent
    // submitted, non-revision attempt in the latest session for the topic)
    let topicPassed = false;
    let terminalTs = -1;
    for (const a of s.quizAttempts || []) {
      if (a.status !== 'submitted' || a.isRevision) continue;
      const ats = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      if (ats >= terminalTs) { terminalTs = ats; topicPassed = a.passed === true; }
    }

    byTopic.set(tid, {
      courseTopicId: tid,
      topicTitle: topicTitleMap.get(tid) || 'Unknown',
      orderIndex: topicOrderMap.get(tid) ?? 0,
      sessionId: s._id?.toString?.() || String(s._id),
      phase: s.phase,
      progressPct: s.progressPct || 0,
      activeModuleId: s.activeModuleId || null,
      updatedAt: s.updatedAt || null,
      createdAt: s.createdAt || null,
      completed,
      topicPassed,
      moduleCount,
      passedModules,
      totalMilestones,
      completedMilestones,
      currentMilestoneIndex: s.meta?.currentMilestoneIndex ?? 0,
      outstandingCheck: s.meta?.outstandingCheck ?? null,
    });
  }

  const topicsDetail = Array.from(byTopic.values()).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  const completedTopics = topicsDetail.filter((t) => t.completed).length;
  // B9: topic pass rate — published topics whose terminal quiz the student
  // passed / published-topic count. Same definition as Student Progress.
  const passedTopics = topicsDetail.filter(
    (t) => t.topicPassed && publishedTopicIds.has(t.courseTopicId),
  ).length;
  const topicPassRate = publishedCount > 0 ? Math.round((passedTopics / publishedCount) * 100) : null;

  const quizPassRate = quizAttempts > 0 ? Math.round((quizPasses / quizAttempts) * 100) : null;

  // Risk flags (simple heuristics; can iterate later)
  const riskFlags = [];
  if (lastActiveAt) {
    const daysInactive = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysInactive >= 7) riskFlags.push({ type: 'inactive', daysInactive });
  }
  if (quizAttempts >= 3 && quizPassRate != null && quizPassRate < 50) {
    riskFlags.push({ type: 'low_quiz_pass_rate', quizPassRate });
  }

  return {
    courseId,
    student: {
      userId: enrollment.studentId.toString(),
      name: user?.name || user?.username || 'Student',
      avatarUrl: user?.avatarUrl || null,
      joinedAt: enrollment.joinedAt,
      priorKnowledge: enrollment.priorKnowledge || null,
      lastActiveAt,
    },
    summary: {
      sessionsStarted: sessions.length,
      completedTopics,
      totalTopics: topics.length,
      totalPoints,
      quizAttempts,
      quizPasses,
      quizPassRate,
      riskFlags,
    },
    topics: topicsDetail,
  };
}

function isSessionComplete(s) {
  return s.phase === 'completed' || (s.progressPct != null && s.progressPct >= 100);
}

function attemptSortKey(a) {
  const t = a.submittedAt || a.createdAt;
  const ts = t ? new Date(t).getTime() : 0;
  return [ts, a.attemptNo || 0];
}

function medianSorted(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Instructor performance summary (separate from lightweight getCourseAnalytics for dashboard use).
 *
 * @param {string} courseId
 */
async function getCoursePerformanceSummary(courseId) {
  const courseObjId = new mongoose.Types.ObjectId(courseId);

  const [enrollments, topics] = await Promise.all([
    Enrollment.find({ courseId: courseObjId, status: 'active' }).select('studentId').lean(),
    CourseTopic.find({ courseId: courseObjId })
      .select('_id title orderIndex status modules')
      .sort({ orderIndex: 1 })
      .lean(),
  ]);

  const userIds = enrollments.map((e) => e.studentId);
  const userIdStrs = new Set(userIds.map((id) => id.toString()));

  const publishedTopicIds = new Set(topics.filter((t) => t.status === 'published').map((t) => t._id.toString()));
  const publishedTopicCount = publishedTopicIds.size;

  let maxCoursePoints = 0;
  for (const t of topics) {
    if (t.status !== 'published') continue;
    for (const m of t.modules || []) {
      maxCoursePoints += m.points || 0;
    }
  }
  if (maxCoursePoints <= 0) {
    for (const t of topics) {
      for (const m of t.modules || []) {
        maxCoursePoints += m.points || 0;
      }
    }
  }

  const sessions =
    userIds.length === 0
      ? []
      : await Session.find({ courseId: courseObjId, userId: { $in: userIds } })
          .select('userId courseTopicId phase progressPct updatedAt createdAt quizAttempts points')
          .lean();

  /** @type {Map<string, object>} */
  const latestByUserTopic = new Map();
  for (const s of sessions) {
    const uid = s.userId?.toString();
    const tid = s.courseTopicId?.toString();
    if (!uid || !tid || !userIdStrs.has(uid)) continue;
    const key = `${uid}_${tid}`;
    const prev = latestByUserTopic.get(key);
    const curTs = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    const prevTs = prev?.updatedAt ? new Date(prev.updatedAt).getTime() : -1;
    if (!prev || curTs >= prevTs) latestByUserTopic.set(key, s);
  }

  // --- Funnel (published topics only); sessions only on unpublished topics => notStarted ---
  const funnel = { notStarted: 0, inProgress: 0, partiallyComplete: 0, fullyComplete: 0 };
  if (publishedTopicCount > 0) {
    for (const uid of userIds.map((id) => id.toString())) {
      let completedPublished = 0;
      let hasAnyPublishedSession = false;
      for (const ptid of publishedTopicIds) {
        const s = latestByUserTopic.get(`${uid}_${ptid}`);
        if (s) {
          hasAnyPublishedSession = true;
          if (isSessionComplete(s)) completedPublished += 1;
        }
      }
      if (!hasAnyPublishedSession) funnel.notStarted += 1;
      else if (completedPublished === 0) funnel.inProgress += 1;
      else if (completedPublished === publishedTopicCount) funnel.fullyComplete += 1;
      else funnel.partiallyComplete += 1;
    }
  }

  // --- Score distribution (per student: quiz mean scorePct if any; else normalized latest-session points) ---
  const SCORE_BUCKETS = [
    { label: '0–59', min: 0, max: 59 },
    { label: '60–69', min: 60, max: 69 },
    { label: '70–79', min: 70, max: 79 },
    { label: '80–89', min: 80, max: 89 },
    { label: '90–100', min: 90, max: 100 },
  ];

  const scoreHistogram = SCORE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let anyStudentUsedQuizScores = false;
  let anyStudentUsedPointsFallback = false;

  for (const uid of userIds.map((id) => id.toString())) {
    const attemptScores = [];
    for (const s of sessions) {
      if (s.userId?.toString() !== uid) continue;
      for (const a of s.quizAttempts || []) {
        if (a.status !== 'submitted' || a.isRevision) continue;
        if (a.scorePct != null && a.scorePct !== undefined && !Number.isNaN(Number(a.scorePct))) {
          attemptScores.push(Number(a.scorePct));
        }
      }
    }

    let score0to100;
    if (attemptScores.length > 0) {
      anyStudentUsedQuizScores = true;
      score0to100 = attemptScores.reduce((x, y) => x + y, 0) / attemptScores.length;
    } else {
      anyStudentUsedPointsFallback = true;
      let sumPts = 0;
      for (const t of topics.filter((t) => t.status === 'published')) {
        const tid = t._id.toString();
        const ls = latestByUserTopic.get(`${uid}_${tid}`);
        if (ls) sumPts += ls.points || 0;
      }
      score0to100 =
        maxCoursePoints > 0 ? Math.min(100, (sumPts / maxCoursePoints) * 100) : sumPts > 0 ? 100 : 0;
    }

    const capped = Math.max(0, Math.min(100, score0to100));
    for (let i = 0; i < scoreHistogram.length; i++) {
      const b = scoreHistogram[i];
      if (capped >= b.min && capped <= b.max) {
        scoreHistogram[i].count += 1;
        break;
      }
    }
  }

  let scoreSourceMeta = 'none';
  if (userIds.length > 0) {
    if (anyStudentUsedQuizScores && anyStudentUsedPointsFallback) scoreSourceMeta = 'mixed';
    else if (anyStudentUsedQuizScores) scoreSourceMeta = 'quizScorePctMean';
    else scoreSourceMeta = 'sessionPointsSumNormalized';
  }

  // --- Quiz by topic (merge attempts across sessions per user+topic) ---
  const sessionsByUserTopic = new Map();
  for (const s of sessions) {
    const uid = s.userId?.toString();
    const tid = s.courseTopicId?.toString();
    if (!uid || !tid) continue;
    const k = `${uid}_${tid}`;
    if (!sessionsByUserTopic.has(k)) sessionsByUserTopic.set(k, []);
    sessionsByUserTopic.get(k).push(s);
  }

  const quizByTopic = topics.map((t) => {
    const tid = t._id.toString();
    const mergedAttempts = [];
    for (const uid of userIds.map((id) => id.toString())) {
      const list = sessionsByUserTopic.get(`${uid}_${tid}`) || [];
      for (const s of list) {
        for (const a of s.quizAttempts || []) {
          if (a.status === 'submitted' && !a.isRevision) mergedAttempts.push({ userId: uid, attempt: a });
        }
      }
    }
    mergedAttempts.sort((x, y) => {
      const ax = attemptSortKey(x.attempt);
      const ay = attemptSortKey(y.attempt);
      if (ax[0] !== ay[0]) return ax[0] - ay[0];
      return ax[1] - ay[1];
    });

    const byUser = new Map();
    for (const row of mergedAttempts) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, []);
      byUser.get(row.userId).push(row.attempt);
    }

    let sumAttemptsToPass = 0;
    let countPassedUsers = 0;
    let firstAttemptPassCount = 0;
    let usersWithAttempts = 0;
    let neverPassedCount = 0;

    for (const [, attempts] of byUser) {
      usersWithAttempts += 1;
      const first = attempts[0];
      if (first && first.passed === true) firstAttemptPassCount += 1;

      const firstPassIdx = attempts.findIndex((a) => a.passed === true);
      if (firstPassIdx >= 0) {
        sumAttemptsToPass += firstPassIdx + 1;
        countPassedUsers += 1;
      } else {
        neverPassedCount += 1;
      }
    }

    return {
      topicId: tid,
      title: t.title,
      orderIndex: t.orderIndex ?? 0,
      status: t.status,
      avgAttemptsToPass: countPassedUsers > 0 ? Math.round((sumAttemptsToPass / countPassedUsers) * 10) / 10 : null,
      firstAttemptPassRate: usersWithAttempts > 0 ? Math.round((firstAttemptPassCount / usersWithAttempts) * 1000) / 10 : null,
      neverPassedRate: usersWithAttempts > 0 ? Math.round((neverPassedCount / usersWithAttempts) * 1000) / 10 : null,
      studentsWithAttempts: usersWithAttempts,
      studentsPassed: countPassedUsers,
    };
  });

  // --- Module quiz pass rate only (published topics) ---
  // Per-module roll-up of submitted, non-revision quiz attempts. Tracks:
  //   - studentsAttempted (denominator for passRate)
  //   - totalAttempts (used by frontend tryRatio = totalAttempts/studentsAttempted)
  //   - maxAttemptsByOne (highest attempt count for any single student)
  const moduleDifficulty = [];
  for (const t of topics) {
    if (t.status !== 'published') continue;
    const tid = t._id.toString();
    for (const mod of t.modules || []) {
      const mid = mod.moduleId;
      if (!mid) continue;
      const perUserAttempts = new Map();
      const passed = new Set();
      for (const uid of userIds.map((id) => id.toString())) {
        const list = sessionsByUserTopic.get(`${uid}_${tid}`) || [];
        let userCount = 0;
        let userPassed = false;
        for (const s of list) {
          for (const a of s.quizAttempts || []) {
            if (a.status !== 'submitted' || a.isRevision) continue;
            if (a.moduleId !== mid) continue;
            userCount += 1;
            if (a.passed === true) userPassed = true;
          }
        }
        if (userCount > 0) perUserAttempts.set(uid, userCount);
        if (userPassed) passed.add(uid);
      }
      const na = perUserAttempts.size;
      const totalAttempts = Array.from(perUserAttempts.values()).reduce((a, b) => a + b, 0);
      const maxAttemptsByOne = na > 0 ? Math.max(...perUserAttempts.values()) : 0;
      moduleDifficulty.push({
        topicId: tid,
        topicTitle: t.title,
        moduleId: mid,
        moduleTitle: mod.title || mid,
        studentsAttempted: na,
        totalAttempts,
        maxAttemptsByOne,
        passRate: na > 0 ? Math.round((passed.size / na) * 1000) / 10 : null,
      });
    }
  }

  // --- Time to completion (latest session per user per topic when complete) ---
  const timeToCompleteByTopic = topics.map((t) => {
    const tid = t._id.toString();
    const durations = [];
    for (const uid of userIds.map((id) => id.toString())) {
      const s = latestByUserTopic.get(`${uid}_${tid}`);
      if (!s || !isSessionComplete(s)) continue;
      const c0 = s.createdAt ? new Date(s.createdAt).getTime() : null;
      const c1 = s.updatedAt ? new Date(s.updatedAt).getTime() : null;
      if (c0 == null || c1 == null) continue;
      const d = c1 - c0;
      if (d >= 0) durations.push(d);
    }
    durations.sort((a, b) => a - b);
    return {
      topicId: tid,
      title: t.title,
      orderIndex: t.orderIndex ?? 0,
      sampleSize: durations.length,
      medianMs: durations.length ? Math.round(medianSorted(durations)) : null,
      avgMs: durations.length ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length) : null,
    };
  });

  // --- Weekly engagement: session starts by UTC weekday of createdAt ---
  const dowCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const dowLabels = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
  for (const s of sessions) {
    if (!s.createdAt) continue;
    const d = new Date(s.createdAt).getUTCDay();
    const iso = d === 0 ? 7 : d;
    dowCounts[iso] = (dowCounts[iso] || 0) + 1;
  }
  const weeklyEngagement = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    isoDayOfWeek: d,
    label: dowLabels[d],
    sessionCount: dowCounts[d] || 0,
  }));

  return {
    courseId,
    funnelTopicScope: 'published',
    publishedTopicCount,
    enrollmentCount: userIds.length,
    funnel,
    scoreDistribution: {
      scoreSource: scoreSourceMeta,
      maxCoursePointsUsedForNormalization: maxCoursePoints,
      buckets: scoreHistogram,
      studentsIncluded: userIds.length,
    },
    quizByTopic,
    moduleDifficulty,
    timeToCompleteByTopic,
    weeklyEngagement,
  };
}

module.exports = {
  getCourseAnalytics,
  getStudentProgress,
  getInstructorStudentDetail,
  getCoursePerformanceSummary,
};
