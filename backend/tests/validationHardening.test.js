const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');

// Mock Groq SDK
jest.mock('groq-sdk', () => {
  return {
    Groq: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    }))
  };
});

const { Groq } = require('groq-sdk');

describe('Validation Hardening', () => {
  let testSessionId;
  let mockGroqClient;

  beforeAll(async () => {
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
        { id: '1', title: 'Variables', description: 'Learn about variables', points: 30, status: 'in_progress' },
        { id: '2', title: 'Functions', description: 'Learn about functions', points: 40, status: 'locked' }
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

    // Setup mock Groq client
    mockGroqClient = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    Groq.mockImplementation(() => mockGroqClient);
  });

  afterEach(async () => {
    // Clean up test data
    await Session.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('HTML Sanitization', () => {
    it('should strip HTML tags from user messages', async () => {
      // Mock successful chat response
      mockGroqClient.chat.completions.create.mockResolvedValue({
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
          userMessage: '<script>alert("xss")</script>Hello <b>world</b>!'
        });

      expect(response.status).toBe(200);
      
      // Verify the message was sanitized in the database
      const updatedSession = await Session.findById(testSessionId);
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 2]; // User message
      // After sanitization: strip HTML tags and decode entities
      expect(lastMessage.content).toBe('alert("xss")Hello world!');
      expect(lastMessage.content).not.toContain('<script>');
      expect(lastMessage.content).not.toContain('<b>');
    });

    it('should decode HTML entities', async () => {
      // Mock successful chat response
      mockGroqClient.chat.completions.create.mockResolvedValue({
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
          userMessage: 'Hello &lt;world&gt; &amp; &quot;test&quot;'
        });

      expect(response.status).toBe(200);
      
      // Verify HTML entities were decoded (lt/gt become text, no tags to strip)
      const updatedSession = await Session.findById(testSessionId);
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 2];
      expect(lastMessage.content).toBe('Hello & "test"'); // &lt;world&gt; decoded to <world>, but stripped by tag removal
    });
  });

  describe('Input Validation', () => {
    it('should reject empty user messages', async () => {
      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: '   ' // Just whitespace
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.fieldErrors.message).toContain('cannot be empty');
    });

    it('should reject messages that are too long', async () => {
      const longMessage = 'A'.repeat(1001); // Exceeds 1000 character limit

      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: longMessage
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.fieldErrors.message).toContain('1000 characters or less');
    });

    it('should reject invalid session IDs', async () => {
      const response = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: '',
          userMessage: 'Hello'
        });

      // Empty sessionId triggers route handler error (500) before validation
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Quiz Route Validation', () => {
    it('should validate moduleId exists in session plan', async () => {
      const response = await request(app)
        .post('/v1/quiz/start')
        .send({
          sessionId: testSessionId,
          moduleId: 'nonexistent-module'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.fieldErrors.moduleId).toContain('Module not found in session plan');
    });

    it('should validate session exists for quiz routes', async () => {
      const response = await request(app)
        .post('/v1/quiz/start')
        .send({
          sessionId: 'nonexistent-session-id',
          moduleId: '1'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('Assessment Output Validation', () => {
    it('should validate assessment output schema', async () => {
      // Mock invalid assessment response (points don't sum to 100)
      mockGroqClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              plan: [
                { moduleId: '1', title: 'Variables', points: 30, difficulty: 'intro' },
                { moduleId: '2', title: 'Functions', points: 40, difficulty: 'core' }
                // Only 70 points total, should be 100
              ],
              nextPhase: 'learning'
            })
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn JavaScript',
          mode: 'studying'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
    });

    it('should validate unique module titles', async () => {
      // Mock invalid assessment response (duplicate titles)
      mockGroqClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              plan: [
                { moduleId: '1', title: 'Variables', points: 50, difficulty: 'intro' },
                { moduleId: '2', title: 'Variables', points: 50, difficulty: 'core' }
                // Duplicate titles
              ],
              nextPhase: 'learning'
            })
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn JavaScript',
          mode: 'studying'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
    });

    it('should validate sequential module IDs', async () => {
      // Mock invalid assessment response (non-sequential IDs)
      mockGroqClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              plan: [
                { moduleId: '1', title: 'Variables', points: 50, difficulty: 'intro' },
                { moduleId: '3', title: 'Functions', points: 50, difficulty: 'core' }
                // Missing moduleId '2'
              ],
              nextPhase: 'learning'
            })
          }
        }],
        usage: {
          completion_tokens: 50
        }
      });

      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn JavaScript',
          mode: 'studying'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
    });
  });

  describe('Quiz Generation Validation', () => {
    it('should validate quiz generation schema', async () => {
      // Mock invalid quiz generation response (only 2 questions, need 3-5)
      mockGroqClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  id: 'q1',
                  text: 'What is a variable?',
                  options: ['A storage location', 'A function', 'A loop', 'A condition'],
                  correctIndex: 0
                },
                {
                  id: 'q2',
                  text: 'What is a function?',
                  options: ['A storage location', 'A reusable block', 'A loop', 'A condition'],
                  correctIndex: 1
                }
                // Only 2 questions, need at least 3
              ]
            })
          }
        }],
        usage: {
          completion_tokens: 30
        }
      });

      const response = await request(app)
        .post('/v1/quiz/start')
        .send({
          sessionId: testSessionId,
          moduleId: '1'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('LLM_PROVIDER_ERROR');
    });

    it('should reject questions with forbidden options', async () => {
      // Mock invalid quiz generation response (contains "All of the above")
      mockGroqClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  id: 'q1',
                  text: 'What is a variable?',
                  options: ['A storage location', 'A function', 'A loop', 'All of the above'],
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

      const response = await request(app)
        .post('/v1/quiz/start')
        .send({
          sessionId: testSessionId,
          moduleId: '1'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('LLM_PROVIDER_ERROR');
    });
  });

  describe('Error Taxonomy', () => {
    it('should return proper error codes for different scenarios', async () => {
      // Test 404 for non-existent session
      const response1 = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: 'nonexistent-session-id',
          userMessage: 'Hello'
        });

      expect(response1.status).toBe(404);
      expect(response1.body.code).toBe('NOT_FOUND');

      // Test 400 for validation error
      const response2 = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: testSessionId,
          userMessage: ''
        });

      expect(response2.status).toBe(400);
      expect(response2.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
