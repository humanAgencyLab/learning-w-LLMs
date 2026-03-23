const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');

describe('Session Routes', () => {
  let testSessionId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
  });

  afterAll(async () => {
    // Clean up test database
    await Session.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Session.deleteMany({});
  });

  describe('POST /v1/sessions', () => {
    it('should create a new session with dummy profile injected', async () => {
      const response = await request(app)
        .post('/v1/sessions')
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.phase).toBe('pre');
      expect(response.body.data.mode).toBe('studying');
      expect(response.body.data.topic).toBe('General Learning');
      expect(response.body.data.points).toBe(0);
      expect(response.body.data.gems).toBe(0);
      expect(response.body.data.isViewOnly).toBe(false);
      expect(response.body.data.progressPct).toBe(0);
      expect(response.body.data.plan).toEqual([]);
      
      // Check dummy profile is injected
      expect(response.body.data.profile).toBeDefined();
      expect(response.body.data.profile.source).toBe('dummy');
      expect(response.body.data.profile.name).toBe('Alex');
      expect(response.body.data.profile.background).toBe('2nd-year CS undergrad');
      expect(response.body.data.profile.goals).toEqual(['Pass Algorithms midterm', 'Understand graph traversal well enough to explain it']);
      expect(response.body.data.profile.strengths).toEqual(['arrays', 'big-O basics', 'sorting fundamentals']);
      expect(response.body.data.profile.gaps).toEqual(['graph traversal', 'BFS vs DFS tradeoffs', 'recurrence intuition']);
      expect(response.body.data.profile.timePerDayMins).toBe(30);
      expect(response.body.data.profile.preferredStyle).toBe('examples-first');
      expect(response.body.data.profile.lastUpdated).toBeDefined();

      testSessionId = response.body.data.id;
    });

    it('should create a session with custom profile values', async () => {
      const sessionData = {
        topic: 'JavaScript Programming',
        chatTitle: 'Learning JS Basics',
        phase: 'learning',
        mode: 'studying',
        profile: {
          source: 'user',
          name: 'John Doe',
          background: 'Frontend developer with 2 years experience',
          goals: ['Master React', 'Learn Node.js backend development'],
          strengths: ['HTML/CSS', 'JavaScript basics', 'React components'],
          gaps: ['Node.js', 'Database design', 'API development'],
          timePerDayMins: 60,
          preferredStyle: 'theory-first',
          lastUpdated: new Date().toISOString()
        }
      };

      const response = await request(app)
        .post('/v1/sessions')
        .send(sessionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.topic).toBe('JavaScript Programming');
      expect(response.body.data.chatTitle).toBe('Learning JS Basics');
      expect(response.body.data.phase).toBe('learning');
      expect(response.body.data.mode).toBe('studying');
      expect(response.body.data.profile.name).toBe('John Doe');
      expect(response.body.data.profile.source).toBe('user');
      expect(response.body.data.profile.background).toBe('Frontend developer with 2 years experience');
      expect(response.body.data.profile.preferredStyle).toBe('theory-first');
    });

    it('should validate input data', async () => {
      const invalidData = {
        phase: 'invalid_phase',
        mode: 'invalid_mode',
        topic: '', // Empty string should be invalid
        profile: {
          source: 'dummy',
          name: '', // Empty name should be invalid
          background: 'Test background',
          goals: [], // Empty goals array should be invalid
          strengths: ['test'],
          gaps: ['test'],
          timePerDayMins: 5, // Below minimum
          preferredStyle: 'invalid_style'
        }
      };

      const response = await request(app)
        .post('/v1/sessions')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should reject empty or placeholder profiles', async () => {
      const emptyProfileData = {
        profile: {
          source: 'dummy',
          name: '', // Empty name
          background: 'Test',
          goals: ['test'],
          strengths: ['test'],
          gaps: ['test'],
          timePerDayMins: 30,
          preferredStyle: 'examples-first'
        }
      };

      const response = await request(app)
        .post('/v1/sessions')
        .send(emptyProfileData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
    });

    it('should inject dummy profile for anonymous placeholder', async () => {
      const anonymousProfileData = {
        profile: {
          source: 'dummy',
          name: 'Anonymous User', // Contains 'anonymous'
          background: 'Test',
          goals: ['test'],
          strengths: ['test'],
          gaps: ['test'],
          timePerDayMins: 30,
          preferredStyle: 'examples-first'
        }
      };

      const response = await request(app)
        .post('/v1/sessions')
        .send(anonymousProfileData)
        .expect(201);

      // Should inject dummy profile instead
      expect(response.body.data.profile.name).toBe('Alex');
      expect(response.body.data.profile.source).toBe('dummy');
    });

    it('should handle server errors gracefully', async () => {
      // Mock Session model to throw error
      const originalSave = Session.prototype.save;
      Session.prototype.save = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/v1/sessions')
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');

      // Restore original method
      Session.prototype.save = originalSave;
    });
  });

  describe('GET /v1/sessions/:id', () => {
    beforeEach(async () => {
      // Create a test session
      const session = new Session({
        phase: 'learning',
        mode: 'studying',
        topic: 'Test Topic',
        chatTitle: 'Test Chat',
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
          {
            id: 'msg1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date()
          },
          {
            id: 'msg2',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: new Date()
          }
        ],
        profile: {
          source: 'dummy',
          name: 'Test User',
          background: 'Intermediate developer',
          goals: ['Learn advanced concepts', 'Master new technologies'],
          strengths: ['Basic programming', 'Problem solving'],
          gaps: ['Advanced algorithms', 'System design'],
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
            answers: [
              {
                id: 'q1',
                userIndex: 0
              }
            ],
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
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should return 400 for invalid session ID format', async () => {
      const response = await request(app)
        .get('/v1/sessions/invalid-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });
  });

  describe('POST /v1/sessions/:id/resume', () => {
    beforeEach(async () => {
      // Create a test session with many messages
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
        plan: [
          {
            id: 'm1',
            title: 'Module 1',
            description: 'First module',
            status: 'in_progress',
            milestones: [
              { text: 'Milestone 1', completed: false }
            ],
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
          goals: ['Master the subject', 'Become an expert'],
          strengths: ['Advanced programming', 'Architecture design'],
          gaps: ['Machine learning', 'DevOps practices'],
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
      expect(response.body.data.lastMessages[0].id).toBe('msg5'); // Last 20 messages
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
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should return 400 for invalid session ID format', async () => {
      const response = await request(app)
        .post('/v1/sessions/invalid-id/resume')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should handle sessions with fewer than 20 messages', async () => {
      // Create a session with only 5 messages
      const session = new Session({
        phase: 'pre',
        mode: 'studying',
        topic: 'Short Session',
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
        .expect(200);

      expect(response.body.data.lastMessages).toHaveLength(5);
    });
  });
});
