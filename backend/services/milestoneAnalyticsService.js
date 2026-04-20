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
      studentCount: Array.isArray(row.uniqueUsers) ? row.uniqueUsers.length : 0,
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
          studentCount: 0,
        };
        const passRate = s.attempts ? Math.round((s.passes / s.attempts) * 1000) / 10 : 0;
        return {
          milestoneIndex: idx,
          text: ms.text,
          attempts: s.attempts,
          passes: s.passes,
          autoAdvanced: s.autoAdvanced,
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

      const flags = [];
      if (attempts > 0 && passRate < passRateThreshold) flags.push('low_pass_rate');
      if (autoAdvanced > 0) flags.push('auto_advanced');
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
        lastAttemptAt: s?.lastAttemptAt || null,
        flags,
        atRisk,
      };
    })
    .filter(Boolean);

  // Sort: at-risk first, then by lowest pass rate, then by most auto-advances
  rows.sort((a, b) => {
    if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
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

  const match = attemptFilter(courseId, { excludeSynthetic });
  match.userId = { $in: filteredUserIds };

  const grouped = await MilestoneAttempt.aggregate([
    { $match: match },
    {
      $group: {
        _id: { userId: '$userId', courseTopicId: '$courseTopicId' },
        attempts: { $sum: 1 },
        passes: { $sum: { $cond: ['$passed', 1, 0] } },
      },
    },
  ]);

  // rowKey: userId -> topicId -> {attempts, passes}
  const rowMap = new Map();
  for (const g of grouped) {
    const uid = g._id.userId?.toString();
    const tid = g._id.courseTopicId?.toString();
    if (!uid || !tid) continue;
    if (!rowMap.has(uid)) rowMap.set(uid, new Map());
    rowMap.get(uid).set(tid, { attempts: g.attempts, passes: g.passes });
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
      return {
        courseTopicId: tid,
        attempts,
        passes,
        passRate: attempts ? Math.round((passes / attempts) * 1000) / 10 : null,
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
