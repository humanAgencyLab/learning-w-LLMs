const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const { requireCourseOwner } = require('../middleware/instructorOwnership');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const Enrollment = require('../models/Enrollment');
const InstructorStudentNote = require('../models/InstructorStudentNote');
const TutorRefusalEvent = require('../models/TutorRefusalEvent');
const User = require('../models/User');
const {
  getCourseAnalytics,
  getStudentProgress,
  getInstructorStudentDetail,
  getCoursePerformanceSummary,
} = require('../services/analyticsService');
const {
  getTreeAnalytics,
  getMilestoneStats,
  getAtRiskStudents,
  getCrossCourseKPIs,
  getTopicStudentHeatmap,
  buildRiskInputs,
  computeRiskScore,
} = require('../services/milestoneAnalyticsService');
const { runStruggleSummary } = require('../agents/struggleSummaryAgent');
const {
  runBriefing,
  runHotSignal,
  runInsightCards,
} = require('../agents/instructorBriefingAgent');

// `?includeSynthetic=1` flips the excludeSynthetic default to false. The
// professor-study dashboards pass this so the synthetic cohort — which IS
// the study data — is counted.
function parseSyntheticFlag(req) {
  const raw = req.query?.includeSynthetic;
  const include = raw === '1' || raw === 'true' || raw === 'yes';
  return { excludeSynthetic: !include };
}

// --- STUDY_PROBE (CHI instructor study, STUDY_PLAN_CHI.md Section 6 item 3) ---
// Probe 3: for study accounts, one overgeneralized sentence is appended to the
// generated briefing. Appended here in the route — after the agent's 500-char
// truncation — so it always survives intact. The contradicting ground truth
// (Need-attention card, KPI tiles) sits on the same dashboard screen. The user
// list comes from the provisioning manifest. Remove after the study window.
const STUDY_PROBE_ENABLED = ['1', 'true'].includes(String(process.env.STUDY_PROBE || '').trim().toLowerCase());
const STUDY_PROBE_USER_SET = new Set(
  String(process.env.STUDY_PROBE_USERS || '').split(',').map((s) => s.trim()).filter(Boolean)
);
const STUDY_PROBE_BRIEFING_SENTENCE =
  'Most of the class has gone quiet this week; engagement is dropping sharply across the course.';

/**
 * Classify an error thrown from a Groq-backed narrative agent call. Returns a
 * short machine-readable reason if the error should be handled as a soft
 * "degraded" outcome (timeout, upstream 5xx/429, transport blip), or `null`
 * if it's a real bug we should let bubble up through `next(e)`.
 *
 * Phase F rationale: the briefing / hot-signal / insight-cards endpoints sit
 * in front of the React UI via CRA's dev proxy. A raw 5xx here causes the
 * proxy to mislabel the whole backend as down. By returning HTTP 200 with
 * `degraded: true`, the charts + KPI strip still render and the UI shows a
 * soft "AI summary unavailable right now" line instead of a red banner.
 */
function classifyAgentError(err) {
  if (!err) return null;
  if (err.code === 'AGENT_TIMEOUT') return 'timeout';
  // Groq SDK surfaces HTTP status on err.status / err.response?.status.
  // ANY 4xx/5xx from Groq is degradable: the LLM narrative can't render but
  // the charts + KPI tiles still carry the instructor's dense-scan needs.
  // This includes 401 (bad key), 403 (model blocked at project level —
  // discovered during Phase F rollout), 404 (model not found), 429 (rate),
  // 400 (malformed request, e.g. context too long), and any 5xx.
  const status = err.status || err.response?.status;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    if (status === 429) return 'rate_limited';
    if (status === 401 || status === 403) return 'upstream_forbidden';
    if (status === 404) return 'upstream_not_found';
    if (status >= 500) return 'upstream_5xx';
    return 'upstream_4xx';
  }
  // Network transport errors: fetch abort, DNS, connection reset.
  if (err.name === 'AbortError') return 'aborted';
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    return 'network';
  }
  // Groq SDK wraps JSON parse failures in a generic Error — if the upstream
  // returns malformed JSON we'd rather degrade than show a 500 to the prof.
  if (/JSON/i.test(err.message || '') && /parse|invalid/i.test(err.message || '')) {
    return 'bad_json';
  }
  // Catch-all: any error whose constructor looks like an SDK APIError is
  // still an upstream thing, not a bug in our code — degrade rather than
  // 5xx. This keeps the proxy's "backend down" path reserved for real
  // connection failures.
  const ctor = err.constructor?.name || '';
  if (/APIError|ApiError|GroqError/i.test(ctor)) return 'upstream_other';
  return null;
}

function logDegraded(route, reason, err) {
  // One-line warn so we can audit how often each route degrades. Keep the
  // message slice short — we've seen Groq errors include whole payloads.
  const msg = (err?.message || String(err)).slice(0, 200);
  console.warn('[agent.degraded]', { route, reason, msg });
}

const router = express.Router();

/** GET /v1/instructor/courses/:courseId/analytics/performance */
router.get(
  '/courses/:courseId/analytics/performance',
  requireAuth,
  requireRole('instructor'),
  requireCourseOwner,
  async (req, res, next) => {
    try {
      const data = await getCoursePerformanceSummary(req.params.courseId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

/** GET /v1/instructor/courses/:courseId/analytics */
router.get('/courses/:courseId/analytics', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const analytics = await getCourseAnalytics(req.params.courseId);
    res.json({ success: true, data: analytics });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/insights — AI-generated struggle summary */
router.get('/courses/:courseId/insights', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const analytics = await getCourseAnalytics(req.params.courseId);
    const insights = await runStruggleSummary(analytics);
    res.json({ success: true, data: insights });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/students */
router.get('/courses/:courseId/students', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getStudentProgress(req.params.courseId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/students/:studentId — individual monitoring (summary + per-topic latest session) */
/**
 * GET /v1/instructor/courses/:courseId/refusals[?studentId=]
 * The tutor-refusal log (Addition 1). Refused turns are invisible to every
 * learning analytic by design — no attempt, no retry, no advance — so a
 * student who only triggers refusals leaves no trace in the risk model. This
 * is that trace, queryable per course and per student.
 */
router.get('/courses/:courseId/refusals', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const filter = { courseId: new mongoose.Types.ObjectId(req.params.courseId) };
    if (req.query.studentId && mongoose.Types.ObjectId.isValid(req.query.studentId)) {
      filter.userId = new mongoose.Types.ObjectId(req.query.studentId);
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const events = await TutorRefusalEvent.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    const userIds = [...new Set(events.map((e) => String(e.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).select('name username').lean();
    const nameOf = new Map(users.map((u) => [String(u._id), u]));

    const byStudent = {};
    for (const e of events) {
      const k = String(e.userId);
      byStudent[k] = byStudent[k] || { studentId: k, name: nameOf.get(k)?.name || null, username: nameOf.get(k)?.username || null, count: 0, lastAt: null, categories: {} };
      byStudent[k].count += 1;
      byStudent[k].categories[e.category] = (byStudent[k].categories[e.category] || 0) + 1;
      if (!byStudent[k].lastAt || e.createdAt > byStudent[k].lastAt) byStudent[k].lastAt = e.createdAt;
    }

    res.json({
      success: true,
      data: {
        total: events.length,
        byStudent: Object.values(byStudent).sort((a, b) => b.count - a.count),
        events: events.map((e) => ({
          _id: e._id,
          studentId: e.userId,
          studentName: nameOf.get(String(e.userId))?.name || null,
          category: e.category,
          clause: e.clause,
          refusalReason: e.refusalReason,
          detectedBy: e.detectedBy,
          studentMessage: e.studentMessage,
          milestoneText: e.milestoneText,
          createdAt: e.createdAt,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/courses/:courseId/students/:studentId', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }
    const data = await getInstructorStudentDetail(courseId, studentId);
    if (data?.error === 'STUDENT_NOT_ENROLLED') {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

function assertSessionBelongsToCourse(session, courseId) {
  if (!session) return { ok: false, status: 404, error: 'Session not found', code: 'NOT_FOUND' };
  if (!session.courseId || session.courseId.toString() !== courseId) {
    return { ok: false, status: 404, error: 'Session not found', code: 'NOT_FOUND' };
  }
  return { ok: true };
}

/** GET /v1/instructor/courses/:courseId/sessions/:sessionId — session header (no full messages) */
router.get('/courses/:courseId/sessions/:sessionId', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session id', code: 'VALIDATION_ERROR' });
    }
    const session = await Session.findById(sessionId)
      .select('phase mode topic chatTitle plan activeModuleId points gems progressPct userId courseId courseTopicId enrollmentId meta createdAt updatedAt')
      .lean();
    const ok = assertSessionBelongsToCourse(session, courseId);
    if (!ok.ok) return res.status(ok.status).json({ success: false, error: ok.error, code: ok.code });

    // Ensure enrollmentId belongs to this course (defense in depth)
    if (session.enrollmentId) {
      const enrollment = await Enrollment.findById(session.enrollmentId).select('courseId studentId userId').lean();
      const enrollmentCourseId = enrollment?.courseId?.toString();
      if (enrollmentCourseId && enrollmentCourseId !== courseId) {
        return res.status(404).json({ success: false, error: 'Session not found', code: 'NOT_FOUND' });
      }
    }

    return res.json({
      success: true,
      data: {
        id: session._id.toString(),
        phase: session.phase,
        mode: session.mode,
        topic: session.topic,
        chatTitle: session.chatTitle,
        plan: session.plan,
        activeModuleId: session.activeModuleId,
        points: session.points,
        gems: session.gems,
        progressPct: session.progressPct,
        userId: session.userId,
        courseId: session.courseId,
        courseTopicId: session.courseTopicId,
        enrollmentId: session.enrollmentId,
        meta: session.meta,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/sessions/:sessionId/messages — paginated messages */
router.get('/courses/:courseId/sessions/:sessionId/messages', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session id', code: 'VALIDATION_ERROR' });
    }
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
    const fromEnd = Math.max(0, parseInt(req.query.fromEnd) || 0);

    const session = await Session.findById(sessionId).select('courseId enrollmentId messages').lean();
    const ok = assertSessionBelongsToCourse(session, courseId);
    if (!ok.ok) return res.status(ok.status).json({ success: false, error: ok.error, code: ok.code });

    if (session.enrollmentId) {
      const enrollment = await Enrollment.findById(session.enrollmentId).select('courseId').lean();
      const enrollmentCourseId = enrollment?.courseId?.toString();
      if (enrollmentCourseId && enrollmentCourseId !== courseId) {
        return res.status(404).json({ success: false, error: 'Session not found', code: 'NOT_FOUND' });
      }
    }

    const allMessages = Array.isArray(session.messages) ? session.messages : [];
    const totalCount = allMessages.length;
    const start = Math.max(0, totalCount - fromEnd - limit);
    const end = totalCount - fromEnd;
    const messages = start < end ? allMessages.slice(start, end) : [];
    const hasMore = fromEnd + limit < totalCount;

    return res.json({ success: true, data: { messages, totalCount, hasMore } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/sessions/:sessionId/quizzes — submitted quiz attempts */
router.get('/courses/:courseId/sessions/:sessionId/quizzes', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session id', code: 'VALIDATION_ERROR' });
    }

    // 3a: `plan` is loaded so each attempt can carry its module TITLE. The
    // viewer rendered `Module ${attempt.moduleId}` — raw slugs like
    // "mod_intro_1" — for every student, because no title ever reached it.
    const session = await Session.findById(sessionId).select('courseId enrollmentId quizAttempts plan').lean();
    const ok = assertSessionBelongsToCourse(session, courseId);
    if (!ok.ok) return res.status(ok.status).json({ success: false, error: ok.error, code: ok.code });

    // Ensure enrollmentId belongs to this course (defense in depth)
    if (session.enrollmentId) {
      const enrollment = await Enrollment.findById(session.enrollmentId).select('courseId').lean();
      const enrollmentCourseId = enrollment?.courseId?.toString();
      if (enrollmentCourseId && enrollmentCourseId !== courseId) {
        return res.status(404).json({ success: false, error: 'Session not found', code: 'NOT_FOUND' });
      }
    }

    // Only submitted attempts are useful to the instructor (drafts are still
    // in-progress). Return just the presentation fields, most recent first.
    const planModules = Array.isArray(session.plan) ? session.plan : [];
    const titleByModuleId = new Map(planModules.map((m) => [m.id, m.title]));
    const indexByModuleId = new Map(planModules.map((m, i) => [m.id, i + 1]));
    const all = Array.isArray(session.quizAttempts) ? session.quizAttempts : [];
    const attempts = all
      .filter((a) => a && a.status === 'submitted')
      .map((a) => ({
        id: a.id,
        moduleId: a.moduleId,
        moduleTitle: titleByModuleId.get(a.moduleId) || null,
        moduleIndex: indexByModuleId.get(a.moduleId) ?? null,
        attemptNo: a.attemptNo,
        status: a.status,
        items: Array.isArray(a.items)
          ? a.items.map((it) => ({
              id: it.id,
              text: it.text,
              options: Array.isArray(it.options) ? it.options : [],
              correctIndex: it.correctIndex,
            }))
          : [],
        answers: Array.isArray(a.answers)
          ? a.answers.map((an) => ({ id: an.id, userIndex: an.userIndex }))
          : [],
        scorePct: a.scorePct,
        passed: a.passed,
        pointsEarned: a.pointsEarned,
        createdAt: a.createdAt,
        submittedAt: a.submittedAt,
        isRevision: !!a.isRevision,
        revisionTopic: a.revisionTopic,
      }))
      .sort((x, y) => {
        const tx = x.submittedAt ? new Date(x.submittedAt).getTime() : 0;
        const ty = y.submittedAt ? new Date(y.submittedAt).getTime() : 0;
        return ty - tx; // most recent submission first
      });

    return res.json({ success: true, data: { attempts, totalCount: attempts.length } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/students/:studentId/notes */
router.get('/courses/:courseId/students/:studentId/notes', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }
    const courseTopicId = req.query.courseTopicId ? String(req.query.courseTopicId) : null;
    if (courseTopicId && !mongoose.Types.ObjectId.isValid(courseTopicId)) {
      return res.status(400).json({ success: false, error: 'Invalid courseTopicId', code: 'VALIDATION_ERROR' });
    }

    const enrollment = await Enrollment.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      studentId: new mongoose.Types.ObjectId(studentId),
      status: 'active',
    }).select('_id').lean();
    if (!enrollment?._id) {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }

    const note = await InstructorStudentNote.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      enrollmentId: enrollment._id,
      studentId: new mongoose.Types.ObjectId(studentId),
      courseTopicId: courseTopicId ? new mongoose.Types.ObjectId(courseTopicId) : null,
      createdByInstructorId: new mongoose.Types.ObjectId(req.userId),
    })
      .select('tags note courseTopicId createdAt updatedAt')
      .lean();

    return res.json({
      success: true,
      data: {
        courseId,
        studentId,
        courseTopicId: courseTopicId || null,
        tags: note?.tags || [],
        note: note?.note || '',
        updatedAt: note?.updatedAt || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/students/:studentId/notes (upsert) */
router.post('/courses/:courseId/students/:studentId/notes', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }

    const courseTopicId = req.body?.courseTopicId ? String(req.body.courseTopicId) : null;
    if (courseTopicId && !mongoose.Types.ObjectId.isValid(courseTopicId)) {
      return res.status(400).json({ success: false, error: 'Invalid courseTopicId', code: 'VALIDATION_ERROR' });
    }

    const tagsRaw = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const tags = tagsRaw
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .slice(0, 20);

    const noteText = typeof req.body?.note === 'string' ? req.body.note : '';
    const note = noteText.trim().slice(0, 4000);

    const enrollment = await Enrollment.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      studentId: new mongoose.Types.ObjectId(studentId),
      status: 'active',
    }).select('_id').lean();
    if (!enrollment?._id) {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }

    const filter = {
      courseId: new mongoose.Types.ObjectId(courseId),
      enrollmentId: enrollment._id,
      studentId: new mongoose.Types.ObjectId(studentId),
      courseTopicId: courseTopicId ? new mongoose.Types.ObjectId(courseTopicId) : null,
      createdByInstructorId: new mongoose.Types.ObjectId(req.userId),
    };

    const updated = await InstructorStudentNote.findOneAndUpdate(
      filter,
      {
        $set: {
          tags,
          note,
        },
        $setOnInsert: {
          ...filter,
        },
      },
      { upsert: true, new: true }
    )
      .select('tags note courseTopicId updatedAt')
      .lean();

    return res.json({
      success: true,
      data: {
        courseId,
        studentId,
        courseTopicId: courseTopicId || null,
        tags: updated?.tags || [],
        note: updated?.note || '',
        updatedAt: updated?.updatedAt || null,
      },
    });
  } catch (e) {
    // Handle unique index collisions gracefully
    if (e?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Note already exists', code: 'CONFLICT' });
    }
    next(e);
  }
});

/**
 * PUT /v1/instructor/courses/:courseId/students/:studentId/class-context
 * Risk Insights v2 (Step 7). Sets the instructor's classroom-knowledge override
 * on the student-level note (courseTopicId: null). Body: { classContext }.
 * NOTE: this lives here (not instructorRoutes.js as the prompt suggested)
 * alongside its sibling per-student routes — same pattern as the B8 quiz route.
 */
router.put('/courses/:courseId/students/:studentId/class-context', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }
    const allowed = ['doing_well_in_class', 'confirmed_at_risk', null];
    let classContext = req.body?.classContext;
    if (classContext === undefined || classContext === '') classContext = null;
    if (!allowed.includes(classContext)) {
      return res.status(400).json({ success: false, error: 'Invalid classContext', code: 'VALIDATION_ERROR' });
    }

    const enrollment = await Enrollment.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      studentId: new mongoose.Types.ObjectId(studentId),
      status: 'active',
    }).select('_id').lean();
    if (!enrollment?._id) {
      return res.status(404).json({ success: false, error: 'Student not enrolled in this course', code: 'NOT_FOUND' });
    }

    const filter = {
      courseId: new mongoose.Types.ObjectId(courseId),
      enrollmentId: enrollment._id,
      studentId: new mongoose.Types.ObjectId(studentId),
      courseTopicId: null,
      createdByInstructorId: new mongoose.Types.ObjectId(req.userId),
    };
    const updated = await InstructorStudentNote.findOneAndUpdate(
      filter,
      { $set: { classContext }, $setOnInsert: { ...filter } },
      { upsert: true, new: true },
    ).select('classContext updatedAt').lean();

    return res.json({ success: true, data: { courseId, studentId, classContext: updated?.classContext ?? null, updatedAt: updated?.updatedAt || null } });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Conflict', code: 'CONFLICT' });
    }
    next(e);
  }
});

/**
 * GET /v1/instructor/courses/:courseId/students/:studentId/risk-trend
 * Risk Insights v2 (Step 6). Computes the student's risk score at 5 weekly
 * snapshots over the last 28 days (or from enrollment if shorter), reusing the
 * Step 2 scorer. Returns { points[], trend{} }.
 */
router.get('/courses/:courseId/students/:studentId/risk-trend', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student id', code: 'VALIDATION_ERROR' });
    }

    const { courseData, studentInputs } = await buildRiskInputs(courseId, { excludeSynthetic: false });
    const studentData = studentInputs.get(studentId.toString());
    if (!studentData) {
      return res.json({ success: true, data: { points: [], trend: { direction: 'stable', delta: 0, label: 'No activity yet' } } });
    }

    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    const enrolledAt = studentData.enrollmentCreatedAt ? new Date(studentData.enrollmentCreatedAt) : null;
    const earliest = studentData.earliestActivity ? new Date(studentData.earliestActivity) : null;
    let startRef = enrolledAt;
    if (earliest && (!startRef || earliest < startRef)) startRef = earliest;
    const tenureDays = startRef ? Math.floor((now.getTime() - startRef.getTime()) / DAY) : 0;

    // Snapshot offsets: today, -7, -14, -21, -28 (clamped to tenure so we never
    // sample before the student existed). Oldest first.
    const offsets = [28, 21, 14, 7, 0].filter((d) => d <= Math.max(0, tenureDays) || d === 0);
    const seen = new Set();
    const points = [];
    for (const off of offsets) {
      const cutoff = new Date(now.getTime() - off * DAY);
      const key = cutoff.toISOString().slice(0, 10);
      if (seen.has(key)) continue;
      seen.add(key);
      const r = computeRiskScore({ studentData, courseData, cutoffDate: cutoff });
      points.push({ date: key, score: r.riskScore, level: r.riskLevel });
    }

    let trend = { direction: 'stable', delta: 0, label: 'Stable' };
    if (points.length >= 2) {
      const delta = points[points.length - 1].score - points[0].score;
      const spanDays = Math.min(28, Math.max(0, tenureDays));
      if (delta <= -10) trend = { direction: 'improving', delta, label: `Improving over the last ${spanDays} days` };
      else if (delta >= 10) trend = { direction: 'declining', delta, label: `Declining over the last ${spanDays} days` };
      else trend = { direction: 'stable', delta, label: `Stable over the last ${spanDays} days` };
    } else if (points.length === 1) {
      trend = { direction: 'stable', delta: 0, label: `Stable since enrollment ${Math.max(0, tenureDays)} days ago` };
    }

    return res.json({ success: true, data: { points, trend } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/tree — course → topics → modules → milestones with attempt badges */
router.get('/courses/:courseId/tree', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getTreeAnalytics(req.params.courseId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/milestones — flat ranked-hardest milestone stats */
router.get('/courses/:courseId/milestones', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getMilestoneStats(req.params.courseId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/at-risk — students flagged by attempt patterns */
router.get('/courses/:courseId/at-risk', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const threshold = req.query.passRateThreshold != null
      ? Math.max(0, Math.min(100, parseInt(req.query.passRateThreshold, 10)))
      : 60;
    const data = await getAtRiskStudents(req.params.courseId, {
      ...parseSyntheticFlag(req),
      passRateThreshold: Number.isFinite(threshold) ? threshold : 60,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /v1/instructor/courses/:courseId/risk-distribution
 * Risk Insights v2 (Step 5). Re-scores the cohort against a topic subset for the
 * distribution chart + panel filters, reusing the canonical scorer.
 * Query: includeSynthetic, topicId (single), upToTopic (first-N by orderIndex).
 * Returns { topics: [{topicId,title,orderIndex}], rows: [...] }.
 */
router.get('/courses/:courseId/risk-distribution', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const { excludeSynthetic } = parseSyntheticFlag(req);
    const topicId = req.query.topicId && mongoose.Types.ObjectId.isValid(String(req.query.topicId))
      ? String(req.query.topicId) : null;
    const upToTopic = req.query.upToTopic != null ? parseInt(req.query.upToTopic, 10) : null;

    const rows = await getAtRiskStudents(req.params.courseId, {
      excludeSynthetic,
      topicIds: topicId ? [topicId] : null,
      upToTopicCount: (topicId == null && Number.isInteger(upToTopic)) ? upToTopic : null,
    });

    const topicDocs = await require('../models/CourseTopic')
      .find({ courseId: new mongoose.Types.ObjectId(req.params.courseId), status: 'published' })
      .select('_id title orderIndex')
      .sort({ orderIndex: 1 })
      .lean();
    const topics = topicDocs.map((t) => ({ topicId: t._id.toString(), title: t.title || 'Untitled', orderIndex: t.orderIndex ?? 0 }));

    res.json({ success: true, data: { topics, rows } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/heatmap — topic × student pass-rate grid */
router.get('/courses/:courseId/heatmap', requireAuth, requireRole('instructor'), requireCourseOwner, async (req, res, next) => {
  try {
    const data = await getTopicStudentHeatmap(req.params.courseId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/overview — cross-course KPIs for the instructor home */
router.get('/overview', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const data = await getCrossCourseKPIs(req.userId, parseSyntheticFlag(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /v1/instructor/briefing — one-shot narrative briefing across all courses.
 * Powers the dashboard hero card. Grounded in getCrossCourseKPIs output.
 */
router.get('/briefing', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const overview = await getCrossCourseKPIs(req.userId, parseSyntheticFlag(req));
    // Degrade only the narrative call — if analytics itself fails we still
    // want the loud 5xx, because that's a real bug in our code.
    try {
      const { briefing } = await runBriefing(overview);
      // Plant the probe only when a real briefing was generated — a lone
      // overgeneralization on an otherwise-empty card would out itself.
      const isStudyAccount = STUDY_PROBE_ENABLED && STUDY_PROBE_USER_SET.has(String(req.userId));
      if (isStudyAccount && !briefing) {
        // Loud skip: the moderator needs to know Probe 3 did not land this load.
        console.warn(`[study-probe] briefing probe SKIPPED for study account ${req.userId}: empty briefing from agent`);
      }
      const withProbe = isStudyAccount && briefing
        ? `${briefing} ${STUDY_PROBE_BRIEFING_SENTENCE}`
        : briefing;
      return res.json({ success: true, data: { briefing: withProbe, overview } });
    } catch (agentErr) {
      const reason = classifyAgentError(agentErr);
      if (!reason) throw agentErr;
      logDegraded('briefing', reason, agentErr);
      return res.json({
        success: true,
        data: { briefing: '', overview, degraded: true, reason },
      });
    }
  } catch (e) {
    next(e);
  }
});

/**
 * GET /v1/instructor/courses/:courseId/hot-signal — one-sentence alert for
 * the course page. Grounded in hardest milestones + at-risk students.
 */
router.get(
  '/courses/:courseId/hot-signal',
  requireAuth,
  requireRole('instructor'),
  requireCourseOwner,
  async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const flag = parseSyntheticFlag(req);
      const [milestones, atRisk, analytics] = await Promise.all([
        getMilestoneStats(courseId, flag),
        getAtRiskStudents(courseId, { ...flag, passRateThreshold: 60 }),
        getCourseAnalytics(courseId).catch(() => null),
      ]);
      const courseTitle = analytics?.courseTitle || analytics?.title || '';
      const totalAttempts = (milestones || []).reduce((s, m) => s + (m.attempts || 0), 0);
      if (!totalAttempts) {
        return res.json({
          success: true,
          data: {
            hotSignal: 'Not enough attempts yet — check back after students engage.',
            grounded: false,
          },
        });
      }
      try {
        const { hotSignal } = await runHotSignal({ milestones, atRisk, courseTitle });
        return res.json({ success: true, data: { hotSignal, grounded: true } });
      } catch (agentErr) {
        const reason = classifyAgentError(agentErr);
        if (!reason) throw agentErr;
        logDegraded('hot-signal', reason, agentErr);
        return res.json({
          success: true,
          data: { hotSignal: '', grounded: false, degraded: true, reason },
        });
      }
    } catch (e) {
      next(e);
    }
  }
);

/**
 * GET /v1/instructor/courses/:courseId/insight-cards — 3–5 narrative insight
 * cards for the Insights page. Grounded in tree + milestones + heatmap + at-risk.
 */
router.get(
  '/courses/:courseId/insight-cards',
  requireAuth,
  requireRole('instructor'),
  requireCourseOwner,
  async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const flag = parseSyntheticFlag(req);
      const [tree, milestones, heatmap, atRisk, analytics] = await Promise.all([
        getTreeAnalytics(courseId, flag),
        getMilestoneStats(courseId, flag),
        getTopicStudentHeatmap(courseId, flag),
        getAtRiskStudents(courseId, { ...flag, passRateThreshold: 60 }),
        getCourseAnalytics(courseId).catch(() => null),
      ]);
      const courseTitle = analytics?.courseTitle || analytics?.title || '';
      try {
        const { insightCards } = await runInsightCards({
          tree,
          milestones,
          heatmap,
          atRisk,
          courseTitle,
        });
        return res.json({ success: true, data: { insightCards } });
      } catch (agentErr) {
        const reason = classifyAgentError(agentErr);
        if (!reason) throw agentErr;
        logDegraded('insight-cards', reason, agentErr);
        return res.json({
          success: true,
          data: { insightCards: [], degraded: true, reason },
        });
      }
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
