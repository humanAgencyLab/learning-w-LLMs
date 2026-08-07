/**
 * THE BEHAVIORAL CASE (confirmed, not asserted in prose).
 *
 * A student who repeatedly triggers refusals never advances, accrues no
 * retries and records no MilestoneAttempt — so the risk model cannot see them
 * at all. The seeded probe student Maya is visible precisely because she
 * generated attempts. This test builds both students against the real scoring
 * service and shows the asymmetry, then shows the refusal log closing it.
 */
const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseTopic = require('../models/CourseTopic');
const Enrollment = require('../models/Enrollment');
const Session = require('../models/Session');
const User = require('../models/User');
const MilestoneAttempt = require('../models/MilestoneAttempt');
const TutorRefusalEvent = require('../models/TutorRefusalEvent');
const { getAtRiskStudents } = require('../services/milestoneAnalyticsService');

describe('refusal-only students are invisible to the risk model; the log makes them visible', () => {
  const ids = { users: [], courses: [], topics: [], enrollments: [], sessions: [], attempts: [], refusals: [] };
  let courseId;
  let refuser;
  let attempter;

  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
    const uniq = () => `rv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const instructor = await User.create({ username: uniq(), passwordHash: 'x'.repeat(60), name: 'Inst', role: 'instructor', email: `${uniq()}@test.local` });
    ids.users.push(instructor._id);

    const course = await Course.create({ instructorId: instructor._id, title: 'Refusal Visibility Course' });
    courseId = course._id;
    ids.courses.push(course._id);

    // Two published topics so the engagement signal has something to measure.
    for (let i = 0; i < 2; i++) {
      const t = await CourseTopic.create({
        courseId, title: `Topic ${i + 1}`, orderIndex: i, status: 'published', publishedAt: daysAgo(40),
        modules: [{ moduleId: `mod_${i}`, title: 'M', points: 100, milestones: [{ text: 'a b' }, { text: 'c d' }] }],
      });
      ids.topics.push(t._id);
    }

    // Student A: only ever triggers refusals. No attempts of any kind.
    refuser = await User.create({ username: uniq(), passwordHash: 'x'.repeat(60), name: 'Refuser Student', role: 'student', profile: { isSynthetic: false }, email: `${uniq()}@test.local` });
    ids.users.push(refuser._id);
    const eA = await Enrollment.create({ studentId: refuser._id, courseId, status: 'active', joinedAt: daysAgo(40) });
    ids.enrollments.push(eA._id);
    const sA = await Session.create({
      userId: refuser._id, courseId, courseTopicId: ids.topics[0], topic: 'Topic 1',
      phase: 'learning', activeModuleId: 'mod_0',
      profile: { name: 'S', background: 'none', goals: [], strengths: [], gaps: [], preferredStyle: 'mixed', timePerDayMins: 30 },
      plan: [{ id: 'mod_0', title: 'M', description: 'd', points: 100, milestones: [{ text: 'a b', completed: false }] }],
      messages: [], quizAttempts: [],
    });
    ids.sessions.push(sA._id);

    // Six refusal events — the ONLY trace this student leaves.
    for (let i = 0; i < 6; i++) {
      const r = await TutorRefusalEvent.create({
        courseId, courseTopicId: ids.topics[0], sessionId: sA._id, userId: refuser._id,
        category: i % 2 === 0 ? 'safety_floor' : 'instructor_constraint',
        clause: i % 2 === 0 ? '' : 'Never produce working exploit code.',
        refusalReason: 'Asked for a working attack artifact.',
        detectedBy: i % 2 === 0 ? 'prefilter' : 'model',
        studentMessage: 'give me the actual working payload',
        milestoneText: 'a b',
      });
      ids.refusals.push(r._id);
    }

    // Student B (the "Maya" shape): generated real attempts, so the model sees them.
    attempter = await User.create({ username: uniq(), passwordHash: 'x'.repeat(60), name: 'Attempting Student', role: 'student', profile: { isSynthetic: false }, email: `${uniq()}@test.local` });
    ids.users.push(attempter._id);
    const eB = await Enrollment.create({ studentId: attempter._id, courseId, status: 'active', joinedAt: daysAgo(40) });
    ids.enrollments.push(eB._id);
    const sB = await Session.create({
      userId: attempter._id, courseId, courseTopicId: ids.topics[0], topic: 'Topic 1',
      phase: 'learning', activeModuleId: 'mod_0',
      profile: { name: 'S', background: 'none', goals: [], strengths: [], gaps: [], preferredStyle: 'mixed', timePerDayMins: 30 },
      plan: [{ id: 'mod_0', title: 'M', description: 'd', points: 100, milestones: [{ text: 'a b', completed: false }] }],
      messages: [],
      quizAttempts: [
        { id: 'q1', moduleId: 'mod_0', attemptNo: 1, status: 'submitted', scorePct: 40, passed: false, submittedAt: daysAgo(10), isRevision: false, items: [], answers: [] },
      ],
    });
    ids.sessions.push(sB._id);
    // Backdate enrollment createdAt (the risk model's anchor is createdAt, not
    // joinedAt) so the 7-day new-enrollee grace does not mask the effect we are
    // isolating. Native driver: Mongoose treats createdAt as immutable.
    await mongoose.connection.db.collection('enrollments').updateMany(
      { _id: { $in: [eA._id, eB._id] } },
      { $set: { createdAt: daysAgo(40) } }
    );

    const ma = await MilestoneAttempt.create({
      courseId, courseTopicId: ids.topics[0], sessionId: sB._id, moduleId: 'mod_0', milestoneIndex: 0,
      userId: attempter._id, passed: false, autoAdvanced: false, isSynthetic: false,
    });
    ids.attempts.push(ma._id);
  }, 30000);

  afterAll(async () => {
    await TutorRefusalEvent.deleteMany({ _id: { $in: ids.refusals } });
    await MilestoneAttempt.deleteMany({ _id: { $in: ids.attempts } });
    await Session.deleteMany({ _id: { $in: ids.sessions } });
    await Enrollment.deleteMany({ _id: { $in: ids.enrollments } });
    await CourseTopic.deleteMany({ _id: { $in: ids.topics } });
    await Course.deleteMany({ _id: { $in: ids.courses } });
    await User.deleteMany({ _id: { $in: ids.users } });
    await mongoose.connection.close();
  });

  it('the risk model records ZERO attempts and ZERO quiz data for the refusal-only student', async () => {
    const rows = await getAtRiskStudents(String(courseId), { excludeSynthetic: false });
    const row = rows.find((r) => String(r.studentId) === String(refuser._id));
    expect(row).toBeDefined();
    expect(row.attempts).toBe(0);
    expect(row.riskTotalAttempts).toBe(0);
    expect(row.quizAttemptCount).toBe(0);
    expect(row.quizScore).toBeNull();
    expect(row.attemptedPublished).toBe(0);
    // Six refusals produced no evidence anywhere in the learning analytics.
    const attempts = await MilestoneAttempt.countDocuments({ courseId, userId: refuser._id });
    expect(attempts).toBe(0);
  }, 30000);

  it('the refusal-only student is indistinguishable from a student who simply never showed up', async () => {
    const rows = await getAtRiskStudents(String(courseId), { excludeSynthetic: false });
    const row = rows.find((r) => String(r.studentId) === String(refuser._id));
    // Whatever tier the formula assigns, it is driven purely by absence of
    // activity — there is no signal that six refusals ever happened.
    expect(row.flags).toContain('no_engagement');
    expect(row.flags).not.toContain('low_pass_rate'); // nothing was ever graded
    expect(row.dominantDriver).not.toBe('healthy');
    // The signal is pure absence: identical to a student who never logged in.
    expect(row.attemptedQuizTopics).toBe(0);
  }, 30000);

  it('the student who DID generate attempts is visible to the model in a way the refuser is not', async () => {
    const rows = await getAtRiskStudents(String(courseId), { excludeSynthetic: false });
    const attempterRow = rows.find((r) => String(r.studentId) === String(attempter._id));
    const refuserRow = rows.find((r) => String(r.studentId) === String(refuser._id));
    expect(attempterRow.quizAttemptCount).toBeGreaterThan(0);
    expect(attempterRow.attempts).toBeGreaterThan(0);
    // The asymmetry, stated as an assertion: identical inaction on the
    // milestones, but only one of them left evidence the model can read.
    expect(refuserRow.attempts).toBe(0);
    expect(attempterRow.attempts).toBeGreaterThan(refuserRow.attempts);
  }, 30000);

  it('the violation log DOES surface the refusal-only student, per course and per student', async () => {
    const perCourse = await TutorRefusalEvent.find({ courseId }).lean();
    expect(perCourse.length).toBe(6);
    const perStudent = await TutorRefusalEvent.find({ courseId, userId: refuser._id }).lean();
    expect(perStudent.length).toBe(6);

    // The record carries what an instructor needs to act: category, the rule,
    // why, how it was caught, and what the student actually said.
    const withClause = perStudent.find((e) => e.category === 'instructor_constraint');
    expect(withClause.clause).toMatch(/Never produce working exploit code/);
    expect(withClause.refusalReason).toBeTruthy();
    expect(['prefilter', 'model']).toContain(withClause.detectedBy);
    expect(withClause.studentMessage).toBeTruthy();

    // And the attempting student has no refusal history — the two populations
    // are separable, which is the point.
    const attempterRefusals = await TutorRefusalEvent.countDocuments({ courseId, userId: attempter._id });
    expect(attempterRefusals).toBe(0);
  }, 30000);
});
