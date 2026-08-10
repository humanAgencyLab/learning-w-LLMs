const mongoose = require('mongoose');
const MilestoneAttempt = require('../models/MilestoneAttempt');
const TutorRefusalEvent = require('../models/TutorRefusalEvent');
const CourseTopic = require('../models/CourseTopic');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Session = require('../models/Session');
const InstructorStudentNote = require('../models/InstructorStudentNote');

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

// ===========================================================================
// Risk Insights v2 — continuous risk score (0–100) + level, computed against
// PUBLISHED topics as of a cutoff date. See computeRiskScore below.
// ===========================================================================

// Step 1 — canonical denominator: how many topics are currently published.
async function publishedTopicsCount(courseId) {
  return CourseTopic.countDocuments({
    courseId: new mongoose.Types.ObjectId(courseId),
    status: 'published',
  });
}

// Weights are constants (UI-tuning is post-pilot, deferred R7). Do not change
// without flagging — they are part of the documented formula contract.
const RISK_WEIGHTS = { engagement: 0.40, passRate: 0.30, quizScore: 0.20, struggle: 0.10 };
// R5 — watch raised from 10 to 20 to de-flood the noisiest band.
const RISK_LEVEL_THRESHOLDS = { critical: 70, high: 40, watch: 20 };
const QUIZ_PASS_THRESHOLD = 60;
const NEW_ENROLLEE_GRACE_DAYS = 7;   // R1
const PUBLISH_GRACE_DAYS = 2;        // R3
const DROWNING_FLOOR = 40;           // R4
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure, as-of-cutoffDate risk computation for ONE student. No DB access — all
 * inputs are pre-fetched (so the trend endpoint can call this at several
 * cutoffs over the same data). Implements the v2 formula with adjustments
 * R1–R6 approved before implementation.
 *
 * @param {object} args
 * @param {object} args.studentData
 *   - enrollmentCreatedAt: Date         enrollment row creation
 *   - earliestActivity: Date|null       first quiz/milestone activity (see R1 note)
 *   - quizByTopic: Map<topicId, [{ submittedAt, passed, scorePct }]>  submitted, non-revision
 *   - milestoneDatesByTopic: Map<topicId, [Date]>
 * @param {object} args.courseData
 *   - publishedTopics: [{ topicId, orderIndex, publishedAt }]   status==='published'
 * @param {Date}   args.cutoffDate       moment to compute as-of (defaults to now)
 * @returns {object} { riskScore, riskLevel, flags, persistence_score, dominantDriver, ...signals }
 */
function computeRiskScore({ studentData, courseData, cutoffDate }) {
  const now = cutoffDate instanceof Date ? cutoffDate : (cutoffDate ? new Date(cutoffDate) : new Date());
  const nowTs = now.getTime();

  // --- daysSinceEnrollment ---
  // The "new enrollee" grace protects students who genuinely haven't had TIME to
  // start — not students whose enrollment ROW carries a recent timestamp. So we
  // anchor to effectiveStart = min(enrollmentCreatedAt, earliestActivity): a
  // student with a long activity history is not new even if their enrollment row
  // was just (re)created. This is the correct intent for real cases too — a
  // student who transfers sections or re-enrolls keeps their activity history and
  // must not be reset to "new" — and it incidentally handles the synthetic
  // full-sem cohort whose enrollments are ~2 days old but whose backdated
  // activity spans ~45 days. A genuinely new student has no activity, so
  // effectiveStart == enrollment and the grace still fires.
  const enrolledAt = studentData.enrollmentCreatedAt ? new Date(studentData.enrollmentCreatedAt) : null;
  const earliest = studentData.earliestActivity ? new Date(studentData.earliestActivity) : null;
  let startRef = enrolledAt;
  if (earliest && (!startRef || earliest < startRef)) startRef = earliest;
  const daysSinceEnrollment = startRef ? Math.floor((nowTs - startRef.getTime()) / DAY_MS) : Infinity;

  // R1 — actual grace period for new enrollees (mandatory early return).
  if (daysSinceEnrollment < NEW_ENROLLEE_GRACE_DAYS) {
    return {
      riskScore: 0,
      riskLevel: 'healthy',
      flags: [],
      persistence_score: null,
      dominantDriver: 'new_enrollee',
      metaNote: 'New enrollee — risk score paused for the first 7 days',
      publishedN: null,
      attemptedPublished: 0,
      attemptedQuizTopics: 0,
      passedPublished: 0,
      totalAttempts: 0,
      avgQuizScore: null,
      daysSinceEnrollment,
      usedPublishGraceFallback: false,
      signals: { engagement_signal: 0, pass_rate_signal: 0, quiz_score_signal: 0, struggle_signal: 0 },
    };
  }

  // R3 — publishing grace: a topic counts only once it has been published for
  // more than PUBLISH_GRACE_DAYS (and not after the cutoff). If publishedAt is
  // missing, fall back to counting it (documented) and record that the grace was
  // bypassed for transparency.
  const gateTs = nowTs - PUBLISH_GRACE_DAYS * DAY_MS;
  let usedPublishGraceFallback = false;
  const gatedTopics = (courseData.publishedTopics || []).filter((t) => {
    if (t.publishedAt == null) { usedPublishGraceFallback = true; return true; }
    return new Date(t.publishedAt).getTime() <= gateTs;
  });
  const publishedN = gatedTopics.length;

  // --- per-topic rollup (as of cutoff) ---
  // Q2 — two engagement denominators: ANY activity (milestone OR quiz) drives
  // the broad engagement_signal; QUIZ activity alone drives pass-rate. A student
  // who did a milestone but never took a quiz is "not progressing", NOT "failing
  // quizzes" — so milestone-only topics must not enter the pass-rate denominator.
  let attemptedPublished = 0;   // any-activity topics (engagement + displayed "X of Y attempted")
  let attemptedQuizzes = 0;     // quiz-attempted topics (pass-rate denominator)
  let passedPublished = 0;      // topics whose terminal quiz passed (pass-rate numerator)
  let totalAttempts = 0;
  let unresolvedStruggle = 0;
  let persistentSuccess = 0;
  const allScores = [];

  for (const t of gatedTopics) {
    const tid = t.topicId;
    const quizzes = (studentData.quizByTopic.get(tid) || [])
      .filter((a) => !a.submittedAt || new Date(a.submittedAt).getTime() <= nowTs);
    const milestones = (studentData.milestoneDatesByTopic.get(tid) || [])
      .filter((d) => d && new Date(d).getTime() <= nowTs);

    const attemptsOnTopic = quizzes.length;
    totalAttempts += attemptsOnTopic;
    for (const a of quizzes) {
      if (a.scorePct != null && !Number.isNaN(Number(a.scorePct))) allScores.push(Number(a.scorePct));
    }

    // engagement counts ANY activity; pass-rate counts only quiz activity (Q2)
    if (attemptsOnTopic > 0 || milestones.length > 0) attemptedPublished += 1;
    if (attemptsOnTopic > 0) attemptedQuizzes += 1;

    // terminal quiz = latest submitted, non-revision attempt by submittedAt
    let passed = false;
    if (attemptsOnTopic > 0) {
      const sorted = quizzes.slice().sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return ta - tb;
      });
      passed = sorted[sorted.length - 1].passed === true;
      if (passed) passedPublished += 1;
    }

    // struggle accounting: retries beyond the first, split by terminal outcome
    if (passed) persistentSuccess += Math.max(0, attemptsOnTopic - 1);
    else unresolvedStruggle += Math.max(0, attemptsOnTopic - 1);
  }

  const avgQuizScore = allScores.length
    ? Math.round((allScores.reduce((x, y) => x + y, 0) / allScores.length) * 10) / 10
    : null;

  // --- signals ---
  const engagement_signal = publishedN === 0
    ? 0
    : (attemptedPublished === 0 ? 1.0 : Math.max(0, 1 - attemptedPublished / publishedN));
  // R2 + Q2 — pass-rate among QUIZ-attempted topics only (decoupled from
  // engagement AND from milestone-only activity).
  const pass_rate_signal = attemptedQuizzes > 0 ? 1 - passedPublished / attemptedQuizzes : 0;
  const quiz_score_signal = avgQuizScore !== null
    ? Math.max(0, (QUIZ_PASS_THRESHOLD - avgQuizScore) / QUIZ_PASS_THRESHOLD)
    : 0; // R2 side-effect: engagement_signal carries the fully-disengaged case alone
  const struggle_signal = totalAttempts > 0 ? unresolvedStruggle / totalAttempts : 0;

  let riskScore = Math.round(100 * (
    RISK_WEIGHTS.engagement * engagement_signal
    + RISK_WEIGHTS.passRate * pass_rate_signal
    + RISK_WEIGHTS.quizScore * quiz_score_signal
    + RISK_WEIGHTS.struggle * struggle_signal
  ));

  // R4 — drowning-but-trying floor: max engagement, mostly failing, sub-50 avg.
  // NOTE (structural limit, accepted): with weights unchanged a fully-engaged
  // student caps at 60, so the worst ENGAGED performers reach 'high' (via this
  // floor) but not 'critical'. Critical therefore means the disengagement tail —
  // pedagogically defensible after R2 (engagement tail = higher drop risk).
  if (engagement_signal < 0.2 && pass_rate_signal >= 0.8 && avgQuizScore !== null && avgQuizScore < 50) {
    riskScore = Math.max(riskScore, DROWNING_FLOOR);
  }

  const riskLevel = riskScore >= RISK_LEVEL_THRESHOLDS.critical ? 'critical'
    : riskScore >= RISK_LEVEL_THRESHOLDS.high ? 'high'
    : riskScore >= RISK_LEVEL_THRESHOLDS.watch ? 'watch'
    : 'healthy';

  // --- flags (tagging, not scoring) ---
  const flags = [];
  if (engagement_signal >= 0.5 && daysSinceEnrollment >= NEW_ENROLLEE_GRACE_DAYS) flags.push('no_engagement');
  // R6 + Q2 — only flag low_pass_rate when they actually took quizzes and failed
  // some of them (a milestone-only student is "no_engagement", not "low_pass_rate").
  if (pass_rate_signal >= 0.5 && attemptedQuizzes > 0 && passedPublished < attemptedQuizzes) {
    flags.push('low_pass_rate');
  }
  if (quiz_score_signal >= 0.4) flags.push('low_quiz_score');
  if (struggle_signal >= 0.5) flags.push('stuck_topic');

  // --- dominant driver (row transparency; based on weighted contributions) ---
  const contributions = [
    ['needs to engage', RISK_WEIGHTS.engagement * engagement_signal],
    ['failing what they try', RISK_WEIGHTS.passRate * pass_rate_signal],
    ['low quiz scores', RISK_WEIGHTS.quizScore * quiz_score_signal],
    ['stuck on retries', RISK_WEIGHTS.struggle * struggle_signal],
  ];
  const totalContribution = contributions.reduce((s, c) => s + c[1], 0);
  let dominantDriver;
  // Q3 — the whole Healthy band reads 'healthy', not just score 0. Below the
  // watch threshold the largest contribution is noise (e.g. a top student with
  // 2 unpassed topics would otherwise read "failing what they try"). The driver
  // isn't surfaced for healthy rows today, but a future per-student view / export
  // might read it.
  if (riskLevel === 'healthy') {
    dominantDriver = 'healthy';
  } else {
    const top = contributions.reduce((m, c) => (c[1] > m[1] ? c : m), contributions[0]);
    dominantDriver = (totalContribution > 0 && top[1] / totalContribution >= 0.5) ? top[0] : 'multiple_factors';
  }

  // --- persistence readout (display-only positive signal; NOT in risk score) ---
  // OUT OF SCOPE: the engagement-quality export / bonus-mark grading workflow is
  // post-pilot. This value is surfaced on the Monitor page only.
  const persistence_score = (persistentSuccess + unresolvedStruggle > 0)
    ? Math.round(100 * persistentSuccess / (persistentSuccess + unresolvedStruggle))
    : null;

  return {
    riskScore,
    riskLevel,
    flags,
    persistence_score,
    dominantDriver,
    publishedN,
    attemptedPublished,
    attemptedQuizTopics: attemptedQuizzes,
    passedPublished,
    totalAttempts,
    avgQuizScore,
    daysSinceEnrollment,
    usedPublishGraceFallback,
    signals: { engagement_signal, pass_rate_signal, quiz_score_signal, struggle_signal },
  };
}

/**
 * Fetch + shape all inputs computeRiskScore needs for every enrolled student in
 * a course, in one pass (reused by getAtRiskStudents now and the per-student
 * risk-trend endpoint later). Returns { courseData, enrollments, studentInputs }
 * where studentInputs is Map<uid, studentData>.
 */
async function buildRiskInputs(courseId, { excludeSynthetic = true } = {}) {
  const courseObjId = new mongoose.Types.ObjectId(courseId);
  const enrollments = await Enrollment.find({ courseId, status: 'active' })
    .select('studentId joinedAt priorKnowledge createdAt')
    .lean();
  const userIds = enrollments.map((e) => e.studentId);

  const topics = await CourseTopic.find({ courseId: courseObjId, status: 'published' })
    .select('_id orderIndex publishedAt title')
    .sort({ orderIndex: 1 })
    .lean();
  const courseData = {
    publishedTopics: topics.map((t) => ({
      topicId: t._id.toString(),
      orderIndex: t.orderIndex ?? 0,
      publishedAt: t.publishedAt || null,
      title: t.title || 'Untitled',
    })),
  };

  const studentInputs = new Map();
  const ensure = (uid) => {
    if (!studentInputs.has(uid)) {
      studentInputs.set(uid, {
        enrollmentCreatedAt: null,
        joinedAt: null,
        earliestActivity: null,
        quizByTopic: new Map(),
        milestoneDatesByTopic: new Map(),
      });
    }
    return studentInputs.get(uid);
  };
  for (const en of enrollments) {
    const si = ensure(en.studentId.toString());
    si.enrollmentCreatedAt = en.createdAt || en.joinedAt || null;
    si.joinedAt = en.joinedAt || null;
  }

  if (userIds.length) {
    const [sessions, milestoneDocs, refusalDocs] = await Promise.all([
      // messages.role/.timestamp only — projecting the subfields keeps this
      // cheap; we need the first student-authored turn, not the transcript.
      Session.find({ courseId: courseObjId, userId: { $in: userIds } })
        .select('userId courseTopicId quizAttempts messages.role messages.timestamp')
        .lean(),
      MilestoneAttempt.find(attemptFilter(courseId, { excludeSynthetic }))
        .select('userId courseTopicId createdAt')
        .lean(),
      TutorRefusalEvent.find({ courseId: courseObjId, userId: { $in: userIds } })
        .select('userId createdAt')
        .lean(),
    ]);

    for (const sess of sessions) {
      const uid = sess.userId?.toString();
      const tid = sess.courseTopicId?.toString();
      if (!uid || !tid) continue;
      const si = ensure(uid);
      if (!si.quizByTopic.has(tid)) si.quizByTopic.set(tid, []);
      const arr = si.quizByTopic.get(tid);
      for (const a of sess.quizAttempts || []) {
        if (a.status !== 'submitted' || a.isRevision) continue;
        const sub = a.submittedAt ? new Date(a.submittedAt) : null;
        arr.push({ submittedAt: sub, passed: a.passed === true, scorePct: a.scorePct });
        if (sub && (!si.earliestActivity || sub < si.earliestActivity)) si.earliestActivity = sub;
      }
    }
    for (const m of milestoneDocs) {
      const uid = m.userId?.toString();
      const tid = m.courseTopicId?.toString();
      if (!uid || !tid) continue;
      const si = ensure(uid);
      if (!si.milestoneDatesByTopic.has(tid)) si.milestoneDatesByTopic.set(tid, []);
      const d = m.createdAt ? new Date(m.createdAt) : null;
      si.milestoneDatesByTopic.get(tid).push(d);
      if (d && (!si.earliestActivity || d < si.earliestActivity)) si.earliestActivity = d;
    }

    // --- The activity clock (2d) -----------------------------------------
    // earliestActivity used to derive ONLY from gradeable artifacts (quiz and
    // milestone attempts), so any student who engaged without producing one
    // never started the clock: effectiveStart stayed at enrollment, the 7-day
    // new-enrollee grace never expired, and they scored healthy/new_enrollee
    // forever — indistinguishable from someone who never logged in. Measured
    // during the constraint-gate build on a student with six refusals.
    //
    // What counts as activity is now "any recorded interaction the STUDENT
    // caused": attempts (above), student-authored chat turns, and refused
    // requests. Bare session existence is deliberately NOT counted — sessions
    // are also created by the provisioning and simulation paths and by course
    // cloning, so their timestamps are not reliably student-caused and would
    // start the clock for students who never acted.
    //
    // This widens the clock ONLY. The engagement signal remains published-topic
    // coverage, unchanged: chatting is evidence that a student showed up, not
    // evidence that they covered material.
    const noteActivity = (uid, d) => {
      if (!uid || !d) return;
      const si = ensure(uid);
      const dt = new Date(d);
      if (!si.earliestActivity || dt < si.earliestActivity) si.earliestActivity = dt;
    };
    for (const sess of sessions) {
      const uid = sess.userId?.toString();
      for (const msg of sess.messages || []) {
        if (msg.role === 'user' && msg.timestamp) noteActivity(uid, msg.timestamp);
      }
    }
    for (const r of refusalDocs) noteActivity(r.userId?.toString(), r.createdAt);
  }

  return { courseData, enrollments, studentInputs };
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
  passRateThreshold = 60, // retained for signature compat (legacy callers)
  topicIds = null,        // optional: restrict scoring to these published topic ids
  upToTopicCount = null,  // optional: restrict to the first N published topics (orderIndex)
} = {}) {
  // Risk inputs (published topics + per-student quiz/milestone data) in one pass.
  const { courseData: fullCourseData, enrollments, studentInputs } = await buildRiskInputs(courseId, { excludeSynthetic });
  // Topic / snapshot filtering (Insights distribution chart): score against a
  // subset of published topics while reusing the SAME scorer — no client-side
  // formula duplication.
  let publishedTopics = fullCourseData.publishedTopics;
  if (Array.isArray(topicIds) && topicIds.length) {
    const set = new Set(topicIds);
    publishedTopics = publishedTopics.filter((t) => set.has(t.topicId));
  } else if (Number.isInteger(upToTopicCount)) {
    publishedTopics = publishedTopics.slice(0, Math.max(0, upToTopicCount));
  }
  const courseData = { publishedTopics };
  const userIds = enrollments.map((e) => e.studentId);
  if (!userIds.length) return [];

  const userSelect = 'name username avatarUrl profile.isSynthetic profile.isSimulation profile.personaTag profile.programmingExposure profile.selfConfidence';
  const users = await User.find({ _id: { $in: userIds } }).select(userSelect).lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  // Class Context overrides (Step 7) — course-owner-set classroom knowledge,
  // stored on the student-level note (courseTopicId: null).
  const noteDocs = await InstructorStudentNote.find({
    courseId: new mongoose.Types.ObjectId(courseId),
    studentId: { $in: userIds },
    courseTopicId: null,
    classContext: { $ne: null },
  }).select('studentId classContext').lean();
  const classContextMap = new Map(noteDocs.map((n) => [n.studentId.toString(), n.classContext]));

  // Legacy milestone aggregation — kept so the existing row UI fields
  // (autoAdvanced, passRate, attemptsPerMilestone, distinctMilestones) keep
  // working. The v2 risk score does NOT use these; they are descriptive only.
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

  // Legacy B8 quiz stats (course-wide mean / pass rate over SUBMITTED,
  // non-revision attempts) — derived from the same attempt set buildRiskInputs
  // collected, so no extra query and no divergence from the risk inputs.
  const quizStatsFor = (uid) => {
    const si = studentInputs.get(uid);
    if (!si) return { quizScore: null, quizPassRate: null, quizAttemptCount: 0 };
    let count = 0;
    let passed = 0;
    const scores = [];
    for (const arr of si.quizByTopic.values()) {
      for (const a of arr) {
        count += 1;
        if (a.passed === true) passed += 1;
        if (a.scorePct != null && !Number.isNaN(Number(a.scorePct))) scores.push(Number(a.scorePct));
      }
    }
    if (count === 0) return { quizScore: null, quizPassRate: null, quizAttemptCount: 0 };
    const quizScore = scores.length
      ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10
      : null;
    const quizPassRate = Math.round((passed / count) * 1000) / 10;
    return { quizScore, quizPassRate, quizAttemptCount: count };
  };

  const now = new Date();
  const rows = enrollments
    .map((en) => {
      const uid = en.studentId.toString();
      const user = userMap.get(uid);
      if (!user) return null;
      if (excludeSynthetic && user.profile?.isSynthetic) return null;
      // Simulation students are the instructor's own test students and are
      // excluded UNCONDITIONALLY — including from the two dashboard call sites
      // that deliberately pass excludeSynthetic:false (analyticsService.js:107
      // and :338, feeding the briefing and insights). Part B's analytics are
      // the study stimulus and must stay byte-comparable across participants,
      // and the clone acceptance checks assume exact tier counts
      // (SIMULATION_FEATURE_PLAN.md Section 2 and risk 5).
      if (user.profile?.isSimulation) return null;

      // --- legacy descriptive fields (B8/B9 — unchanged semantics) ---
      const s = statMap.get(uid);
      const attempts = s?.attempts || 0;
      const passes = s?.passes || 0;
      const autoAdvanced = s?.autoAdvanced || 0;
      const distinctMs = s?.distinctMilestones?.length || 0;
      const passRate = attempts ? Math.round((passes / attempts) * 1000) / 10 : 0;
      const attemptsPerMilestone = distinctMs ? Math.round((attempts / distinctMs) * 10) / 10 : 0;
      const { quizScore, quizPassRate, quizAttemptCount } = quizStatsFor(uid);

      // --- v2 continuous risk score ---
      const risk = computeRiskScore({ studentData: studentInputs.get(uid), courseData, cutoffDate: now });

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
        // legacy descriptive (kept)
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
        // v2 risk
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        flags: risk.flags,
        persistence_score: risk.persistence_score,
        dominantDriver: risk.dominantDriver,
        metaNote: risk.metaNote || null,
        publishedN: risk.publishedN,
        attemptedPublished: risk.attemptedPublished,
        attemptedQuizTopics: risk.attemptedQuizTopics,
        passedPublished: risk.passedPublished,
        riskTotalAttempts: risk.totalAttempts,
        avgQuizScore: risk.avgQuizScore,
        daysSinceEnrollment: risk.daysSinceEnrollment,
        usedPublishGraceFallback: risk.usedPublishGraceFallback,
        signals: risk.signals,
        classContext: classContextMap.get(uid) || null,
        // Headline "at-risk" = score >= the High threshold (40) AND not overridden
        // as "doing well in class" (Step 7). Used by the dashboard tile count and
        // the Student Progress header. The Insights panel still SHOWS overridden
        // students (it keys off riskLevel/riskScore, not atRisk) — with a gray
        // border + "Class override" pill.
        atRisk: risk.riskScore >= RISK_LEVEL_THRESHOLDS.high
          && (classContextMap.get(uid) || null) !== 'doing_well_in_class',
      };
    })
    .filter(Boolean);

  // Most-at-risk first by continuous score; name as a stable tiebreak.
  rows.sort((a, b) => (b.riskScore - a.riskScore) || (a.name || '').localeCompare(b.name || ''));

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
      // 2a (second call site): the briefing described Maya as "struggling the
      // most, with a pass rate of 0%" because only the legacy milestone pass
      // rate was passed. Send both sensors so an active quiz-only student is
      // never reported as having done nothing.
      hottestStruggle: atRiskRows[0]
        ? {
          name: atRiskRows[0].name,
          flags: atRiskRows[0].flags,
          milestonePassRate: atRiskRows[0].passRate,
          milestoneAttempts: atRiskRows[0].attempts || 0,
          quizAttempts: atRiskRows[0].quizAttemptCount || 0,
          quizAvgScore: atRiskRows[0].quizScore,
          quizPassRate: atRiskRows[0].quizPassRate,
          totalAttempts: (atRiskRows[0].attempts || 0) + (atRiskRows[0].quizAttemptCount || 0),
        }
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
  // Risk Insights v2 — exported for reuse by the risk-trend endpoint (Step 6)
  // and any future caller that needs the pure scorer or its inputs.
  publishedTopicsCount,
  computeRiskScore,
  buildRiskInputs,
};
