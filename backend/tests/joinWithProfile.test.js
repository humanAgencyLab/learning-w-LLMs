/**
 * Pilot B1 regression: POST /v1/courses/join with the learner-profile payload.
 *
 * The join modal shipped selfRating 'some_knowledge', which is not in the
 * Enrollment enum — Mongoose threw ValidationError and the route surfaced
 * Express's default 500 HTML page, silently stalling the modal (only Skip
 * worked). The route now sanitizes priorKnowledge so any deployed client
 * version joins cleanly, and schema drift degrades to a JSON 400.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');

describe('POST /v1/courses/join — learner profile payload (pilot B1)', () => {
  const userIds = [];
  const courseIds = [];
  const enrollmentIds = [];
  let accessCode;
  let instructorToken;

  beforeAll(async () => {
    process.env.INSTRUCTOR_SIGNUP_SECRET = 'jest_instructor_secret_min_len_ok';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
    const instructor = await signup('instructor');
    instructorToken = instructor.token;
    const cRes = await request(app)
      .post('/v1/instructor/courses')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ title: 'B1 Join Regression Course' })
      .expect(201);
    courseIds.push(cRes.body.data.course._id);
    accessCode = cRes.body.data.course.accessCode;
  });

  afterAll(async () => {
    if (enrollmentIds.length) await Enrollment.deleteMany({ _id: { $in: enrollmentIds } });
    if (courseIds.length) await Course.deleteMany({ _id: { $in: courseIds } });
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.connection.close();
  });

  async function signup(role = 'student') {
    const body = {
      password: 'TestPassword123!',
      name: `B1T ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
      autoGenerateUsername: true,
    };
    if (role === 'instructor') {
      body.role = 'instructor';
      body.instructorSignupSecret = process.env.INSTRUCTOR_SIGNUP_SECRET;
    }
    const res = await request(app).post('/v1/auth/signup').send(body).expect(201);
    userIds.push(res.body.data.user._id);
    return { user: res.body.data.user, token: res.body.data.accessToken };
  }

  it('accepts the EXACT legacy modal payload (selfRating "some_knowledge") and persists a normalized profile', async () => {
    const { token } = await signup();
    const res = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accessCode,
        priorKnowledge: {
          programmingExposure: 'some',
          motivationType: 'curiosity',
          selfConfidence: 3,
          selfRating: 'some_knowledge', // the value that 500'd in the pilot
          relevantExperience: 'Took an intro course',
          specificGoals: 'Pass the exam',
        },
      })
      .expect(201);
    const pk = res.body.data.enrollment.priorKnowledge;
    expect(pk.selfRating).toBe('beginner'); // normalized, not rejected
    expect(pk.programmingExposure).toBe('some');
    expect(pk.motivationType).toBe('curiosity');
    expect(pk.selfConfidence).toBe(3);
    expect(pk.relevantExperience).toBe('Took an intro course');
    enrollmentIds.push(res.body.data.enrollment._id);

    // The profile is persisted on the enrollment record, not just echoed.
    const stored = await Enrollment.findById(res.body.data.enrollment._id).lean();
    expect(stored.priorKnowledge.selfRating).toBe('beginner');
    expect(stored.priorKnowledge.specificGoals).toBe('Pass the exam');
  });

  it('accepts the corrected frontend values verbatim', async () => {
    const { token } = await signup();
    const res = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ accessCode, priorKnowledge: { selfRating: 'none', programmingExposure: 'lots' } })
      .expect(201);
    expect(res.body.data.enrollment.priorKnowledge.selfRating).toBe('none');
    expect(res.body.data.enrollment.priorKnowledge.programmingExposure).toBe('lots');
    enrollmentIds.push(res.body.data.enrollment._id);
  });

  it('degrades unknown values to schema defaults instead of failing the join', async () => {
    const { token } = await signup();
    const res = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accessCode,
        priorKnowledge: { selfRating: 'wizard', programmingExposure: 'tons', motivationType: 'fame', selfConfidence: 99 },
      })
      .expect(201);
    const pk = res.body.data.enrollment.priorKnowledge;
    expect(pk.selfRating).toBe('none');
    expect(pk.programmingExposure).toBe('unknown');
    expect(pk.motivationType).toBe('unknown');
    expect(pk.selfConfidence).toBe(5); // clamped
    enrollmentIds.push(res.body.data.enrollment._id);
  });

  it('still joins cleanly with no profile at all (the Skip path)', async () => {
    const { token } = await signup();
    const res = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ accessCode })
      .expect(201);
    expect(res.body.success).toBe(true);
    enrollmentIds.push(res.body.data.enrollment._id);
  });

  it('never returns HTML — every join response parses as JSON with a success flag', async () => {
    const { token } = await signup();
    const res = await request(app)
      .post('/v1/courses/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ accessCode: 'ZZZZZZ', priorKnowledge: { selfRating: 'some_knowledge' } });
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body.success).toBe('boolean');
  });
});
