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

describe('Assessment Routes', () => {
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

  describe('POST /v1/assessment', () => {
    beforeEach(async () => {
      // Create a test session with dummy profile
      const session = new Session({
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
      expect(response.body.data.topic).toBe('JavaScript Fundamentals');
      expect(response.body.data.chatTitle).toBe('Learn JS from Scratch');
      expect(response.body.data.plan).toHaveLength(3);
      expect(response.body.data.plan[0].moduleId).toBe('1');
      expect(response.body.data.plan[0].title).toBe('Variables and Data Types');
      expect(response.body.data.plan[0].points).toBe(30);
      expect(response.body.data.nextPhase).toBe('learning');

      // Verify session was updated
      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.phase).toBe('learning');
      expect(updatedSession.topic).toBe('JavaScript Fundamentals');
      expect(updatedSession.chatTitle).toBe('Learn JS from Scratch');
      expect(updatedSession.plan).toHaveLength(3);
      expect(updatedSession.activeModuleId).toBe('1');
      expect(updatedSession.messages).toHaveLength(2); // User + Assistant messages
    });

    it('should return clarifying questions for vague topic', async () => {
      // Mock clarifying response
      mockGroqCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              clarify: true,
              questions: [
                'What specific aspect of programming do you want to focus on?',
                'Are you more interested in web development or data science?'
              ]
            })
          }
        }]
      });

      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn programming',
          mode: 'studying'
        })
        .expect(200);

      expect(response.body.clarify).toBe(true);
      expect(response.body.questions).toHaveLength(2);
    });

    it('should handle clarify→answer→plan flow and enter learning phase', async () => {
      // First, get clarification questions
      mockGroqCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              clarify: true,
              questions: [
                'What specific aspect of machine learning do you want to focus on?',
                'Are you more interested in supervised or unsupervised learning?'
              ]
            })
          }
        }]
      });

      const clarifyResponse = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn machine learning',
          mode: 'studying'
        })
        .expect(200);

      expect(clarifyResponse.body.clarify).toBe(true);
      expect(clarifyResponse.body.questions).toHaveLength(2);

      // Check that session is in assessing phase
      const sessionAfterClarify = await Session.findById(testSessionId);
      expect(sessionAfterClarify.phase).toBe('assessing');
      expect(sessionAfterClarify.meta.assessClarifyCount).toBe(1);

      // Now answer the questions and get a plan
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
        .send({
          sessionId: testSessionId,
          userMessage: 'Supervised learning with classification algorithms',
          mode: 'studying'
        })
        .expect(200);

      expect(planResponse.body.success).toBe(true);
      expect(planResponse.body.data.plan).toHaveLength(3);
      expect(planResponse.body.data.nextPhase).toBe('learning');

      // Verify session transitioned to learning
      const sessionAfterPlan = await Session.findById(testSessionId);
      expect(sessionAfterPlan.phase).toBe('learning');
      expect(sessionAfterPlan.plan).toHaveLength(3);
      expect(sessionAfterPlan.activeModuleId).toBe('1');
      // Cleared on entering learning (may be 0 or undefined)
      expect(sessionAfterPlan.meta.assessClarifyCount === 0 || sessionAfterPlan.meta.assessClarifyCount === undefined).toBe(true);
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
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn React',
          mode: 'studying'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
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
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn web development',
          mode: 'studying'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
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
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn data science',
          mode: 'studying'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
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
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn machine learning',
          mode: 'studying'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
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
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn data structures',
          mode: 'studying'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ASSESSMENT_JSON_INVALID');
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: fakeId,
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });

    it('should return 400 for missing profile', async () => {
      // Create session with a profile but then manually remove it to simulate missing profile
      const session = new Session({
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
        .send({
          sessionId: session._id.toString(),
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Profile is required for assessment');
    });

    it('should return 409 for illegal phase transition', async () => {
      // Update session to learning phase
      await Session.findByIdAndUpdate(testSessionId, { phase: 'learning' });

      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Illegal phase transition');
      expect(response.body.currentPhase).toBe('learning');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: '', // Invalid session ID
          userMessage: '', // Empty message
          mode: 'invalid_mode'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should handle Groq API errors', async () => {
      // Mock Groq API error
      mockGroqCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const response = await request(app)
        .post('/v1/assessment')
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn something',
          mode: 'studying'
        })
        .expect(502);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Assessment service unavailable');
    });

    it('should reset session when topic changes', async () => {
      // Set initial session state
      await Session.findByIdAndUpdate(testSessionId, {
        topic: 'Old Topic',
        points: 100,
        gems: 50,
        progressPct: 25
      });

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
        .send({
          sessionId: testSessionId,
          userMessage: 'I want to learn something new',
          mode: 'studying'
        })
        .expect(200);

      const updatedSession = await Session.findById(testSessionId);
      expect(updatedSession.topic).toBe('New Topic');
      expect(updatedSession.points).toBe(0);
      expect(updatedSession.gems).toBe(0);
      expect(updatedSession.progressPct).toBe(0);
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
      expect(userMessage.content).not.toContain('<script>');
      expect(userMessage.content).not.toContain('<b>');
    });
  });
});
