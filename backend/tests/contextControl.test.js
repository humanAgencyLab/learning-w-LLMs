// Mock Groq SDK BEFORE requiring any modules
const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => {
  return {
    Groq: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockGroqCreate
        }
      }
    }))
  };
});

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');
const { resetGroqClient } = require('../lib/llmClient');

describe.skip('Context Control Middleware', () => {
  let testSessionId;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms-test');
  });

  beforeEach(async () => {
    // Create a test session with many messages
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

    // Add many messages to trigger summarization (all learning intent)
    for (let i = 0; i < 45; i++) {
      session.messages.push({
        id: `msg_${i + 1}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
        timestamp: new Date(),
        metadata: { tokens: 10, intent: 'learning' }
      });
    }

    await session.save();
    testSessionId = session._id;

    // Reset groq client and clear mocks
    resetGroqClient();
    mockGroqCreate.mockClear();
  });

  afterEach(async () => {
    // Clean up test data
    await Session.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Summarization Trigger', () => {
    it('should trigger summarization at 40+ turns', async () => {
      // Mock successful summarization response
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '• Concepts mastered: Variables, functions\n• Misconceptions resolved: None\n• Open questions: How to use closures?\n• Next micro-goal: Learn about scope'
          }
        }],
        usage: {
          completion_tokens: 25
        }
      });

      // Mock chat response
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Great question about closures! Let me explain...'
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about closures'
        });

      // The test should pass now with proper mocking
      expect(response.status).toBe(200);
      expect(response.body.data.summarized).toBe(true);
      expect(response.body.data.summaryNote).toBe('Context compressed for continuity');

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      // Summary replaces chunks, remaining messages should be <= original
      expect(updatedSession.messages.length).toBeLessThanOrEqual(26); // 1 summary + <=25 remaining
      expect(updatedSession.meta.summaryVersion).toBe(1);
      expect(updatedSession.meta.summarizedUpToIndex).toBeDefined();
    });

    it('should not summarize if outstandingCheck exists', async () => {
      // Set outstanding check
      await Session.findByIdAndUpdate(testSessionId, {
        'meta.outstandingCheck': 'What is a variable?'
      });

      // Mock chat response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Great question about closures! Let me explain...'
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about closures'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.summarized).toBeUndefined();

      // Verify no summarization occurred
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.messages.length).toBe(45); // Should remain unchanged
      expect(updatedSession.meta.summaryVersion).toBeUndefined();
    });

    it('should handle summarization failure gracefully', async () => {
      // Mock failed summarization
      mockGroqCreate.mockRejectedValueOnce(new Error('API Error'));

      // Mock chat response
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Great question about closures! Let me explain...'
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about closures'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.summarized).toBeUndefined();

      // Verify session was not modified
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.messages.length).toBe(45);
    });
  });

  describe('Context Limits', () => {
    it('should handle context limit exceeded', async () => {
      // Create a session with extremely long messages to exceed context limit
      const session = await Session.findById(testSessionId);
      session.messages = [];
      
      // Add very long messages
      for (let i = 0; i < 100; i++) {
        session.messages.push({
          id: `msg_${i}`,
          role: 'user',
          content: 'A'.repeat(1000), // Very long message
          timestamp: new Date(),
          metadata: { tokens: 1000 }
        });
        session.messages.push({
          id: `msg_${i}_assistant`,
          role: 'assistant',
          content: 'B'.repeat(1000), // Very long message
          timestamp: new Date(),
          metadata: { tokens: 1000 }
        });
      }
      
      await session.save();

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about closures'
        });

      expect(response.status).toBe(507);
      expect(response.body.code).toBe('CONTEXT_LIMIT');
      expect(response.body.message).toBe('Context window exceeded');
      expect(response.body.hint).toContain('Try starting a new session');
    });
  });

  describe('Idempotency', () => {
    it('should not create multiple summaries for same conversation', async () => {
      // Mock successful summarization response
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '• Concepts mastered: Variables\n• Misconceptions resolved: None\n• Open questions: None\n• Next micro-goal: Learn functions'
          }
        }],
        usage: {
          completion_tokens: 20
        }
      });

      // Mock chat response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Great question about closures! Let me explain...'
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      // First request should trigger summarization
      const response1 = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about closures'
        });

      expect(response1.status).toBe(200);
      expect(response1.body.data.summarized).toBe(true);

      // Second request should not trigger summarization again
      const response2 = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about scope'
        });

      expect(response2.status).toBe(200);
      expect(response2.body.data.summarized).toBeUndefined();

      // Verify only one summary was created
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.meta.summaryVersion).toBe(1);
    });
  });

  describe('Summary Content', () => {
    it('should create proper summary format', async () => {
      // Mock summarization response
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '• Concepts mastered: Variables, functions, scope\n• Misconceptions resolved: Variable hoisting\n• Open questions: How to use closures effectively?\n• Next micro-goal: Learn about closures'
          }
        }],
        usage: {
          completion_tokens: 30
        }
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about closures'
        });

      expect(response.status).toBe(200);

      // Verify summary message was created with proper schema
      const updatedSession = await Session.findById(testSessionId);
      const summaryMessage = updatedSession.messages.find(msg => msg.role === 'system');
      expect(summaryMessage).toBeDefined();
      expect(summaryMessage.role).toBe('system');
      expect(summaryMessage.id).toBeDefined();
      expect(summaryMessage.timestamp).toBeDefined();
      expect(summaryMessage.metadata).toBeDefined();
      expect(summaryMessage.metadata.tokens).toBeDefined();
      expect(summaryMessage.content).toContain('Concepts mastered:');
      expect(summaryMessage.content).toContain('Misconceptions resolved:');
      expect(summaryMessage.content).toContain('Open questions:');
      expect(summaryMessage.content).toContain('Next micro-goal:');
    });
  });
});
