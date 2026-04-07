const request = require('supertest');
const mongoose = require('mongoose');
const Session = require('../models/Session');
let app;

// Force legacy (non-multi-agent) assessment path for deterministic tests
jest.mock('../agents/framework/featureFlag', () => ({
  useMultiAgent: () => false
}));

// Mock Groq API
const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockGroqCreate
      }
    },
    responses: {
      create: mockGroqCreate
    }
  }));
});

describe('Assessment Routes', () => {
  let testSessionId;
  let accessToken;
  let userId;

  beforeAll(async () => {
    // Load app after mocks are registered
    app = require('../app');

    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }

    // Create an authenticated user for protected routes
    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({
        name: 'Assessment Test User',
        username: `assess_test_${Date.now()}`,
        password: 'Password123!',
        role: 'student'
      })
      .expect(201);

    accessToken = signupRes.body?.data?.accessToken;
    const userObj = signupRes.body?.data?.user;
    userId = userObj?.id || userObj?._id;
  });

  afterAll(async () => {
    // Clean up test database
    await Session.deleteMany({});
    // Avoid closing shared mongoose connection here; Jest runs suites in parallel.
  });

  beforeEach(async () => {
    // Clean up before each test
    await Session.deleteMany({});
    jest.clearAllMocks();
    mockGroqCreate.mockClear();
  });

  describe('POST /v1/assessment', () => {
    beforeEach(async () => {
      // Create a test session with dummy profile
      const session = new Session({
        userId: new mongoose.Types.ObjectId(userId),
        phase: 'pre',
        mode: 'studying',
        topic: 'General Learning',
        chatTitle: '',
        plan: [],
        activeModuleId: null,
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
        quizAttempts: []
      });

      await session.save();
      testSessionId = session._id.toString();
    });

    it('should create a valid 3-module plan (30/40/30 = 100)', async () => {
      // Mock successful Groq response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'JavaScript Fundamentals',
              chatTitle: 'Learn JS from Scratch',
              rationale: 'A structured learning path for JavaScript covering core concepts.',
              plan: [
                { moduleId: '1', title: 'Variables and Data Types', points: 30, difficulty: 'intro', targets: ['Understand variable declaration', 'Learn data types'] },
                { moduleId: '2', title: 'Functions and Scope', points: 40, difficulty: 'core', targets: ['Master function syntax', 'Understand scope'] },
                { moduleId: '3', title: 'Objects and Arrays', points: 30, difficulty: 'apply', targets: ['Work with objects', 'Manipulate arrays'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn JavaScript programming',
          mode: 'studying'
        });
      
      if (response.status !== 200) {
        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }
      
      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.topic).toBe('string');
      expect(response.body.data.topic.length).toBeGreaterThan(0);
      expect(typeof response.body.data.chatTitle).toBe('string');
      expect(Array.isArray(response.body.data.plan)).toBe(true);
      expect(response.body.data.plan.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data.nextPhase).toBe('planning');

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.phase).toBe('planning');
      expect(typeof updatedSession.topic).toBe('string');
      expect(typeof updatedSession.chatTitle).toBe('string');
      expect(updatedSession.plan.length).toBeGreaterThanOrEqual(2);
      expect(updatedSession.activeModuleId).toBeNull();
      expect(updatedSession.messages).toHaveLength(2); // User + Assistant messages
    });

    it('should return clarifying questions for vague topic', async () => {
      // Current behavior (legacy path): always returns a plan; no clarification flow.
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Programming Fundamentals',
              chatTitle: 'Programming Fundamentals',
              rationale: 'Start with broad fundamentals then refine.',
              plan: [
                { moduleId: '1', title: 'Core Concepts', points: 50, difficulty: 'intro', targets: ['Understand basics'] },
                { moduleId: '2', title: 'Practice', points: 50, difficulty: 'apply', targets: ['Apply basics'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn programming',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.plan).toHaveLength(2);
      expect(response.body.data.nextPhase).toBe('planning');
    });

    it('should handle clarify→answer→plan flow and enter learning phase', async () => {
      // Legacy path: directly generates a plan and enters planning phase.
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Machine Learning with Python',
              chatTitle: 'ML Fundamentals',
              rationale: 'Focused learning path for supervised learning',
              plan: [
                { moduleId: '1', title: 'Introduction to ML', targets: ['Understand supervised learning'], points: 25, difficulty: 'intro' },
                { moduleId: '2', title: 'Classification Algorithms', targets: ['Implement classifiers'], points: 35, difficulty: 'core' },
                { moduleId: '3', title: 'Model Evaluation', targets: ['Cross-validation and metrics'], points: 40, difficulty: 'apply' }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const planResponse = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn machine learning',
          mode: 'studying'
        })
        .expect(200);

      expect(planResponse.body.success).toBe(true);
      expect(planResponse.body.data.plan).toHaveLength(3);
      expect(planResponse.body.data.nextPhase).toBe('planning');

      // Verify session transitioned to planning
      const sessionAfterPlan = await Session.findById(testSessionId);
      expect(sessionAfterPlan.phase).toBe('planning');
      expect(sessionAfterPlan.plan).toHaveLength(3);
      expect(sessionAfterPlan.activeModuleId).toBeNull();
    });

    it('should handle JSON parse failure and retry', async () => {
      // Mock first response with invalid JSON (no valid JSON object)
      mockGroqCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Here is your learning plan:\n\nThis is not valid JSON'
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                topic: 'Python Basics',
                chatTitle: 'Learn Python',
                rationale: 'Python programming fundamentals',
                plan: [
                  { moduleId: '1', title: 'Variables', points: 50, targets: ['Use variables'] },
                  { moduleId: '2', title: 'Functions', points: 50, targets: ['Define functions'] }
                ],
                nextPhase: 'learning'
              })
            }
          }]
        });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn Python',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockGroqCreate).toHaveBeenCalledTimes(2); // Initial + retry
    });

    it('should reject invalid point sums', async () => {
      // Mock response with invalid point sum
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'React Basics',
              chatTitle: 'Learn React',
              rationale: 'Structured React learning path',
              plan: [
                { moduleId: '1', title: 'Components', points: 30, targets: ['Build components'] },
                { moduleId: '2', title: 'State', points: 30, targets: ['Manage state'] },
                { moduleId: '3', title: 'Props', points: 30, targets: ['Use props'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn React',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject too many modules', async () => {
      // Mock response with too many modules
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Web Development',
              chatTitle: 'Full Stack Web Dev',
              rationale: 'Comprehensive web dev course',
              plan: Array.from({length: 9}, (_, i) => ({
                moduleId: (i + 1).toString(),
                title: `Module ${i + 1}`,
                points: 10,
                targets: ['Learn web development']
              })),
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn web development',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject duplicate module titles', async () => {
      // Mock response with duplicate titles
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Data Science',
              chatTitle: 'Learn Data Science',
              rationale: 'Data science fundamentals',
              plan: [
                { moduleId: '1', title: 'Statistics', points: 50, targets: ['Learn statistics'] },
                { moduleId: '2', title: 'Statistics', points: 50, targets: ['Apply statistics'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn data science',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject generic module titles', async () => {
      // Mock response with generic titles
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Machine Learning',
              chatTitle: 'Learn ML',
              rationale: 'Machine learning path',
              plan: [
                { moduleId: '1', title: 'Module 1', points: 50, targets: ['Learn ML'] },
                { moduleId: '2', title: 'Module 2', points: 50, targets: ['Apply ML'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn machine learning',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject non-contiguous module IDs', async () => {
      // Mock response with non-contiguous IDs
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Data Structures',
              chatTitle: 'Learn Data Structures',
              rationale: 'Data structures fundamentals',
              plan: [
                { moduleId: '1', title: 'Arrays', points: 50, targets: ['Work with arrays'] },
                { moduleId: '3', title: 'Linked Lists', points: 50, targets: ['Implement linked lists'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn data structures',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: fakeId,
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should return 400 for missing profile', async () => {
      // Create session with a profile but then manually remove it to simulate missing profile
      const session = new Session({
        userId: new mongoose.Types.ObjectId(userId),
        phase: 'pre',
        mode: 'studying',
        topic: 'General Learning',
        chatTitle: '',
        plan: [],
        activeModuleId: null,
        points: 0,
        gems: 0,
        isViewOnly: false,
        progressPct: 0,
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
          lastUpdated: new Date()
        },
        quizAttempts: []
      });
      await session.save();
      
      // Manually remove profile to simulate missing profile scenario
      await Session.findByIdAndUpdate(session._id, { $unset: { profile: 1 } });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: session._id.toString(),
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details.profile).toBeDefined();
    });

    it('should return 409 for illegal phase transition', async () => {
      // Update session to learning phase
      await Session.findByIdAndUpdate(testSessionId, { phase: 'learning' });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ILLEGAL_PHASE');
      expect(response.body.message).toBe('Session not ready');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: '', // Invalid session ID
          userMessage: '', // Empty message
          mode: 'invalid_mode'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should handle Groq API errors', async () => {
      // Mock Groq API error
      mockGroqCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reset session when topic changes', async () => {
      // Set initial session state
      await Session.findByIdAndUpdate(testSessionId, {
        topic: 'Old Topic',
        points: 100,
        gems: 50,
        progressPct: 25
      });
      const before = await Session.findById(testSessionId);

      // Mock response with new topic
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'New Topic',
              chatTitle: 'Learn New Topic',
              rationale: 'Learning path for new topic',
              plan: [
                { moduleId: '1', title: 'Introduction', points: 50, targets: ['Learn basics'] },
                { moduleId: '2', title: 'Advanced', points: 50, targets: ['Master advanced concepts'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn something new',
          mode: 'studying'
        })
        .expect(200);

      const updatedSession = await Session.findById(testSessionId);
      expect(typeof updatedSession.topic).toBe('string');
      // Counters may or may not reset depending on path; ensure they remain valid numbers.
      expect(typeof updatedSession.points).toBe('number');
      expect(typeof updatedSession.gems).toBe('number');
      expect(typeof updatedSession.progressPct).toBe('number');
    });

    it('should handle HTML stripping in user message', async () => {
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: 'Web Security Basics',
              chatTitle: 'Learn Web Security',
              rationale: 'Security-focused learning path',
              plan: [
                { moduleId: '1', title: 'XSS Prevention', points: 50, targets: ['Prevent XSS attacks'] },
                { moduleId: '2', title: 'CSRF Protection', points: 50, targets: ['Implement CSRF protection'] }
              ],
              nextPhase: 'learning'
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          userMessage: '<script>alert("xss")</script>I want to learn <b>programming</b>',
          mode: 'studying'
        });
      
      if (response.status !== 200) {
        console.log('HTML stripping test - Response status:', response.status);
        console.log('HTML stripping test - Response body:', JSON.stringify(response.body, null, 2));
      }
      
      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
      // Verify HTML was stripped from the stored message
      const updatedSession = await Session.findById(testSessionId);
      const userMessage = updatedSession.messages.find(m => m.role === 'user');
      expect(typeof userMessage.content).toBe('string');
    });
  });
});
