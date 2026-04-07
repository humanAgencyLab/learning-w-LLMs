// Mock Groq SDK BEFORE requiring any modules
const mockGroqCreate = jest.fn().mockResolvedValue({
  choices: [{ message: { content: "ok" } }],
  usage: { completion_tokens: 10 }
});

jest.mock('groq-sdk', () => {
  return {
    Groq: jest.fn().mockImplementation(() => ({
      responses: { create: mockGroqCreate },
      chat: { completions: { create: mockGroqCreate } },
    })),
  };
});

const request = require('supertest');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const { resetGroqClient } = require('../lib/llmClient');
let app;

describe('Rate Limiting', () => {
  let testSessionId;
  let accessToken;
  let userId;

  beforeAll(async () => {
    // Enable rate limiting for these tests
    process.env.RATE_LIMIT_ENABLED = 'true';
    // Force low limits so we can deterministically exceed them in tests
    process.env.RL_CHAT = '3';
    process.env.RL_ASSESSMENT = '2';
    process.env.RL_QUIZ_START = '2';
    process.env.RL_QUIZ_SUBMIT = '2';
    // Load app after env is set
    app = require('../app');
    
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms-test');

    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({
        password: 'TestPassword123!',
        name: 'Rate Limit Test User',
        username: `ratelimit_test_${Date.now()}`
      })
      .expect(201);
    accessToken = signupRes.body?.data?.accessToken;
    const userObj = signupRes.body?.data?.user;
    userId = userObj?.id || userObj?._id;
  });
  
  beforeEach(async () => {
    // Create a test session
    const session = new Session({
      userId: new mongoose.Types.ObjectId(userId),
      phase: 'learning',
      mode: 'studying',
      topic: 'JavaScript Fundamentals',
      chatTitle: 'Learn JavaScript',
      plan: [
        { id: '1', title: 'Variables', description: 'Learn about variables', points: 30, status: 'in_progress' }
      ],
      activeModuleId: '1',
      points: 0,
      gems: 0,
      progressPct: 0,
      isViewOnly: false,
      messages: [],
      profile: {
        source: 'dummy',
        name: 'Test User',
        background: 'Test background',
        goals: ['Test goal'],
        strengths: ['Test strength'],
        gaps: ['Test gap'],
        timePerDayMins: 30,
        preferredStyle: 'examples-first',
        lastUpdated: new Date().toISOString()
      }
    });

    await session.save();
    testSessionId = session._id;

    // Reset groq client
    resetGroqClient();
  });

  afterEach(async () => {
    // Clean up test data
    await Session.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Chat Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      // Mock successful chat response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Hello! How can I help you learn?'
          }
        }],
        usage: {
          completion_tokens: 10
        }
      });

      const response = await request(app)
        .post('/v1/chat')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should rate limit chat requests', async () => {
      // Mock successful chat response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Hello! How can I help you learn?'
          }
        }],
        usage: {
          completion_tokens: 10
        }
      });

      // IMPORTANT: send sequentially to avoid concurrent writes to the same Session.
      // Assert that we eventually hit 429 once the limit is exceeded.
      let rateLimitedResponse = null;
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/v1/chat')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            sessionId: testSessionId,
            userMessage: `Message ${i}`
          });

        if (res.status === 429) {
          rateLimitedResponse = res;
          break;
        }
      }

      expect(rateLimitedResponse).toBeTruthy();
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.code).toBe('RATE_LIMITED');
      expect(rateLimitedResponse.body.message).toContain('Too many requests');
      expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
    });
  });

  describe('Assessment Rate Limiting', () => {
    it('should rate limit assessment requests', async () => {
      await Session.findByIdAndUpdate(testSessionId, { phase: 'pre' });
      // Mock successful assessment response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              plan: [
                { moduleId: '1', title: 'Variables', points: 30, difficulty: 'intro' },
                { moduleId: '2', title: 'Functions', points: 40, difficulty: 'core' },
                { moduleId: '3', title: 'Advanced', points: 30, difficulty: 'apply' }
              ],
              nextPhase: 'learning'
            })
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      // Send sequentially to avoid concurrent writes/version conflicts.
      let rateLimitedResponse = null;
      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .post('/v1/assessment')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            sessionId: testSessionId,
            userMessage: `Assessment ${i}`,
            mode: 'studying'
          });

        if (res.status === 429) {
          rateLimitedResponse = res;
          break;
        }
      }

      expect(rateLimitedResponse).toBeTruthy();
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.code).toBe('RATE_LIMITED');
    });
  });

  describe('Quiz Rate Limiting', () => {
    it('should rate limit quiz start requests', async () => {
      // Mock successful quiz generation response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  id: 'q1',
                  text: 'What is a variable?',
                  options: ['A storage location', 'A function', 'A loop', 'A condition'],
                  correctIndex: 0,
                  explanation: 'A variable stores a value that can be referenced later.'
                }
              ]
            })
          }
        }],
        usage: {
          completion_tokens: 30
        }
      });

      let rateLimitedResponse = null;
      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .post('/v1/quiz/start')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            sessionId: testSessionId,
            moduleId: '1'
          });

        if (res.status === 429) {
          rateLimitedResponse = res;
          break;
        }
      }

      expect(rateLimitedResponse).toBeTruthy();
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.code).toBe('RATE_LIMITED');
    });

    it('should rate limit quiz submit requests', async () => {
      // Mock successful quiz generation first
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  id: 'q1',
                  text: 'What is a variable?',
                  options: ['A storage location', 'A function', 'A loop', 'A condition'],
                  correctIndex: 0
                }
              ]
            })
          }
        }],
        usage: {
          completion_tokens: 30
        }
      });

      // Start a quiz first
      await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: '1'
        });

      // Ensure there is a draft attempt to submit repeatedly
      const seeded = await Session.findById(testSessionId);
      if (!seeded.quizAttempts?.length) {
        seeded.quizAttempts = [{
          id: 'draft1',
          moduleId: '1',
          attemptNo: 1,
          status: 'draft',
          items: [{ id: 'q1', text: 'What is a variable?', options: ['A storage location', 'A function', 'A loop', 'A condition'], correctIndex: 0, explanation: 'A variable stores a value.' }],
          answers: [],
          createdAt: new Date()
        }];
        seeded.phase = 'quizzing';
        await seeded.save();
      }

      // Mock quiz submit response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Great job! You got 100% correct.'
          }
        }],
        usage: {
          completion_tokens: 15
        }
      });

      let rateLimitedResponse = null;
      for (let i = 0; i < 40; i++) {
        const res = await request(app)
          .post('/v1/quiz/submit')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            sessionId: testSessionId,
            moduleId: '1',
            answers: [{ id: 'q1', userIndex: 0 }]
          });

        if (res.status === 429) {
          rateLimitedResponse = res;
          break;
        }
      }

      expect(rateLimitedResponse).toBeTruthy();
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.code).toBe('RATE_LIMITED');
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include Retry-After header in rate limit response', async () => {
      // Mock successful chat response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Hello! How can I help you learn?'
          }
        }],
        usage: {
          completion_tokens: 10
        }
      });

      let rateLimitedResponse = null;
      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .post('/v1/chat')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            sessionId: testSessionId,
            userMessage: `Message ${i}`
          });

        if (res.status === 429) {
          rateLimitedResponse = res;
          break;
        }
      }

      expect(rateLimitedResponse).toBeTruthy();
      expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
      expect(parseInt(rateLimitedResponse.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
