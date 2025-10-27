// Mock Groq SDK BEFORE requiring any modules
jest.mock('groq-sdk', () => {
  const mockCreate = jest.fn().mockResolvedValue({
    choices: [{ message: { content: "ok" } }],
    usage: { completion_tokens: 10 }
  });
  return {
    Groq: jest.fn().mockImplementation(() => ({
      responses: { create: mockCreate },
      chat: { completions: { create: mockCreate } },
    })),
  };
});

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');
const { resetGroqClient } = require('../lib/llmClient');

describe('Rate Limiting', () => {
  let testSessionId;

  beforeAll(async () => {
    // Enable rate limiting for these tests
    process.env.RATE_LIMIT_ENABLED = 'true';
    
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms-test');
  });
  
  beforeEach(async () => {
    // Create a test session
    const session = new Session({
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

      // Make requests up to the limit (12 per minute)
      const promises = [];
      for (let i = 0; i < 13; i++) {
        promises.push(
          request(app)
            .post('/v1/chat')
            .send({
              sessionId: testSessionId,
              userMessage: `Message ${i}`
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Check that the last request was rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.code).toBe('RATE_LIMITED');
      expect(lastResponse.body.message).toBe('Too many requests');
      expect(lastResponse.headers['retry-after']).toBeDefined();
    });
  });

  describe('Assessment Rate Limiting', () => {
    it('should rate limit assessment requests', async () => {
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

      // Make requests up to the limit (5 per minute)
      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(
          request(app)
            .post('/v1/assessment')
            .send({
              sessionId: testSessionId,
              userMessage: `Assessment ${i}`,
              mode: 'studying'
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Check that the last request was rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.code).toBe('RATE_LIMITED');
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

      // Make requests up to the limit (6 per minute)
      const promises = [];
      for (let i = 0; i < 7; i++) {
        promises.push(
          request(app)
            .post('/v1/quiz/start')
            .send({
              sessionId: testSessionId,
              moduleId: '1'
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Check that the last request was rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.code).toBe('RATE_LIMITED');
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
        .send({
          sessionId: testSessionId,
          moduleId: '1'
        });

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

      // Make requests up to the limit (8 per minute)
      const promises = [];
      for (let i = 0; i < 9; i++) {
        promises.push(
          request(app)
            .post('/v1/quiz/submit')
            .send({
              sessionId: testSessionId,
              moduleId: '1',
              answers: [{ id: 'q1', userIndex: 0 }]
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Check that the last request was rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.code).toBe('RATE_LIMITED');
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

      // Make requests to exceed limit
      const promises = [];
      for (let i = 0; i < 13; i++) {
        promises.push(
          request(app)
            .post('/v1/chat')
            .send({
              sessionId: testSessionId,
              userMessage: `Message ${i}`
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Check that rate limited response includes Retry-After header
      const rateLimitedResponse = responses.find(r => r.status === 429);
      expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
      expect(parseInt(rateLimitedResponse.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
