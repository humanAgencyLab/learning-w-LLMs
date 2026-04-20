const { runAgentWithTools } = require('./framework/baseAgent');
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const {
  getTreeAnalytics,
  getMilestoneStats,
  getAtRiskStudents,
  getCrossCourseKPIs,
  getTopicStudentHeatmap,
} = require('../services/milestoneAnalyticsService');
const { getCourseAnalytics, getInstructorStudentDetail } = require('../services/analyticsService');

// Scope guard: an instructor may only query courses they own. Returns true if
// the courseId was passed as null (cross-course scope) OR if instructorId owns
// the course. Throws otherwise.
async function assertCourseOwnership(instructorId, courseId) {
  if (!courseId) return true;
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error(`Invalid courseId: ${courseId}`);
  }
  const c = await Course.findOne({ _id: courseId, instructorId }).select('_id').lean();
  if (!c) throw new Error('Course not found or not owned by instructor');
  return true;
}

async function assertStudentEnrolledInOwnedCourse(instructorId, studentId, courseIdOpt) {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error(`Invalid studentId: ${studentId}`);
  }
  const query = { instructorId };
  if (courseIdOpt) query._id = courseIdOpt;
  const owned = await Course.find(query).select('_id').lean();
  if (!owned.length) throw new Error('No owned courses to check against');
  const ownedIds = owned.map((c) => c._id);
  const enrollment = await Enrollment.findOne({
    courseId: { $in: ownedIds },
    studentId,
    status: 'active',
  }).select('courseId').lean();
  if (!enrollment) throw new Error('Student is not enrolled in any of your courses');
  return enrollment.courseId.toString();
}

const SYSTEM_PROMPT = `You are an analytics assistant for an instructor using a learning platform.
Your job is to answer questions about their courses and students by calling the
tools provided — do NOT hallucinate numbers or names.

Principles:
- Always ground every claim in a tool call. If you need a number, look it up.
- If a question requires a courseId or studentId the user did not provide, use
  the current-scope values from the user's message header (lines starting
  "scope:") when present.
- If still ambiguous, ask one concise clarifying question rather than guessing.
- Prefer 2–5 sentences. Name students and milestones explicitly when referring to
  them; link counts to the underlying numbers ("12 attempts, 3 passed").
- Treat students with isSynthetic=true as real classroom data for the purposes
  of this instructor — the synthetic cohort is the study cohort.
- If a tool returns an error, report it briefly and suggest what the user can
  try next (e.g., passing a courseId).`;

/**
 * Run one chatbot turn. Returns { reply, toolCalls }.
 *
 * @param {object} opts
 * @param {string} opts.instructorId         – owner id, used for scope checks
 * @param {string} [opts.courseId]           – current route scope (optional)
 * @param {string} [opts.studentId]          – current route scope (optional)
 * @param {boolean} [opts.includeSynthetic]  – default true for study views
 * @param {Array} opts.messages              – prior {role, content}[]
 * @param {string} opts.userMessage          – latest user turn
 */
async function runInstructorInsights({
  instructorId,
  courseId = null,
  studentId = null,
  includeSynthetic = true,
  messages = [],
  userMessage,
}) {
  const excludeSynthetic = !includeSynthetic;

  const tools = [
    {
      name: 'listCourses',
      description: 'List every course this instructor owns (id, title, status, enrollmentCount).',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const courses = await Course.find({ instructorId })
          .select('_id title status accessCode')
          .lean();
        const counts = await Enrollment.aggregate([
          { $match: { courseId: { $in: courses.map((c) => c._id) }, status: 'active' } },
          { $group: { _id: '$courseId', n: { $sum: 1 } } },
        ]);
        const cmap = new Map(counts.map((c) => [c._id.toString(), c.n]));
        return courses.map((c) => ({
          courseId: c._id.toString(),
          title: c.title,
          status: c.status,
          accessCode: c.accessCode,
          enrollmentCount: cmap.get(c._id.toString()) || 0,
        }));
      },
    },
    {
      name: 'courseOverviewKPIs',
      description: 'Cross-course KPIs for this instructor: total attempts, pass rate, at-risk count, per-course breakdown.',
      parameters: { type: 'object', properties: {} },
      handler: async () => getCrossCourseKPIs(instructorId, { excludeSynthetic }),
    },
    {
      name: 'courseAnalytics',
      description: 'Enrollment / session / quiz-level analytics for one course (legacy topic-level view).',
      parameters: {
        type: 'object',
        properties: { courseId: { type: 'string', description: 'Course id' } },
        required: ['courseId'],
      },
      handler: async (args) => {
        await assertCourseOwnership(instructorId, args.courseId);
        return getCourseAnalytics(args.courseId);
      },
    },
    {
      name: 'courseTree',
      description: 'Hierarchical tree of Topics → Modules → Milestones with attempt/pass counts for a course.',
      parameters: {
        type: 'object',
        properties: { courseId: { type: 'string' } },
        required: ['courseId'],
      },
      handler: async (args) => {
        await assertCourseOwnership(instructorId, args.courseId);
        return getTreeAnalytics(args.courseId, { excludeSynthetic });
      },
    },
    {
      name: 'milestoneAttemptStats',
      description: 'Flat list of milestones across the course ranked by difficulty (fail rate, attempts).',
      parameters: {
        type: 'object',
        properties: { courseId: { type: 'string' } },
        required: ['courseId'],
      },
      handler: async (args) => {
        await assertCourseOwnership(instructorId, args.courseId);
        return getMilestoneStats(args.courseId, { excludeSynthetic });
      },
    },
    {
      name: 'listStrugglingStudents',
      description: 'Students flagged as at-risk in a course by attempt patterns (low pass rate, auto-advances, many retries).',
      parameters: {
        type: 'object',
        properties: {
          courseId: { type: 'string' },
          passRateThreshold: {
            type: 'number',
            description: 'Pass rate below this % counts as low_pass_rate. Default 60.',
          },
        },
        required: ['courseId'],
      },
      handler: async (args) => {
        await assertCourseOwnership(instructorId, args.courseId);
        return getAtRiskStudents(args.courseId, {
          excludeSynthetic,
          passRateThreshold: args.passRateThreshold ?? 60,
        });
      },
    },
    {
      name: 'topicStudentHeatmap',
      description: 'Topic × student pass-rate grid for a course (useful for spotting per-persona difficulty patterns).',
      parameters: {
        type: 'object',
        properties: { courseId: { type: 'string' } },
        required: ['courseId'],
      },
      handler: async (args) => {
        await assertCourseOwnership(instructorId, args.courseId);
        return getTopicStudentHeatmap(args.courseId, { excludeSynthetic });
      },
    },
    {
      name: 'studentProfile',
      description: 'Full per-topic learning history for one student in one of the instructor\'s courses.',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'string' },
          courseId: { type: 'string' },
        },
        required: ['studentId'],
      },
      handler: async (args) => {
        const cid = args.courseId
          ? (await assertCourseOwnership(instructorId, args.courseId), args.courseId)
          : await assertStudentEnrolledInOwnedCourse(instructorId, args.studentId);
        const detail = await getInstructorStudentDetail(cid, args.studentId);
        const user = await User.findById(args.studentId)
          .select('name username profile.programmingExposure profile.motivationType profile.selfConfidence profile.isSynthetic profile.personaTag')
          .lean();
        return { courseId: cid, user, detail };
      },
    },
  ];

  const scopeLines = [];
  if (courseId) scopeLines.push(`scope: courseId=${courseId}`);
  if (studentId) scopeLines.push(`scope: studentId=${studentId}`);
  scopeLines.push(`scope: includeSynthetic=${includeSynthetic ? 'true' : 'false'}`);
  const header = scopeLines.join('\n');

  const convoMessages = [
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: header ? `${header}\n\n${userMessage}` : userMessage },
  ];

  const out = await runAgentWithTools({
    taskName: 'instructor_insights',
    systemPrompt: SYSTEM_PROMPT,
    messages: convoMessages,
    tools,
    maxIterations: 5,
    onToolCall: (name, args, result) => {
      const resPreview = (() => {
        try {
          const s = JSON.stringify(result);
          return s.length > 140 ? `${s.slice(0, 140)}…` : s;
        } catch {
          return '[unserializable]';
        }
      })();
      console.log(
        `[instructorInsights] tool=${name} args=${JSON.stringify(args).slice(0, 200)} result=${resPreview}`
      );
    },
  });

  return { reply: out.content, toolCalls: out.toolCalls, iterations: out.iterations };
}

module.exports = { runInstructorInsights };
