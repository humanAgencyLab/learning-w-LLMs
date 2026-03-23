const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');

// Mock Groq API
const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockGroqCreate
      }
    }
  }));
});

describe('Chat Routes', () => {
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
    jest.clearAllMocks();
    mockGroqCreate.mockClear();
  });

  describe('POST /v1/chat', () => {
    beforeEach(async () => {
      // Create a test session in learning phase
      const session = new Session({
        phase: 'learning',
        mode: 'studying',
        topic: 'JavaScript Fundamentals',
        chatTitle: 'Learn JavaScript',
        plan: [
          {
            id: '1',
            title: 'Variables and Data Types',
            description: 'Learn about variables and data types',
            status: 'in_progress',
            milestones: [
              { text: 'Understand variables', completed: false },
              { text: 'Practice data types', completed: false }
            ],
            completedMilestones: [],
            points: 30,
            difficulty: 'intro'
          },
          {
            id: '2',
            title: 'Functions and Scope',
            description: 'Learn about functions and scope',
            status: 'locked',
            milestones: [
              { text: 'Understand functions', completed: false },
              { text: 'Practice scope', completed: false }
            ],
            completedMilestones: [],
            points: 40,
            difficulty: 'core'
          }
        ],
        activeModuleId: '1',
        points: 0,
        gems: 0,
        isViewOnly: false,
        progressPct: 0,
        messages: [],
        profile: {
          source: 'dummy',
          name: 'Alex',
          background: '2nd-year CS undergrad',
          goals: ['Pass Algorithms midterm', 'Understand graph traversal'],
          strengths: ['arrays', 'big-O basics'],
          gaps: ['graph traversal', 'BFS vs DFS tradeoffs'],
          timePerDayMins: 30,
          preferredStyle: 'examples-first',
          lastUpdated: new Date().toISOString()
        },
        quizAttempts: [],
        meta: {
          countSinceLastCheck: 0,
          outstandingCheck: null
        }
      });

      await session.save();
      testSessionId = session._id.toString();
    });

    it('should provide teaching content with a question every 2nd reply', async () => {
      // Mock teacher response with question
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Variables in JavaScript are containers for storing data. You can declare them with `let`, `const`, or `var`. For example: `let name = "Alice";` Which keyword creates a variable that cannot be reassigned?'
          }
        }]
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn about variables'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('Variables in JavaScript');
      expect(response.body.data.hadCheckInReply).toBe(true);
      expect(response.body.data.followedUpOutstanding).toBe(false);

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.meta.outstandingCheck).toContain('Which keyword');
      expect(updatedSession.meta.countSinceLastCheck).toBe(0);
      expect(updatedSession.messages).toHaveLength(2); // User + Assistant
    });

    it('should follow up on outstanding question before introducing new material', async () => {
      // Set up session with outstanding question
      await Session.findByIdAndUpdate(testSessionId, {
        'meta.outstandingCheck': 'Which keyword creates a variable that cannot be reassigned?',
        'meta.countSinceLastCheck': 0
      });

      // Mock follow-up response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'That\'s right! `const` creates a variable that cannot be reassigned. Now let\'s talk about data types. What are the primitive data types in JavaScript?'
          }
        }]
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'const'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.followedUpOutstanding).toBe(true);
      expect(response.body.data.hadCheckInReply).toBe(true);

      // Verify outstanding question was cleared and new one set
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.meta.outstandingCheck).toContain('What are the primitive data types');
      expect(updatedSession.meta.countSinceLastCheck).toBe(0);
    });

    it('should detect quiz intent and return START_QUIZ action', async () => {
      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'quiz me on this topic'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.nextAction).toBe('START_QUIZ');
      expect(response.body.data.moduleId).toBe('1');
      expect(response.body.data.hadCheckInReply).toBe(false);

      // Verify session phase didn't change
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.phase).toBe('learning');
    });

    it('should handle feedback phase continue intent', async () => {
      // Set session to feedback phase
      await Session.findByIdAndUpdate(testSessionId, { phase: 'feedback' });

      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Great! Let\'s continue with the next concept. What is the difference between let and var?'
          }
        }]
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'continue'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify phase changed back to learning
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.phase).toBe('learning');
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: fakeId,
          userMessage: 'Hello'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Session not found');
    });

    it('should return 409 for illegal phase (pre)', async () => {
      // Set session to pre phase
      await Session.findByIdAndUpdate(testSessionId, { phase: 'pre' });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ILLEGAL_PHASE');
      expect(response.body.error).toContain('not ready for chat');
      expect(response.body.currentPhase).toBe('pre');
    });

    it('should return 409 for assessing phase', async () => {
      // Set session to assessing phase
      await Session.findByIdAndUpdate(testSessionId, { phase: 'assessing' });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ILLEGAL_PHASE');
      expect(response.body.error).toContain('not ready for chat');
      expect(response.body.currentPhase).toBe('assessing');
    });

    it('should return 409 when plan is empty', async () => {
      // Clear the plan while keeping phase as learning
      await Session.findByIdAndUpdate(testSessionId, { 
        phase: 'pre',
        plan: []
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ILLEGAL_PHASE');
      expect(response.body.hint).toContain('assessment first');
    });

    it('should return 409 for view-only session', async () => {
      // Set session to view-only
      await Session.findByIdAndUpdate(testSessionId, { isViewOnly: true });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Chat not allowed for view-only sessions');
    });

    it('should return 409 for null activeModuleId', async () => {
      // Set activeModuleId to null
      await Session.findByIdAndUpdate(testSessionId, { activeModuleId: null });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No active module. Please re-run assessment to set up learning plan.');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: '', // Invalid session ID
          userMessage: '' // Empty message
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should handle HTML stripping in user message', async () => {
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Let\'s learn about variables. What is a variable?'
          }
        }]
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: '<script>alert("xss")</script>I want to learn <b>variables</b>'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify HTML was stripped from the stored message
      const updatedSession = await Session.findById(testSessionId);
      const userMessage = updatedSession.messages.find(m => m.role === 'user');
      expect(userMessage.content).not.toContain('<script>');
      expect(userMessage.content).not.toContain('<b>');
    });

    it('should increment countSinceLastCheck when no question is asked', async () => {
      // Mock response without question
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'That\'s a great question! Let me explain variables in more detail. Variables are fundamental to programming.'
          }
        }]
      });

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'What are variables?'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hadCheckInReply).toBe(false);

      // Verify count was incremented
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.meta.countSinceLastCheck).toBe(1);
      expect(updatedSession.meta.outstandingCheck).toBeNull();
    });

    it('should handle Groq API errors', async () => {
      // Mock Groq API error
      mockGroqCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Hello'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Chat service unavailable');
    });

    it('should detect various quiz intents', async () => {
      const quizIntents = [
        'quiz me',
        'start test',
        'short check',
        'test me',
        'quiz',
        'assessment',
        'check my knowledge',
        'test my understanding',
        'give me a quiz'
      ];

      for (const intent of quizIntents) {
        const response = await request(app)
          .post('/v1/chat')
          .send({
            sessionId: testSessionId,
            userMessage: intent
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.nextAction).toBe('START_QUIZ');
        expect(response.body.data.moduleId).toBe('1');
      }
    });

    it('should detect various continue intents in feedback phase', async () => {
      await Session.findByIdAndUpdate(testSessionId, { phase: 'feedback' });

      const continueIntents = [
        'continue',
        'keep going',
        'next',
        'proceed',
        'let\'s continue',
        'move on',
        'go ahead',
        'yes',
        'sure'
      ];

      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Let\'s continue learning! What is a variable?'
          }
        }]
      });

      for (const intent of continueIntents) {
        const response = await request(app)
          .post('/v1/chat')
          .send({
            sessionId: testSessionId,
            userMessage: intent
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        
        // Verify phase changed back to learning
        const updatedSession = await Session.findById(testSessionId);
        expect(updatedSession.phase).toBe('learning');
      }
    });

    it('should maintain cadence across multiple interactions', async () => {
      // First interaction - should ask a question
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Variables store data. What keyword declares a variable?'
          }
        }]
      });

      await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'Tell me about variables'
        })
        .expect(200);

      let session = await Session.findById(testSessionId);
      expect(session.meta.outstandingCheck).toContain('What keyword');
      expect(session.meta.countSinceLastCheck).toBe(0);

      // Second interaction - should follow up on outstanding question
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Correct! `let` declares a variable. Now, what are the primitive data types?'
          }
        }]
      });

      await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: 'let'
        })
        .expect(200);

      session = await Session.findById(testSessionId);
      expect(session.meta.outstandingCheck).toContain('primitive data types');
      expect(session.meta.countSinceLastCheck).toBe(0);
    });
  });
});
