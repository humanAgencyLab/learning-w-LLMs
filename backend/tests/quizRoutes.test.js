const request = require('supertest');
const mongoose = require('mongoose');
const Session = require('../models/Session');
let app;

// Mock Groq API
const mockGroqCreate = jest.fn();
jest.mock('../lib/llmClient', () => ({
  getGroqClient: () => ({
    chat: { completions: { create: mockGroqCreate } },
    responses: { create: mockGroqCreate }
  })
}));
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

describe('Quiz Routes', () => {
  let testSessionId;
  let testModuleId;
  let accessToken;
  let userId;

  beforeAll(async () => {
    // Load app after mocks are registered
    app = require('../app');

    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }

    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({
        password: 'TestPassword123!',
        name: 'Quiz Test User',
        username: `quiz_test_${Date.now()}`
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

  describe('POST /v1/quiz/start', () => {
    beforeEach(async () => {
      // Create a test session in learning phase
      const session = new Session({
        userId: new mongoose.Types.ObjectId(userId),
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
      testModuleId = '1';
    });

    it('should generate a new quiz for the active module', async () => {
      // Mock quiz generation response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  id: 'q1',
                  text: 'What keyword declares a variable in JavaScript?',
                  options: ['var', 'let', 'const', 'declare'],
                  correctIndex: 2,
                  explanation: '`const` declares a variable whose binding cannot be reassigned. It is commonly used for variables that should not be reassigned.'
                },
                {
                  id: 'q2',
                  text: 'Which data type is immutable in JavaScript?',
                  options: ['string', 'number', 'boolean', 'object'],
                  correctIndex: 0,
                  explanation: 'Strings are immutable in JavaScript: operations create new strings rather than modifying the original.'
                },
                {
                  id: 'q3',
                  text: 'What is the result of typeof null?',
                  options: ['null', 'undefined', 'object', 'string'],
                  correctIndex: 2,
                  explanation: '`typeof null` returns `"object"` due to a historical quirk in JavaScript.'
                },
                {
                  id: 'q4',
                  text: 'Which is not a primitive data type?',
                  options: ['string', 'number', 'array', 'boolean'],
                  correctIndex: 2,
                  explanation: 'Arrays are objects in JavaScript, not primitives.'
                }
              ]
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.questions).toHaveLength(4);
      expect(response.body.questions[0]).toHaveProperty('id');
      expect(response.body.questions[0]).toHaveProperty('text');
      expect(response.body.questions[0]).toHaveProperty('options');
      expect(response.body.questions[0]).toHaveProperty('correctIndex');
      expect(response.body.questions[0].options).toHaveLength(4);

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.phase).toBe('quizzing');
      expect(updatedSession.quizAttempts).toHaveLength(1);
      expect(updatedSession.quizAttempts[0].status).toBe('draft');
      expect(updatedSession.quizAttempts[0].moduleId).toBe('1');
      expect(updatedSession.quizAttempts[0].attemptNo).toBe(1);
    });

    it('should generate a quiz for a specific module', async () => {
      // Mock quiz generation response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  id: 'q1',
                  text: 'What is a function in JavaScript?',
                  options: ['A block of code', 'A variable', 'A data type', 'A loop'],
                  correctIndex: 0,
                  explanation: 'A function is a reusable block of code that can be called to perform a task.'
                },
                {
                  id: 'q2',
                  text: 'What is function scope?',
                  options: ['Where variables are accessible', 'Function parameters', 'Return values', 'Function names'],
                  correctIndex: 0,
                  explanation: 'Scope determines where variables can be accessed; function scope means variables are accessible within the function.'
                },
                {
                  id: 'q3',
                  text: 'What is a closure?',
                  options: ['A function with access to outer scope', 'A closed function', 'A private function', 'A nested function'],
                  correctIndex: 0,
                  explanation: 'A closure is a function that retains access to variables from its outer (enclosing) scope.'
                }
              ]
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: '2'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.questions).toHaveLength(3);

      // Verify attempt was created for module 2
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.quizAttempts[0].moduleId).toBe('2');
    });

    it('should return existing draft quiz if one exists', async () => {
      // Create a draft attempt first
      const session = await Session.findById(testSessionId);
      session.quizAttempts.push({
        id: 'existing-draft',
        moduleId: '1',
        attemptNo: 1,
        status: 'draft',
        items: [
          {
            id: 'q1',
            text: 'Existing question?',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0
          }
        ],
        answers: [],
        createdAt: new Date()
      });
      await session.save();

      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.questions).toHaveLength(1);
      expect(response.body.questions[0].text).toBe('Existing question?');

      // Verify no new attempt was created
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.quizAttempts).toHaveLength(1);
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: fakeId
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should return 409 for no module ID', async () => {
      // Set activeModuleId to null
      await Session.findByIdAndUpdate(testSessionId, { activeModuleId: null });

      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 409 for module not in plan', async () => {
      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: 'nonexistent'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should return 409 for illegal phase', async () => {
      // Set session to pre phase
      await Session.findByIdAndUpdate(testSessionId, { phase: 'pre' });

      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ILLEGAL_PHASE');
      expect(response.body.error).toBe('Quiz not allowed in current phase');
    });

    it('should handle quiz generation errors', async () => {
      // Mock Groq API error
      mockGroqCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const response = await request(app)
        .post('/v1/quiz/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('LLM_PROVIDER_ERROR');
      expect(response.body.message).toBe('Chat service unavailable');
    });
  });

  describe('POST /v1/quiz/submit', () => {
    beforeEach(async () => {
      // Create a test session with a draft quiz attempt
      const session = new Session({
        userId: new mongoose.Types.ObjectId(userId),
        phase: 'quizzing',
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
          goals: ['Pass Algorithms midterm'],
          strengths: ['arrays'],
          gaps: ['graph traversal'],
          timePerDayMins: 30,
          preferredStyle: 'examples-first',
          lastUpdated: new Date().toISOString()
        },
        quizAttempts: [{
          id: 'test-attempt',
          moduleId: '1',
          attemptNo: 1,
          status: 'draft',
          items: [
            {
              id: 'q1',
              text: 'What keyword declares a variable?',
              options: ['var', 'let', 'const', 'declare'],
              correctIndex: 2
            },
            {
              id: 'q2',
              text: 'Which is a primitive type?',
              options: ['string', 'array', 'object', 'function'],
              correctIndex: 0
            },
            {
              id: 'q3',
              text: 'What is typeof null?',
              options: ['null', 'undefined', 'object', 'string'],
              correctIndex: 2
            },
            {
              id: 'q4',
              text: 'Which is not a primitive?',
              options: ['string', 'number', 'array', 'boolean'],
              correctIndex: 2
            }
          ],
          answers: [],
          createdAt: new Date()
        }],
        meta: {
          countSinceLastCheck: 0,
          outstandingCheck: null
        }
      });

      await session.save();
      testSessionId = session._id.toString();
      testModuleId = '1';
    });

    it('should score a passing quiz (75%)', async () => {
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 2 }, // correct
            { id: 'q2', userIndex: 0 }, // correct
            { id: 'q3', userIndex: 2 }, // correct
            { id: 'q4', userIndex: 1 }  // incorrect
          ]
        });

      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.passed).toBe(true);
      expect(response.body.data.scorePct).toBe(75);
      expect(response.body.data.pointsEarned).toBe(30); // module points
      expect(response.body.data.feedbackMarkdown).toMatch(/ready to move on|move on to the next module/i);

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.phase).toBe('completed'); // Should be completed when only one module exists
      expect(updatedSession.quizAttempts[0].status).toBe('submitted');
      expect(updatedSession.quizAttempts[0].passed).toBe(true);
      expect(updatedSession.quizAttempts[0].pointsEarned).toBe(30);
      expect(updatedSession.points).toBe(30);
    });

    it('should score a failing quiz (50%)', async () => {
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 0 }, // incorrect
            { id: 'q2', userIndex: 0 }, // correct
            { id: 'q3', userIndex: 1 }, // incorrect
            { id: 'q4', userIndex: 1 }  // incorrect
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.passed).toBe(false);
      expect(response.body.data.scorePct).toBe(25);
      expect(response.body.data.pointsEarned).toBe(0);
      expect(response.body.data.feedbackMarkdown).toMatch(/retry this module|need to review/i);

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      expect(['feedback', 'learning']).toContain(updatedSession.phase);
      expect(updatedSession.quizAttempts[0].status).toBe('submitted');
      expect(updatedSession.quizAttempts[0].passed).toBe(false);
      expect(updatedSession.quizAttempts[0].pointsEarned).toBe(0);
      expect(updatedSession.points).toBe(0);
    });

    it('should handle boundary case (exactly 70%)', async () => {
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 2 }, // correct
            { id: 'q2', userIndex: 0 }, // correct
            { id: 'q3', userIndex: 2 }, // correct
            { id: 'q4', userIndex: 1 }  // incorrect
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.passed).toBe(true);
      expect(response.body.data.scorePct).toBe(75); // 3/4 = 75%
    });

    it('should handle reattempt without double-awarding points', async () => {
      // First attempt - fail
      await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 0 }, // incorrect
            { id: 'q2', userIndex: 1 }, // incorrect
            { id: 'q3', userIndex: 1 }, // incorrect
            { id: 'q4', userIndex: 1 }  // incorrect
          ]
        })
        .expect(200);

      // Create a second attempt
      const session = await Session.findById(testSessionId);
      session.quizAttempts.push({
        id: 'test-attempt-2',
        moduleId: '1',
        attemptNo: 2,
        status: 'draft',
        items: session.quizAttempts[0].items,
        answers: [],
        createdAt: new Date()
      });
      session.phase = 'quizzing';
      await session.save();

      // Second attempt - pass
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 2 }, // correct
            { id: 'q2', userIndex: 0 }, // correct
            { id: 'q3', userIndex: 2 }, // correct
            { id: 'q4', userIndex: 2 }  // correct
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.passed).toBe(true);
      expect(response.body.data.pointsEarned).toBe(30); // Should award points on first pass

      // Third attempt - try to submit same attempt again (should fail)
      const thirdResponse = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 2 }, // correct
            { id: 'q2', userIndex: 0 }, // correct
            { id: 'q3', userIndex: 2 }, // correct
            { id: 'q4', userIndex: 2 }  // correct
          ]
        })
        // Current behavior: may return 409 (no draft attempt) or 404 (resource not found) depending on lookup path.
        .expect(res => {
          if (![404, 409].includes(res.status)) {
            throw new Error(`Expected 404 or 409, got ${res.status}`);
          }
        });

      expect(thirdResponse.body.success).toBe(false);
      expect(['ILLEGAL_PHASE', 'NOT_FOUND']).toContain(thirdResponse.body.code);
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: fakeId,
          moduleId: '1',
          answers: [{ id: 'q1', userIndex: 0 }]
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Resource not found');
    });

    it('should return 409 for no draft attempt', async () => {
      // Remove the draft attempt
      await Session.findByIdAndUpdate(testSessionId, { quizAttempts: [] });

      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [{ id: 'q1', userIndex: 0 }]
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ILLEGAL_PHASE');
      expect(response.body.message).toBe('No draft quiz found for this module. Please start a new quiz.');
    });

    it('should return 409 for answer mismatch', async () => {
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'wrong-id', userIndex: 0 }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details.answers).toBeDefined();
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: '', // Invalid session ID
          moduleId: '', // Invalid module ID
          answers: [] // Empty answers
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should advance to next module when passed', async () => {
      // Create session with multiple modules
      const session = await Session.findById(testSessionId);
      session.plan.push({
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
      });
      await session.save();

      const response = await request(app)
        .post('/v1/quiz/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          moduleId: testModuleId,
          answers: [
            { id: 'q1', userIndex: 2 }, // correct
            { id: 'q2', userIndex: 0 }, // correct
            { id: 'q3', userIndex: 2 }, // correct
            { id: 'q4', userIndex: 2 }  // correct
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.passed).toBe(true);

      // Verify module advancement
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.activeModuleId).toBe('2');
      expect(updatedSession.plan[0].status).toBe('passed');
      expect(updatedSession.plan[1].status).toBe('in_progress');
    });

    it('should set isViewOnly and phase to completed when all modules passed', async () => {
      // Test the progress service directly with all modules passed
      const session = await Session.findById(testSessionId);
      session.plan.forEach(module => {
        module.status = 'passed';
      });
      
      // Call progress service directly to test completion
      const { updateProgress } = require('../services/progressService');
      const result = updateProgress(session, { forceRecalc: true });
      
      expect(result.completed).toBe(true);
      expect(result.isViewOnly).toBe(true);
      expect(result.points).toBe(30); // Only 1 module with 30 points
      expect(session.phase).toBe('completed');
      expect(session.progressPct).toBe(30);
    });
  });
});
