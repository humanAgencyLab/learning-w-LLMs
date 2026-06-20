const mongoose = require('mongoose');
const MilestoneAttempt = require('../models/MilestoneAttempt');
const CourseTopic = require('../models/CourseTopic');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Session = require('../models/Session');

// Shared: build a MilestoneAttempt filter for a course, optionally excluding
// synthetic-user rows. The professor-study dashboards default to
// excludeSynthetic=false (synthetic cohort IS the study data), while
// real-class views default to true.
function attemptFilter(courseId, { excludeSynthetic = true } = {}) {
  const f = { courseId: new mongoose.Types.ObjectId(courseId) };
  if (excludeSynthetic) f.isSynthetic = { $ne: true };
  return f;
}

/**
 * Tree-shaped analytics for the instructor Insights page:
 *   course → topics → modules → milestones, each with attempt/pass counts.
 *
 * Uses a single aggregation on MilestoneAttempt grouped by
 * (courseTopicId, moduleId, milestoneIndex), then joins the result onto
 * the CourseTopic structural tree.
 */
async function getTreeAnalytics(courseId, { excludeSynthetic = true } = {}) {
  const [topics, grouped] = await Promise.all([
    CourseTopic.find({ courseId })
      .select('_id title orderIndex status modules')
      .sort({ orderIndex: 1 })
      .lean(),
    MilestoneAttempt.aggregate([
      { $match: attemptFilter(courseId, { excludeSynthetic }) },
      // Stage 1: per-(milestone, user) totals so we can compute the "highest
      // attempt count by any single student" — needed for the new milestone
      // badges that drop noisy raw attempts in favor of max + ratio.
      {
        $group: {
          _id: {
            courseTopicId: '$courseTopicId',
            moduleId: '$moduleId',
            milestoneIndex: '$milestoneIndex',
            userId: '$userId',
          },
          perUserAttempts: { $sum: 1 },
          perUserPasses: { $sum: { $cond: ['$passed', 1, 0] } },
          perUserAutoAdv: { $sum: { $cond: ['$autoAdvanced', 1, 0] } },
        },
      },
      // Stage 2: roll the per-user numbers up to the milestone level.
      {
        $group: {
          _id: {
            courseTopicId: '$_id.courseTopicId',
            moduleId: '$_id.moduleId',
            milestoneIndex: '$_id.milestoneIndex',
          },
          attempts: { $sum: '$perUserAttempts' },
          passes: { $sum: '$perUserPasses' },
          autoAdvanced: { $sum: '$perUserAutoAdv' },
          maxAttemptsByOne: { $max: '$perUserAttempts' },
          studentCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Index rollup by "topicId|moduleId|milestoneIndex"
  const key = (tid, mid, mi) => `${tid || ''}|${mid || ''}|${mi}`;
  const statMap = new Map();
  for (const row of grouped) {
    const k = key(row._id.courseTopicId?.toString(), row._id.moduleId, row._id.milestoneIndex);
    statMap.set(k, {
      attempts: row.attempts,
      passes: row.passes,
      autoAdvanced: row.autoAdvanced,
      maxAttemptsByOne: row.maxAttemptsByOne || 0,
      studentCount: row.studentCount || 0,
    });
  }

  const tree = topics.map((topic) => {
    const tid = topic._id.toString();
    const modules = (topic.modules || []).map((mod) => {
      const milestones = (mod.milestones || []).map((ms, idx) => {
        const s = statMap.get(key(tid, mod.moduleId, idx)) || {
          attempts: 0,
          passes: 0,
          autoAdvanced: 0,
          maxAttemptsByOne: 0,
          studentCount: 0,
        };
        const passRate = s.attempts ? Math.round((s.passes / s.attempts) * 1000) / 10 : 0;
        return {
          milestoneIndex: idx,
          text: ms.text,
          attempts: s.attempts,
          passes: s.passes,
          autoAdvanced: s.autoAdvanced,
          maxAttemptsByOne: s.maxAttemptsByOne,
          studentCount: s.studentCount,
          passRate,
        };
      });
      const modAttempts = milestones.reduce((a, m) => a + m.attempts, 0);
      const modPasses = milestones.reduce((a, m) => a + m.passes, 0);
      return {
        moduleId: mod.moduleId,
        title: mod.title,
        difficulty: mod.difficulty,
        milestones,
        totals: {
          attempts: modAttempts,
          passes: modPasses,
          passRate: modAttempts ? Math.round((modPasses / modAttempts) * 1000) / 10 : 0,
        },
      };
    });
    const topAttempts = modules.reduce((a, m) => a + m.totals.attempts, 0);
    const topPasses = modules.reduce((a, m) => a + m.totals.passes, 0);
    return {
      courseTopicId: tid,
      title: topic.title,
      status: topic.status,
      orderIndex: topic.orderIndex,
      modules,
      totals: {
        attempts: topAttempts,
        passes: topPasses,
        passRate: topAttempts ? Math.round((topPasses / topAttempts) * 1000) / 10 : 0,
      },
    };
  });

  const courseTotals = tree.reduce(
    (acc, t) => ({
      attempts: acc.attempts + t.totals.attempts,
      passes: acc.passes + t.totals.passes,
    }),
    { attempts: 0, passes: 0 }
  );

  return {
    courseId,
    totals: {
      ...courseTotals,
      passRate: courseTotals.attempts
        ? Math.round((courseTotals.passes / courseTotals.attempts) * 1000) / 10
        : 0,
    },
    topics: tree,
  };
}

/**
 * Flat milestone stats across the course — ranked-hardest view for the
 * drill-down bar chart. Includes topic title and module title for
 * human-readable labels.
 */
async function getMilestoneStats(courseId, { excludeSynthetic = true } = {}) {
  const topics = await CourseTopic.find({ courseId })
    .select('_id title modules')
    .lean();

  // Lookup: topicId -> moduleId -> {moduleTitle, milestoneText[]}
  const lookup = new Map();
  for (const t of topics) {
    const perModule = new Map();
    for (const m of t.modules || []) {
      perModule.set(m.moduleId, {
        title: m.title,
        milestones: (m.milestones || []).map((ms) => ms.text),
      });
    }
    lookup.set(t._id.toString(), { title: t.title, modules: perModule });
  }

  const grouped = await MilestoneAttempt.aggregate([
    { $match: attemptFilter(courseId, { excludeSynthetic }) },
    {
      $group: {
        _id: {
          courseTopicId: '$courseTopicId',
          moduleId: '$moduleId',
          milestoneIndex: '$milestoneIndex',
        },
        attempts: { $sum: 1 },
        passes: { $sum: { $cond: ['$passed', 1, 0] } },
        autoAdvanced: { $sum: { $cond: ['$autoAdvanced', 1, 0] } },
        uniqueUsers: { $addToSet: '$userId' },
        lastAttemptAt: { $max: '$createdAt' },
      },
    },
    { $sort: { attempts: -1 } },
  ]);

  return grouped.map((r) => {
    const tid = r._id.courseTopicId?.toString() || '';
    const topicEntry = lookup.get(tid);
    const modEntry = topicEntry?.modules.get(r._id.moduleId);
    const mText = modEntry?.milestones[r._id.milestoneIndex] || '';
    return {
      courseTopicId: tid,
      topicTitle: topicEntry?.title || '',
      moduleId: r._id.moduleId,
      moduleTitle: modEntry?.title || '',
      milestoneIndex: r._id.milestoneIndex,
      milestoneText: mText,
      attempts: r.attempts,
      passes: r.passes,
      failRate: r.attempts ? Math.round(((r.attempts - r.passes) / r.attempts) * 1000) / 10 : 0,
      passRate: r.attempts ? Math.round((r.passes / r.attempts) * 1000) / 10 : 0,
      autoAdvanced: r.autoAdvanced,
      studentCount: Array.isArray(r.uniqueUsers) ? r.uniqueUsers.length : 0,
      lastAttemptAt: r.lastAttemptAt,
    };
  });
}

/**
 * Students whose attempt patterns look "at risk":
 *   - pass rate below threshold, OR
 *   - any autoAdvanced milestone (system forced them forward), OR
 *   - attempts per passed milestone > 2 (lots of retries)
 *
 * Returns one row per enrolled student, sorted most-at-risk first.
 */
async function getAtRiskStudents(courseId, {
  excludeSynthetic = true,
  passRateThreshold = 60,
} = {}) {
  const enrollments = await Enrollment.find({ courseId, status: 'active' })
    .select('studentId joinedAt priorKnowledge')
    .lean();
  const userIds = enrollments.map((e) => e.studentId);
  if (!userIds.length) return [];

  const userSelect = 'name username avatarUrl profile.isSynthetic profile.personaTag profile.programmingExposure profile.selfConfidence';
  const users = await User.find({ _id: { $in: userIds } }).select(userSelect).lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const perStudent = await MilestoneAttempt.aggregate([
    { $match: attemptFilter(courseId, { excludeSynthetic }) },
    {
      $group: {
        _id: '$userId',
        attempts: { $sum: 1 },
        passes: { $sum: { $cond: ['$passed', 1, 0] } },
        autoAdvanced: { $sum: { $cond: ['$autoAdvanced', 1, 0] } },
        distinctMilestones: {
          $addToSet: {
            topicId: '$courseTopicId',
            moduleId: '$moduleId',
            milestoneIndex: '$milestoneIndex',
          },
        },
        lastAttemptAt: { $max: '$createdAt' },
      },
    },
  ]);
  const statMap = new Map(perStudent.map((s) => [s._id.toString(), s]));

  // Per-student mean quiz score (scorePct of submitted, non-revision attempts).
  // This is the SAME metric the score-distribution chart buckets on, so an
  // at-risk panel keyed off it stays consistent with what the instructor sees:
  // a student in the red score bucket is the one flagged at-risk. Milestone
  // pass rate alone misses them — they clear the reflection checks on retry but
  // still bomb the quizzes.
  const quizSessions = await Session.find({
    courseId: new mongoose.Types.ObjectId(courseId),
    userId: { $in: userIds },
  }).select('userId quizAttempts').lean();
  // INVARIANT: the at-risk panel's quiz numbers are computed over SUBMITTED,
  // NON-REVISION attempts only — the single source of truth. Drafts are
  // abandoned in-progress quizzes; revisions aren't module-completion attempts;
  // neither counts. Crucially, the average AND the pass rate are derived from
  // the SAME attempt set, so the two displayed numbers can never contradict
  // (e.g. 100% pass implies avg >= the 60% threshold). A student with zero such
  // attempts gets null for both (the UI renders that as "—"/"No quiz data").
  // This replaces an earlier bug where the row paired the quiz average with the
  // *milestone* attempts/pass-rate, producing impossible reads like
  // "20% quiz avg · 100% pass".
  const quizStatMap = new Map(); // uid -> { scores: number[], passed, count }
  for (const sess of quizSessions) {
    const uid = sess.userId?.toString();
    if (!uid) continue;
    for (const a of sess.quizAttempts || []) {
      if (a.status !== 'submitted' || a.isRevision) continue;
      if (!quizStatMap.has(uid)) quizStatMap.set(uid, { scores: [], passed: 0, count: 0 });
      const qs = quizStatMap.get(uid);
      qs.count += 1;
      if (a.passed === true) qs.passed += 1;
      if (a.scorePct != null && !Number.isNaN(Number(a.scorePct))) qs.scores.push(Number(a.scorePct));
    }
  }
  const quizStatsFor = (uid) => {
    const qs = quizStatMap.get(uid);
    if (!qs || qs.count === 0) return { quizScore: null, quizPassRate: null, quizAttemptCount: 0 };
    const quizScore = qs.scores.length
      ? Math.round((qs.scores.reduce((x, y) => x + y, 0) / qs.scores.length) * 10) / 10
      : null;
    const quizPassRate = Math.round((qs.passed / qs.count) * 1000) / 10;
    return { quizScore, quizPassRate, quizAttemptCount: qs.count };
  };

  const rows = enrollments
    .map((en) => {
      const uid = en.studentId.toString();
      const user = userMap.get(uid);
      if (!user) return null;
      if (excludeSynthetic && user.profile?.isSynthetic) return null;

      const s = statMap.get(uid);
      const attempts = s?.attempts || 0;
      const passes = s?.passes || 0;
      const autoAdvanced = s?.autoAdvanced || 0;
      const distinctMs = s?.distinctMilestones?.length || 0;
      const passRate = attempts ? Math.round((passes / attempts) * 1000) / 10 : 0;
      const attemptsPerMilestone = distinctMs ? Math.round((attempts / distinctMs) * 10) / 10 : 0;
      const { quizScore, quizPassRate, quizAttemptCount } = quizStatsFor(uid);

      // Auto-advance over a *share* of milestones — not "any single one".
      // The tutor nudges a student past the occasional stubborn milestone, so
      // 1-2 auto-advances across a long course is normal noise. It only signals
      // risk when it happens to a meaningful fraction of the student's
      // milestones. Using a rate (with a small absolute floor) keeps this
      // sensible whether the course has 4 milestones or 60 — the old
      // `autoAdvanced > 0` flagged ~every student in a full-length course.
      const AUTO_ADVANCE_FLOOR = 2;          // ignore one-off nudges
      const AUTO_ADVANCE_RATE_THRESHOLD = 0.25; // flag at >=25% of milestones
      const autoAdvanceRate = distinctMs ? autoAdvanced / distinctMs : 0;
      // Primary signal: mean quiz score below the failing bucket. Kept in sync
      // with the score-distribution chart's lowest bucket so the two views agree.
      const QUIZ_SCORE_THRESHOLD = 60;

      const flags = [];
      if (quizScore != null && quizScore < QUIZ_SCORE_THRESHOLD) flags.push('low_quiz_score');
      if (attempts > 0 && passRate < passRateThreshold) flags.push('low_pass_rate');
      if (autoAdvanced >= AUTO_ADVANCE_FLOOR && autoAdvanceRate >= AUTO_ADVANCE_RATE_THRESHOLD) {
        flags.push('auto_advanced');
      }
      if (attemptsPerMilestone > 2) flags.push('many_retries');
      if (attempts === 0) flags.push('no_activity');

      const atRisk = flags.length > 0 && flags[0] !== 'no_activity';

      return {
        studentId: uid,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isSynthetic: !!user.profile?.isSynthetic,
        personaTag: user.profile?.personaTag || null,
        programmingExposure: user.profile?.programmingExposure || 'unknown',
        priorKnowledge: en.priorKnowledge || {},
        joinedAt: en.joinedAt,
        attempts,
        passes,
        autoAdvanced,
        distinctMilestones: distinctMs,
        passRate,
        attemptsPerMilestone,
        quizScore,
        quizPassRate,
        quizAttemptCount,
        lastAttemptAt: s?.lastAttemptAt || null,
        flags,
        atRisk,
      };
    })
    .filter(Boolean);

  // Sort: at-risk first, then by lowest quiz score (the primary risk signal,
  // nulls last), then lowest pass rate, then most auto-advances.
  rows.sort((a, b) => {
    if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
    const qa = a.quizScore == null ? Infinity : a.quizScore;
    const qb = b.quizScore == null ? Infinity : b.quizScore;
    if (qa !== qb) return qa - qb;
    if (a.passRate !== b.passRate) return a.passRate - b.passRate;
    return b.autoAdvanced - a.autoAdvanced;
  });

  return rows;
}

/**
 * Cross-course KPIs for the instructor home page.
 * Aggregates attempts across every course this instructor owns.
 */
async function getCrossCourseKPIs(instructorId, { excludeSynthetic = true } = {}) {
  const courses = await Course.find({ instructorId })
    .select('_id title status')
    .lean();
  if (!courses.length) {
    return {
      courseCount: 0,
      enrollmentCount: 0,
      totalAttempts: 0,
      totalPasses: 0,
      avgPassRate: 0,
      atRiskCount: 0,
      perCourse: [],
    };
  }

  const courseIds = courses.map((c) => c._id);
  const courseIdStrs = courseIds.map((id) => id.toString());

  const matchStage = { courseId: { $in: courseIds } };
  if (excludeSynthetic) matchStage.isSynthetic = { $ne: true };

  const [totals, perCourseAggs, enrollments] = await Promise.all([
    MilestoneAttempt.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          passes: { $sum: { $cond: ['$passed', 1, 0] } },
        },
      },
    ]),
    MilestoneAttempt.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$courseId',
          attempts: { $sum: 1 },
          passes: { $sum: { $cond: ['$passed', 1, 0] } },
          autoAdvanced: { $sum: { $cond: ['$autoAdvanced', 1, 0] } },
          uniqueStudents: { $addToSet: '$userId' },
        },
      },
    ]),
    Enrollment.aggregate([
      { $match: { courseId: { $in: courseIds }, status: 'active' } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
  ]);

  const atRiskLists = await Promise.all(
    courseIdStrs.map((id) => getAtRiskStudents(id, { excludeSynthetic }))
  );

  const courseMap = new Map(courses.map((c) => [c._id.toString(), c]));
  const enrollMap = new Map(enrollments.map((e) => [e._id.toString(), e.count]));
  const aggMap = new Map(perCourseAggs.map((a) => [a._id.toString(), a]));

  const perCourse = courseIdStrs.map((cid, idx) => {
    const c = courseMap.get(cid);
    const a = aggMap.get(cid) || { attempts: 0, passes: 0, autoAdvanced: 0, uniqueStudents: [] };
    const atRiskRows = atRiskLists[idx] || [];
    const atRiskCount = atRiskRows.filter((r) => r.atRisk).length;
    return {
      courseId: cid,
      title: c?.title || '',
      status: c?.status || 'draft',
      enrollmentCount: enrollMap.get(cid) || 0,
      activeStudentCount: Array.isArray(a.uniqueStudents) ? a.uniqueStudents.length : 0,
      attempts: a.attempts,
      passes: a.passes,
      autoAdvanced: a.autoAdvanced,
      passRate: a.attempts ? Math.round((a.passes / a.attempts) * 1000) / 10 : 0,
      atRiskCount,
      hottestStruggle: atRiskRows[0]
        ? { name: atRiskRows[0].name, flags: atRiskRows[0].flags, passRate: atRiskRows[0].passRate }
        : null,
    };
  });

  const totalAttempts = totals[0]?.attempts || 0;
  const totalPasses = totals[0]?.passes || 0;
  const enrollmentCount = perCourse.reduce((a, c) => a + c.enrollmentCount, 0);
  const totalAtRisk = perCourse.reduce((a, c) => a + c.atRiskCount, 0);

  return {
    courseCount: courses.length,
    enrollmentCount,
    totalAttempts,
    totalPasses,
    avgPassRate: totalAttempts ? Math.round((totalPasses / totalAttempts) * 1000) / 10 : 0,
    atRiskCount: totalAtRisk,
    perCourse,
  };
}

/**
 * Topic × student heatmap grid. Rows are enrolled students; columns are topics.
 * Each cell is { attempts, passes, passRate }. Used by the Insights heatmap.
 */
async function getTopicStudentHeatmap(courseId, { excludeSynthetic = true } = {}) {
  const [topics, enrollments] = await Promise.all([
    CourseTopic.find({ courseId })
      .select('_id title orderIndex')
      .sort({ orderIndex: 1 })
      .lean(),
    Enrollment.find({ courseId, status: 'active' })
      .select('studentId')
      .lean(),
  ]);
  const userIds = enrollments.map((e) => e.studentId);
  if (!userIds.length || !topics.length) {
    return { topics: topics.map((t) => ({ id: t._id.toString(), title: t.title })), students: [] };
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select('name username profile.isSynthetic profile.personaTag')
    .lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const filteredUserIds = excludeSynthetic
    ? userIds.filter((id) => !userMap.get(id.toString())?.profile?.isSynthetic)
    : userIds;

  // QUIZ-BASED cells. Each cell is the student's quiz performance on that topic
  // (mean scorePct of submitted, non-revision quiz attempts), so the heatmap is
  // consistent with the score-distribution chart, the quiz-difficulty table, and
  // the at-risk panel — all of which read quiz performance. This grid used to be
  // milestone-check based, which made it look rosier than the quiz reality and
  // disagree with the other views (it showed a cell for students who did the
  // reflection checks but never submitted the topic's quiz).
  const quizSessions = await Session.find({
    courseId: new mongoose.Types.ObjectId(courseId),
    userId: { $in: filteredUserIds },
  }).select('userId courseTopicId quizAttempts').lean();

  // rowKey: userId -> topicId -> { attempts, passes, scoreSum, scoreN }
  const rowMap = new Map();
  for (const sess of quizSessions) {
    const uid = sess.userId?.toString();
    const tid = sess.courseTopicId?.toString();
    if (!uid || !tid) continue;
    for (const a of sess.quizAttempts || []) {
      if (a.status !== 'submitted' || a.isRevision) continue;
      if (!rowMap.has(uid)) rowMap.set(uid, new Map());
      const tmap = rowMap.get(uid);
      if (!tmap.has(tid)) tmap.set(tid, { attempts: 0, passes: 0, scoreSum: 0, scoreN: 0 });
      const cell = tmap.get(tid);
      cell.attempts += 1;
      if (a.passed === true) cell.passes += 1;
      if (a.scorePct != null && !Number.isNaN(Number(a.scorePct))) {
        cell.scoreSum += Number(a.scorePct);
        cell.scoreN += 1;
      }
    }
  }

  const topicIds = topics.map((t) => t._id.toString());

  const students = filteredUserIds.map((uidObj) => {
    const uid = uidObj.toString();
    const u = userMap.get(uid) || {};
    const per = rowMap.get(uid);
    const cells = topicIds.map((tid) => {
      const c = per?.get(tid);
      const attempts = c?.attempts || 0;
      const passes = c?.passes || 0;
      // `passRate` carries the mean quiz score (scorePct) for this student×topic
      // so the existing heatmap renderer colors/labels by quiz performance with
      // no frontend change. attempts/passes are quiz-attempt counts (for the
      // tooltip). Falls back to quiz pass-rate if a submitted attempt lacks a
      // scorePct (real-data robustness; sim data always has one).
      const meanScore = c && c.scoreN ? Math.round((c.scoreSum / c.scoreN) * 10) / 10 : null;
      const value = meanScore != null
        ? meanScore
        : (attempts ? Math.round((passes / attempts) * 1000) / 10 : null);
      return {
        courseTopicId: tid,
        attempts,
        passes,
        passRate: value,
      };
    });
    return {
      studentId: uid,
      name: u.name,
      username: u.username,
      isSynthetic: !!u.profile?.isSynthetic,
      personaTag: u.profile?.personaTag || null,
      cells,
    };
  });

  return {
    topics: topics.map((t) => ({ id: t._id.toString(), title: t.title })),
    students,
  };
}

module.exports = {
  getTreeAnalytics,
  getMilestoneStats,
  getAtRiskStudents,
  getCrossCourseKPIs,
  getTopicStudentHeatmap,
};
