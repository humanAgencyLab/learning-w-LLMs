const { contextControl } = require('../middleware/contextControl');
const Session = require('../models/Session');
const mongoose = require('mongoose');

// Mock the Groq client
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

describe('Context Control Middleware - Unit Tests', () => {
  let testSessionId;
  let mockGroqClient;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms-test');
  });

  beforeEach(async () => {
    // Clear database
    await Session.deleteMany({});
    
    // Create test session with 45 messages (should trigger summarization)
    const session = new Session({
      userId: new mongoose.Types.ObjectId(),
      phase: 'learning',
      mode: 'studying',
      topic: 'JavaScript Basics',
      chatTitle: 'Learning JavaScript',
      plan: [
        {
          id: 'm1',
          title: 'Variables',
          description: 'Learn about variables',
          status: 'in_progress',
          milestones: ['Declare variables', 'Use let/const'],
          completedMilestones: [0],
          points: 50,
          difficulty: 'core'
        }
      ],
      activeModuleId: 'm1',
      points: 0,
      gems: 0,
      isViewOnly: false,
      progressPct: 0,
      messages: [],
      profile: {
        source: 'dummy',
        name: 'Test User',
        background: 'Beginner',
        goals: ['Learn JavaScript'],
        strengths: ['Problem solving'],
        gaps: ['Programming concepts'],
        timePerDayMins: 30,
        preferredStyle: 'examples-first',
        lastUpdated: new Date().toISOString()
      },
      meta: {
        countSinceLastCheck: 0,
        outstandingCheck: null,
        summaryVersion: 0,
        summarizedUpToIndex: 0
      }
    });

    // Add 45 messages to trigger summarization
    for (let i = 0; i < 45; i++) {
      session.messages.push({
        id: `msg_${i + 1}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
        timestamp: new Date(),
        metadata: { tokens: 10 }
      });
    }

    await session.save();
    testSessionId = session._id;

    // Setup mock Groq client
    const Groq = require('groq-sdk');
    mockGroqClient = new Groq();
    console.log('Mock Groq client created:', !!mockGroqClient);
  });

  afterEach(async () => {
    // Clean up test data
    await Session.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Summarization Logic', () => {
    it('should trigger summarization at 40+ turns', async () => {
      // Mock successful summarization response
      mockGroqClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '• Concepts mastered: Variables, functions\n• Misconceptions resolved: None\n• Open questions: How to use closures?\n• Next micro-goal: Learn about scope'
          }
        }],
        usage: {
          completion_tokens: 25
        }
      });
      console.log('Mock setup complete, mock calls:', mockGroqClient.chat.completions.create.mock.calls.length);

      const session = await Session.findById(testSessionId);
      const req = {
        body: { sessionId: testSessionId },
        path: '/v1/chat',
        requestId: 'test-request-id'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Call the middleware
      await contextControl(req, res, next);

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      console.log('Messages length:', updatedSession.messages.length);
      console.log('Summary version:', updatedSession.meta.summaryVersion);
      console.log('Summarized up to index:', updatedSession.meta.summarizedUpToIndex);
      // Summary replaces chunks, remaining messages should be <= original (1 summary + remaining messages)
      expect(updatedSession.messages.length).toBeLessThanOrEqual(26); // 1 summary + <=25 remaining
      expect(updatedSession.meta.summaryVersion).toBe(1);
      expect(updatedSession.meta.summarizedUpToIndex).toBeDefined();

      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should not summarize when outstandingCheck exists', async () => {
      // Set outstanding check
      await Session.findByIdAndUpdate(testSessionId, {
        'meta.outstandingCheck': 'What is a variable?'
      });

      const session = await Session.findById(testSessionId);
      const req = {
        body: { sessionId: testSessionId },
        path: '/v1/chat',
        requestId: 'test-request-id'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Call the middleware
      await contextControl(req, res, next);

      // Verify no summarization occurred
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.messages.length).toBe(45); // Should remain unchanged
      // summaryVersion may be 0 (default) or undefined depending on initialization
      expect(updatedSession.meta.summaryVersion === 0 || updatedSession.meta.summaryVersion === undefined || !updatedSession.meta.summaryVersion).toBe(true);

      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should handle summarization failure gracefully', async () => {
      // Mock failed summarization
      mockGroqClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const session = await Session.findById(testSessionId);
      const req = {
        body: { sessionId: testSessionId },
        path: '/v1/chat',
        requestId: 'test-request-id'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Call the middleware
      await contextControl(req, res, next);

      // Verify session was not modified
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.messages.length).toBe(45);

      // Verify next was called
      expect(next).toHaveBeenCalled();
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

      const req = {
        body: { sessionId: testSessionId },
        path: '/v1/chat',
        requestId: 'test-request-id'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Call the middleware
      await contextControl(req, res, next);

      // Verify 507 error was returned
      expect(res.status).toHaveBeenCalledWith(507);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Context limit exceeded',
        code: 'CONTEXT_LIMIT',
        hint: 'Try shorter messages or start a new session',
        retryAfter: 60
      });
    });
  });
});
