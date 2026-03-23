const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Course = require('../models/Course');
const CourseTopic = require('../models/CourseTopic');
const Enrollment = require('../models/Enrollment');
const Session = require('../models/Session');

describe('Instructor / course / enrollment routes', () => {
  const userIds = [];
  const courseIds = [];
  const topicIds = [];
  const enrollmentIds = [];
  const sessionIds = [];

  beforeAll(async () => {
    process.env.INSTRUCTOR_SIGNUP_SECRET = 'jest_instructor_secret_min_len_ok';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
  });

  afterAll(async () => {
    if (sessionIds.length) await Session.deleteMany({ _id: { $in: sessionIds } });
    if (topicIds.length) await CourseTopic.deleteMany({ _id: { $in: topicIds } });
    if (enrollmentIds.length) await Enrollment.deleteMany({ _id: { $in: enrollmentIds } });
    if (courseIds.length) await Course.deleteMany({ _id: { $in: courseIds } });
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.connection.close();
  });

  async function signupUser(role = 'student') {
    const password = 'TestPassword123!';
    const name = `ICRT ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      password,
      name,
      autoGenerateUsername: true,
    };
    if (role === 'instructor') {
      body.role = 'instructor';
      body.instructorSignupSecret = process.env.INSTRUCTOR_SIGNUP_SECRET;
    }
    const res = await request(app).post('/v1/auth/signup').send(body).expect(201);
    userIds.push(res.body.data.user._id);
    return {
      user: res.body.data.user,
      token: res.body.data.accessToken,
    };
  }

  it('returns 403 when student hits instructor course create', async () => {
    const { token } = await signupUser('student');
    const res = await request(app)
      .post('/v1/instructor/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'X' })
      .expect(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });

  it('instructor owns course; student joins; only published topics visible; start seeds learning session', async () => {
    const instructor = await signupUser('instructor');
    const student = await signupUser('student');

    const cRes = await request(app)
      .post('/v1/instructor/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Jest Course Flow' })
      .expect(201);
    const courseId = cRes.body.data.course._id;
    courseIds.push(courseId);

    const tDraft = await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Jest Draft Topic' })
      .expect(201);
    const draftId = tDraft.body.data.topic._id;
    topicIds.push(draftId);

    await request(app)
      .get(`/v1/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(403);

    const join = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ accessCode: cRes.body.data.course.accessCode })
      .expect(201);
    enrollmentIds.push(join.body.data.enrollment._id);

    const pubListBefore = await request(app)
      .get(`/v1/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(pubListBefore.body.data.topics).toEqual([]);

    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${draftId}/approve`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${draftId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);

    const pubListAfter = await request(app)
      .get(`/v1/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(pubListAfter.body.data.topics.length).toBe(1);

    const start = await request(app)
      .post(`/v1/courses/${courseId}/topics/${draftId}/start`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(201);
    expect(start.body.data.phase).toBe('learning');
    expect(start.body.data.sessionId).toBeTruthy();
    sessionIds.push(start.body.data.sessionId);

    const sess = await Session.findById(start.body.data.sessionId);
    expect(sess.phase).toBe('learning');
    expect(sess.planApproved).toBe(true);
    expect(sess.courseId.toString()).toBe(courseId);
    expect(sess.courseTopicId.toString()).toBe(draftId);
  });

  it('topic status transitions: invalid transitions return 400', async () => {
    const instructor = await signupUser('instructor');
    const cRes = await request(app)
      .post('/v1/instructor/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Jest Status Transitions' })
      .expect(201);
    const courseId = cRes.body.data.course._id;
    courseIds.push(courseId);

    const tRes = await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Transition Topic' })
      .expect(201);
    const topicId = tRes.body.data.topic._id;
    topicIds.push(topicId);

    // draft -> publish should fail (must approve first) — returns 409
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(409);

    // draft -> unpublish should fail — returns 409
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/unpublish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(409);

    // draft -> approve should succeed
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/approve`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);

    // approved -> publish should succeed
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);

    // published -> unpublish should succeed
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/unpublish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);
  });

  it('session resume returns courseId and courseTopicId for course-seeded sessions', async () => {
    const instructor = await signupUser('instructor');
    const student = await signupUser('student');

    const cRes = await request(app)
      .post('/v1/instructor/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Jest Resume Course' })
      .expect(201);
    const courseId = cRes.body.data.course._id;
    courseIds.push(courseId);

    const tRes = await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Resume Topic' })
      .expect(201);
    const topicId = tRes.body.data.topic._id;
    topicIds.push(topicId);

    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/approve`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);
    await request(app)
      .post(`/v1/instructor/courses/${courseId}/topics/${topicId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(200);

    const join = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ accessCode: cRes.body.data.course.accessCode })
      .expect(201);
    enrollmentIds.push(join.body.data.enrollment._id);

    const start = await request(app)
      .post(`/v1/courses/${courseId}/topics/${topicId}/start`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(201);
    const sessionId = start.body.data.sessionId;
    sessionIds.push(sessionId);

    // Resume and verify courseId/courseTopicId are present
    const resume = await request(app)
      .post(`/v1/sessions/${sessionId}/resume`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(resume.body.data.courseId).toBe(courseId);
    expect(resume.body.data.courseTopicId).toBe(topicId);
    expect(resume.body.data.phase).toBe('learning');

    // GET session should also return them
    const get = await request(app)
      .get(`/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(get.body.data.courseId).toBe(courseId);
    expect(get.body.data.courseTopicId).toBe(topicId);
  });

  it('student cannot access another instructor analytics or course mutate', async () => {
    const a = await signupUser('instructor');
    const b = await signupUser('instructor');
    const cRes = await request(app)
      .post('/v1/instructor/courses')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ title: 'Jest Course A' })
      .expect(201);
    const courseId = cRes.body.data.course._id;
    courseIds.push(courseId);

    await request(app)
      .patch(`/v1/instructor/courses/${courseId}`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ title: 'Hacked' })
      .expect(403);
    await request(app)
      .get(`/v1/instructor/courses/${courseId}/analytics`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(403);
  });
});
