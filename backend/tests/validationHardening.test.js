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

describe('Validation Hardening', () => {
  let testSessionId;
  let chatRoutes;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learning-w-llms-test');
    chatRoutes = require('../routes/chatRoutes');
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

    // Reset the Groq client cache so new mocks are used
    if (chatRoutes.resetGroqClient) {
      chatRoutes.resetGroqClient();
    }
  });

  afterEach(async () => {
    // Clean up test data
    await Session.deleteMany({});
    jest.clearAllMocks();
    
    // Reset Groq client cache
    if (chatRoutes.resetGroqClient) {
      chatRoutes.resetGroqClient();
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('HTML Sanitization', () => {
    it('should strip HTML tags from user messages', async () => {
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
          userMessage: '<script>alert("xss")</script>Hello <b>world</b>!'
        });

      expect(response.status).toBe(200);
      
      // Verify the message was sanitized in the database
      const updatedSession = await Session.findById(testSessionId);
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 2]; // User message
      // After sanitization: decode entities first, then strip HTML tags
      // <script>alert("xss")</script>Hello <b>world</b>! -> decode -> strip -> "alert("xss")Hello world!"
      expect(lastMessage.content).toBe('alert("xss")Hello world!');
      expect(lastMessage.content).not.toContain('<script>');
      expect(lastMessage.content).not.toContain('<b>');
    });

    it('should decode HTML entities', async () => {
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
          userMessage: 'Hello &lt;world&gt; &amp; &quot;test&quot;'
        });

      expect(response.status).toBe(200);
      
      // Verify HTML entities were decoded: 'Hello &lt;world&gt; &amp; &quot;test&quot;'
      // Step 1: Decode &lt; -> <, &gt; -> >, &quot; -> ", &amp; -> &
      // Step 2: Strip <world> tags -> 'Hello  & "test"'
      // Step 3: Trim and collapse spaces -> 'Hello & "test"'
      const updatedSession = await Session.findById(testSessionId);
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 2];
      expect(lastMessage.content).toBe('Hello & "test"');
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
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details.message).toBeDefined();
      expect(Array.isArray(response.body.details.message)).toBe(true);
      expect(response.body.details.message[0]).toContain('cannot be empty');
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
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details.message).toBeDefined();
      expect(Array.isArray(response.body.details.message)).toBe(true);
      expect(response.body.details.message[0]).toContain('1000 characters or less');
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
      expect(response.body.details.moduleId).toContain('Module not found in session plan');
    });

    it('should validate session exists for quiz routes', async () => {
      const response = await request(app)
        .post('/v1/quiz/start')
        .send({
          sessionId: '507f1f77bcf86cd799439011',
          moduleId: '1'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('Assessment Output Validation', () => {
    it('should validate assessment output schema', async () => {
      // Create a new session with pre phase for assessment
      const assessSession = new Session({
        phase: 'pre',
        mode: 'studying',
        plan: [],
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
      await assessSession.save();
      const assessSessionId = assessSession._id;

      // Mock invalid assessment response (points don't sum to 100)
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              rationale: 'Basic learning plan',
              plan: [
                { moduleId: '1', title: 'Variables in JavaScript', points: 30, difficulty: 'intro', targets: ['Understand variable declaration'] },
                { moduleId: '2', title: 'Functions in JavaScript', points: 40, difficulty: 'core', targets: ['Write functions'] }
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
          sessionId: assessSessionId,
          userMessage: 'I want to learn JavaScript',
          mode: 'studying'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('LLM_PROVIDER_ERROR');
    });

    it('should validate unique module titles', async () => {
      // Create a new session with pre phase for assessment
      const assessSession = new Session({
        phase: 'pre',
        mode: 'studying',
        plan: [],
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
      await assessSession.save();
      const assessSessionId = assessSession._id;

      // Mock invalid assessment response (duplicate titles)
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              rationale: 'Basic plan',
              plan: [
                { moduleId: '1', title: 'Variables', points: 50, difficulty: 'intro', targets: ['Understand variables'] },
                { moduleId: '2', title: 'Variables', points: 50, difficulty: 'core', targets: ['More variables'] }
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
          sessionId: assessSessionId,
          userMessage: 'I want to learn JavaScript',
          mode: 'studying'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('LLM_PROVIDER_ERROR');
    });

    it('should validate sequential module IDs', async () => {
      // Create a new session with pre phase for assessment
      const assessSession = new Session({
        phase: 'pre',
        mode: 'studying',
        plan: [],
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
      await assessSession.save();
      const assessSessionId = assessSession._id;

      // Mock invalid assessment response (non-sequential IDs)
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JavaScript',
              rationale: 'Basic plan',
              plan: [
                { moduleId: '1', title: 'Variables in JavaScript', points: 50, difficulty: 'intro', targets: ['Learn variables'] },
                { moduleId: '3', title: 'Functions in JavaScript', points: 50, difficulty: 'core', targets: ['Write functions'] }
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
          sessionId: assessSessionId,
          userMessage: 'I want to learn JavaScript',
          mode: 'studying'
        });

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('LLM_PROVIDER_ERROR');
    });
  });

  describe('Quiz Generation Validation', () => {
    it('should validate quiz generation schema', async () => {
      // Mock invalid quiz generation response (only 2 questions, need 3-5)
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
      mockGroqCreate.mockResolvedValue({
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
      // Test 404 for non-existent session (use a valid-looking but non-existent ObjectId)
      const response1 = await request(app)
        .post('/v1/chat')
        .send({
          sessionId: '507f1f77bcf86cd799439011',
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
      expect(response2.body.message).toBe('Validation failed');
      expect(response2.body.details).toBeDefined();
    });
  });
});
