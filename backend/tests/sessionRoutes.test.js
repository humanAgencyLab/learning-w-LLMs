const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');
const User = require('../models/User');

describe('Session Routes', () => {
  let testSessionId;
  let authToken;
  let userId;
  const userIds = [];

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
  });

  afterAll(async () => {
    await Session.deleteMany({});
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Session.deleteMany({});
  });

  async function signupUser() {
    const name = `SRT ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ password: 'TestPassword123!', name, autoGenerateUsername: true })
      .expect(201);
    userIds.push(res.body.data.user._id);
    return {
      user: res.body.data.user,
      token: res.body.data.accessToken,
      userId: res.body.data.user._id,
    };
  }

  // Sign up once for the whole suite, reuse across describe blocks
  beforeAll(async () => {
    const u = await signupUser();
    authToken = u.token;
    userId = u.userId;
  });

  describe('POST /v1/sessions', () => {
    it('should create a new session with user profile injected', async () => {
      const response = await request(app)
        .post('/v1/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.phase).toBe('pre');
      expect(response.body.data.mode).toBe('studying');
      expect(response.body.data.points).toBe(0);
      expect(response.body.data.gems).toBe(0);
      expect(response.body.data.isViewOnly).toBe(false);
      expect(response.body.data.progressPct).toBe(0);
      expect(response.body.data.plan).toEqual([]);
      expect(response.body.data.profile).toBeDefined();

      testSessionId = response.body.data.id;
    });

    it('should create a session with custom topic and mode', async () => {
      const sessionData = {
        topic: 'JavaScript Programming',
        chatTitle: 'Learning JS Basics',
        mode: 'studying',
      };

      const response = await request(app)
        .post('/v1/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(sessionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.topic).toBe('JavaScript Programming');
      expect(response.body.data.chatTitle).toBe('Learning JS Basics');
      expect(response.body.data.mode).toBe('studying');
    });

    it('should validate input data', async () => {
      const invalidData = {
        phase: 'invalid_phase',
        mode: 'invalid_mode',
      };

      const response = await request(app)
        .post('/v1/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without auth token', async () => {
      await request(app)
        .post('/v1/sessions')
        .send({})
        .expect(401);
    });

    it('should handle server errors gracefully', async () => {
      const originalSave = Session.prototype.save;
      Session.prototype.save = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/v1/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');

      Session.prototype.save = originalSave;
    });
  });

  describe('GET /v1/sessions/:id', () => {
    beforeEach(async () => {
      const session = new Session({
        phase: 'learning',
        mode: 'studying',
        topic: 'Test Topic',
        chatTitle: 'Test Chat',
        userId: new mongoose.Types.ObjectId(userId),
        plan: [
          {
            id: 'm1',
            title: 'Module 1',
            description: 'First module',
            status: 'in_progress',
            milestones: [
              { text: 'Milestone 1', completed: true },
              { text: 'Milestone 2', completed: false }
            ],
            completedMilestones: [0],
            points: 50,
            difficulty: 'core'
          }
        ],
        activeModuleId: 'm1',
        points: 100,
        gems: 50,
        isViewOnly: false,
        progressPct: 25,
        messages: [
          { id: 'msg1', role: 'user', content: 'Hello', timestamp: new Date() },
          { id: 'msg2', role: 'assistant', content: 'Hi there!', timestamp: new Date() }
        ],
        profile: {
          source: 'dummy',
          name: 'Test User',
          background: 'Intermediate developer',
          goals: ['Learn advanced concepts'],
          strengths: ['Basic programming'],
          gaps: ['Advanced algorithms'],
          timePerDayMins: 45,
          preferredStyle: 'mixed',
          lastUpdated: new Date().toISOString()
        },
        quizAttempts: [
          {
            id: 'quiz1',
            moduleId: 'm1',
            attemptNo: 1,
            status: 'submitted',
            items: [
              {
                id: 'q1',
                text: 'What is JavaScript?',
                options: ['A programming language', 'A markup language', 'A database', 'A framework'],
                correctIndex: 0
              }
            ],
            answers: [{ id: 'q1', userIndex: 0 }],
            scorePct: 100,
            passed: true,
            pointsEarned: 50,
            createdAt: new Date(),
            submittedAt: new Date()
          }
        ]
      });

      await session.save();
      testSessionId = session._id.toString();
    });

    it('should fetch a session by ID', async () => {
      const response = await request(app)
        .get(`/v1/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testSessionId);
      expect(response.body.data.phase).toBe('learning');
      expect(response.body.data.mode).toBe('studying');
      expect(response.body.data.topic).toBe('Test Topic');
      expect(response.body.data.plan).toHaveLength(1);
      expect(response.body.data.messages).toHaveLength(2);
      expect(response.body.data.quizAttempts).toHaveLength(1);
      expect(response.body.data.profile.name).toBe('Test User');
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .get(`/v1/sessions/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should return error for invalid session ID format', async () => {
      const response = await request(app)
        .get('/v1/sessions/invalid-id')
        .set('Authorization', `Bearer ${authToken}`);

      // Mongoose CastError on invalid ObjectId — returns 500 from ownership middleware
      expect([404, 500]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /v1/sessions/:id/resume', () => {
    beforeEach(async () => {
      const messages = [];
      for (let i = 0; i < 25; i++) {
        messages.push({
          id: `msg${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: new Date(Date.now() + i * 1000)
        });
      }

      const session = new Session({
        phase: 'learning',
        mode: 'studying',
        topic: 'Resume Test',
        chatTitle: 'Resume Chat',
        userId: new mongoose.Types.ObjectId(userId),
        plan: [
          {
            id: 'm1',
            title: 'Module 1',
            description: 'First module',
            status: 'in_progress',
            milestones: [{ text: 'Milestone 1', completed: false }],
            completedMilestones: [],
            points: 50,
            difficulty: 'core'
          }
        ],
        activeModuleId: 'm1',
        points: 200,
        gems: 100,
        isViewOnly: false,
        progressPct: 50,
        messages: messages,
        profile: {
          source: 'dummy',
          name: 'Resume User',
          background: 'Advanced developer',
          goals: ['Master the subject'],
          strengths: ['Advanced programming'],
          gaps: ['Machine learning'],
          timePerDayMins: 90,
          preferredStyle: 'theory-first',
          lastUpdated: new Date().toISOString()
        }
      });

      await session.save();
      testSessionId = session._id.toString();
    });

    it('should return minimal hydrate payload', async () => {
      const response = await request(app)
        .post(`/v1/sessions/${testSessionId}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('phase');
      expect(response.body.data).toHaveProperty('mode');
      expect(response.body.data).toHaveProperty('topic');
      expect(response.body.data).toHaveProperty('chatTitle');
      expect(response.body.data).toHaveProperty('plan');
      expect(response.body.data).toHaveProperty('activeModuleId');
      expect(response.body.data).toHaveProperty('points');
      expect(response.body.data).toHaveProperty('gems');
      expect(response.body.data).toHaveProperty('isViewOnly');
      expect(response.body.data).toHaveProperty('progressPct');
      expect(response.body.data).toHaveProperty('lastMessages');
      expect(response.body.data).toHaveProperty('profile');

      // Should only return last 20 messages
      expect(response.body.data.lastMessages).toHaveLength(20);
      expect(response.body.data.lastMessages[0].id).toBe('msg5');
      expect(response.body.data.lastMessages[19].id).toBe('msg24');

      // Should not include full messages array or quizAttempts
      expect(response.body.data).not.toHaveProperty('messages');
      expect(response.body.data).not.toHaveProperty('quizAttempts');
      expect(response.body.data).not.toHaveProperty('userId');
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post(`/v1/sessions/${fakeId}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return error for invalid session ID format', async () => {
      const response = await request(app)
        .post('/v1/sessions/invalid-id/resume')
        .set('Authorization', `Bearer ${authToken}`);

      expect([404, 500]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it('should handle sessions with fewer than 20 messages', async () => {
      const session = new Session({
        phase: 'pre',
        mode: 'studying',
        topic: 'Short Session',
        userId: new mongoose.Types.ObjectId(userId),
        messages: [
          { id: 'msg1', role: 'user', content: 'Hello', timestamp: new Date() },
          { id: 'msg2', role: 'assistant', content: 'Hi', timestamp: new Date() },
          { id: 'msg3', role: 'user', content: 'How are you?', timestamp: new Date() },
          { id: 'msg4', role: 'assistant', content: 'Good', timestamp: new Date() },
          { id: 'msg5', role: 'user', content: 'Great!', timestamp: new Date() }
        ],
        profile: {
          source: 'dummy',
          name: 'Short User',
          background: 'Beginner developer',
          goals: ['Learn basics'],
          strengths: ['Enthusiasm'],
          gaps: ['Everything'],
          timePerDayMins: 20,
          preferredStyle: 'examples-first',
          lastUpdated: new Date().toISOString()
        }
      });

      await session.save();

      const response = await request(app)
        .post(`/v1/sessions/${session._id}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.lastMessages).toHaveLength(5);
    });
  });
});
