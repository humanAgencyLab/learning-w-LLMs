import { renderHook, act } from '@testing-library/react';
import useSessionStore from './sessionStore';

// Mock the API modules
jest.mock('../lib/sessionApi', () => ({
  createSession: jest.fn(),
  resumeSession: jest.fn(),
}));

jest.mock('../lib/assessmentApi', () => ({
  assess: jest.fn(),
}));

jest.mock('../lib/chatApi', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../lib/quizApi', () => ({
  startQuiz: jest.fn(),
  submitQuiz: jest.fn(),
}));

describe('SessionStore', () => {
  beforeEach(() => {
    const sessionApi = require('../lib/sessionApi');
    sessionApi.createSession.mockResolvedValue({
      success: true,
      data: {
        id: 'default-session',
        profile: {
          source: 'dummy',
          name: 'Default User'
        }
      }
    });
    sessionApi.resumeSession.mockResolvedValue({
      success: true,
      data: {
        sessionId: 'default-session',
        phase: 'pre',
        plan: [],
        activeModuleId: null,
        points: 0,
        gems: 0,
        progressPct: 0,
        messages: []
      }
    });

    // Reset store state before each test
    act(() => {
      useSessionStore.getState().clearSession();
    });
  });

  describe('Pure Reducers', () => {
    it('should apply assessment correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      const assessmentData = {
        topic: 'JavaScript Fundamentals',
        chatTitle: 'Learn JavaScript',
        plan: [
          { id: '1', title: 'Variables', points: 30, status: 'in_progress', difficulty: 'intro' },
          { id: '2', title: 'Functions', points: 40, status: 'locked', difficulty: 'core' }
        ]
      };

      act(() => {
        result.current.applyAssessment(assessmentData);
      });

      expect(result.current.topic).toBe('JavaScript Fundamentals');
      expect(result.current.chatTitle).toBe('Learn JavaScript');
      expect(result.current.plan).toEqual(assessmentData.plan);
      expect(result.current.activeModuleId).toBe('1');
      expect(result.current.phase).toBe('learning');
      expect(result.current.points).toBe(0);
      expect(result.current.gems).toBe(0);
      expect(result.current.progressPct).toBe(0);
      expect(result.current.isViewOnly).toBe(false);
    });

    it('should append messages correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.appendMessage({
          role: 'user',
          content: 'Hello',
          ts: '2024-01-01T00:00:00Z'
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toMatchObject({
        role: 'user',
        content: 'Hello',
        ts: '2024-01-01T00:00:00Z',
        tokens: 0
      });
      expect(result.current.messages[0].id).toBeDefined();
      expect(typeof result.current.messages[0].id).toBe('string');
    });

    it('should enforce valid phase transitions', () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Valid transitions
      act(() => {
        result.current.setPhase('assessing');
      });
      expect(result.current.phase).toBe('assessing');

      act(() => {
        result.current.setPhase('learning');
      });
      expect(result.current.phase).toBe('learning');

      // Invalid transition
      act(() => {
        result.current.setPhase('completed');
      });
      expect(result.current.phase).toBe('learning'); // Should not change
    });

    it('should start quiz correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.startQuiz('module-1');
      });

      expect(result.current.phase).toBe('quizzing');
      expect(result.current.activeModuleId).toBe('module-1');
    });

    it('should finish quiz correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Set up initial state
      act(() => {
        result.current.applyAssessment({
          topic: 'Test',
          chatTitle: 'Test',
          plan: [
            { id: '1', title: 'Module 1', points: 30, status: 'in_progress' },
            { id: '2', title: 'Module 2', points: 40, status: 'locked' }
          ]
        });
      });

      act(() => {
        result.current.finishQuiz({
          passed: true,
          pointsEarned: 30,
          nextModuleId: '2'
        });
      });

      expect(result.current.phase).toBe('feedback');
      expect(result.current.plan[0].status).toBe('passed');
      expect(result.current.activeModuleId).toBe('2');
    });

    it('should award points correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.awardPoints(50, 2);
      });

      expect(result.current.points).toBe(50);
      expect(result.current.gems).toBe(2);
      expect(result.current.progressPct).toBe(50);
    });

    it('should lock view only correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.lockViewOnly();
      });

      expect(result.current.isViewOnly).toBe(true);
      expect(result.current.phase).toBe('completed');
      expect(result.current.quizDraft).toBe(null);
    });

    it('should resume session correctly', () => {
      const { result } = renderHook(() => useSessionStore());
      
      const payload = {
        sessionId: 'test-123',
        phase: 'learning',
        mode: 'studying',
        topic: 'Test Topic',
        chatTitle: 'Test Chat',
        plan: [{ id: '1', title: 'Test Module', points: 30, status: 'in_progress' }],
        activeModuleId: '1',
        points: 30,
        gems: 1,
        progressPct: 30,
        isViewOnly: false,
        lastMessages: [
          { role: 'user', content: 'Hello', ts: '2024-01-01T00:00:00Z' }
        ],
        profile: {
          source: 'dummy',
          name: 'Test User',
          background: 'Test background',
          goals: ['Test goal'],
          strengths: ['Test strength'],
          gaps: ['Test gap'],
          timePerDayMins: 30,
          preferredStyle: 'examples-first',
          lastUpdated: '2024-01-01T00:00:00Z'
        }
      };

      act(() => {
        result.current.resumeSession(payload);
      });

      expect(result.current.sessionId).toBe('test-123');
      expect(result.current.phase).toBe('learning');
      expect(result.current.topic).toBe('Test Topic');
      expect(result.current.plan).toEqual(payload.plan);
      expect(result.current.points).toBe(30);
      expect(result.current.gems).toBe(1);
      expect(result.current.progressPct).toBe(30);
    });
  });

  describe('Computed Values', () => {
    it('should return correct phase checks', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.setPhase('learning');
      });

      expect(result.current.isPhase('learning')).toBe(true);
      expect(result.current.isPhase('completed')).toBe(false);
    });

    it('should return correct mode checks', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.mode = 'studying';
      });

      expect(result.current.isMode('studying')).toBe(true);
      expect(result.current.isMode('revision')).toBe(false);
    });

    it('should return correct capability checks', () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Default state
      expect(result.current.canChat()).toBe(true);
      expect(result.current.canStartQuiz()).toBe(false);
      expect(result.current.isCompleted()).toBe(false);

      // Learning phase
      act(() => {
        result.current.setPhase('learning');
      });
      expect(result.current.canStartQuiz()).toBe(true);

      // View only
      act(() => {
        result.current.isViewOnly = true;
      });
      expect(result.current.canChat()).toBe(false);
      expect(result.current.isCompleted()).toBe(true);
    });

    it('should return correct phase display names', () => {
      const { result } = renderHook(() => useSessionStore());
      
      const phases = ['pre', 'assessing', 'learning', 'quizzing', 'feedback', 'completed'];
      const expectedNames = [
        'Pre-Assessment',
        'Assessing',
        'Learning',
        'Quizzing',
        'Feedback',
        'Completed'
      ];

      phases.forEach((phase, index) => {
        act(() => {
          result.current.setPhase(phase);
        });
        expect(result.current.getPhaseDisplayName()).toBe(expectedNames[index]);
      });
    });
  });

  describe('API Actions', () => {
    it('should handle createSession', async () => {
      const { result } = renderHook(() => useSessionStore());
      
      const mockResponse = {
        success: true,
        data: {
          id: 'test-123',
          profile: {
            source: 'dummy',
            name: 'Test User'
          }
        }
      };

      const { createSession } = require('../lib/sessionApi');
      createSession.mockResolvedValue(mockResponse);

      await act(async () => {
        await result.current.createSession();
      });

      expect(result.current.sessionId).toBe('test-123');
      expect(result.current.profile.name).toBe('Test User');
      expect(result.current.loading).toBe(false);
    });

    it('should surface error when assessment response lacks plan', async () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Set up session
      act(() => {
        result.current.sessionId = 'test-123';
      });

      const mockResponse = {
        clarify: true,
        questions: ['What is your experience level?', 'What specific topics interest you?']
      };

      const { assess } = require('../lib/assessmentApi');
      assess.mockResolvedValue(mockResponse);

      let caughtError;
      await act(async () => {
        try {
          await result.current.startAssessment('I want to learn JavaScript');
        } catch (error) {
          caughtError = error;
        }
      });

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toContain('Unexpected assessment response');
      expect(result.current.error).toContain('Unexpected assessment response');
    });

    it('should handle startAssessment with plan response', async () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Set up session
      act(() => {
        result.current.sessionId = 'test-123';
      });

      const mockResponse = {
        data: {
          topic: 'JavaScript Fundamentals',
          chatTitle: 'Learn JavaScript',
          plan: [
            { id: '1', title: 'Variables', points: 30, status: 'in_progress' }
          ]
        }
      };

      const { assess } = require('../lib/assessmentApi');
      assess.mockResolvedValue(mockResponse);
      const { resumeSession } = require('../lib/sessionApi');
      resumeSession.mockResolvedValue({
        success: true,
        data: {
          sessionId: 'test-123',
          phase: 'planning',
          topic: mockResponse.data.topic,
          chatTitle: mockResponse.data.chatTitle,
          plan: mockResponse.data.plan,
          activeModuleId: null,
          points: 0,
          gems: 0,
          progressPct: 0,
          messages: []
        }
      });

      await act(async () => {
        await result.current.startAssessment('I want to learn JavaScript');
      });

      expect(result.current.phase).toBe('planning');
      expect(result.current.topic).toBe(mockResponse.data.topic);
      expect(result.current.plan).toEqual(mockResponse.data.plan);
    });

    it('should handle sendChatMessage', async () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Set up session
      act(() => {
        result.current.sessionId = 'test-123';
      });

      const mockResponse = {
        data: {
          message: 'Hello! How can I help you learn?',
          tokensOut: 15
        }
      };

      const { sendMessage } = require('../lib/chatApi');
      sendMessage.mockResolvedValue(mockResponse);

      await act(async () => {
        await result.current.sendChatMessage('Hello');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('Hello! How can I help you learn?');
    });

    it('never appends an assistant message with undefined content on a module-completion response (pilot B3)', async () => {
      // Module/milestone-completion responses can carry meta + milestone
      // fields with NO `message`. The old code appended
      // { role: 'assistant', content: undefined }, which crashed the chat
      // render (toLowerCase on undefined -> white screen at the module
      // boundary).
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.sessionId = 'test-123';
      });

      const completionShapedResponse = {
        data: {
          // no `message` key at all
          milestoneCompleted: true,
          currentMilestoneIndex: 2,
          meta: { currentMilestoneIndex: 2, milestoneBeingTaught: false },
          phase: 'learning',
          tokensOut: 0
        }
      };

      const { sendMessage } = require('../lib/chatApi');
      sendMessage.mockResolvedValue(completionShapedResponse);

      await act(async () => {
        await result.current.sendChatMessage('done with this milestone');
      });

      // The user message is appended; NO assistant message with undefined
      // content may exist anywhere in the transcript.
      expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
      for (const m of result.current.messages) {
        expect(typeof m.content).toBe('string');
      }
      const undefinedContent = result.current.messages.filter((m) => m.content == null);
      expect(undefinedContent).toHaveLength(0);
      // Meta still synced from the completion response.
      expect(result.current.meta.currentMilestoneIndex).toBe(2);
    });

    it('should handle quiz flow', async () => {
      const { result } = renderHook(() => useSessionStore());
      
      // Set up session
      act(() => {
        result.current.sessionId = 'test-123';
        result.current.activeModuleId = 'module-1';
      });

      const mockStartResponse = {
        questions: [
          { id: 'q1', text: 'What is JavaScript?', options: ['A', 'B', 'C', 'D'], correctIndex: 0 }
        ]
      };

      const mockSubmitResponse = {
        data: {
          passed: true,
          scorePct: 100,
          pointsEarned: 30,
          feedbackMarkdown: 'Great job!',
          nextModuleId: 'module-2'
        }
      };

      const { startQuiz, submitQuiz } = require('../lib/quizApi');
      startQuiz.mockResolvedValue(mockStartResponse);
      submitQuiz.mockResolvedValue(mockSubmitResponse);

      const { resumeSession } = require('../lib/sessionApi');
      resumeSession.mockResolvedValue({
        success: true,
        data: {
          sessionId: 'test-123',
          phase: 'feedback',
          plan: [],
          activeModuleId: 'module-2',
          points: 30,
          gems: 6,
          progressPct: 30,
          messages: []
        }
      });

      // Start quiz
      await act(async () => {
        await result.current.startQuizFromChat('module-1');
      });

      expect(result.current.quizDraft).toEqual(mockStartResponse.questions);
      expect(result.current.phase).toBe('quizzing');

      // Submit quiz
      await act(async () => {
        await result.current.submitQuiz([
          { id: 'q1', userIndex: 0 }
        ]);
      });

      expect(result.current.quizDraft).toBeNull();
      expect(result.current.quizResult).toEqual(mockSubmitResponse.data);
      expect(result.current.isQuizSubmitting).toBe(false);
      expect(result.current.phase).toBe('feedback');
      expect(result.current.points).toBe(30);
      expect(result.current.gems).toBe(6);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { result } = renderHook(() => useSessionStore());
      
      const { createSession } = require('../lib/sessionApi');
      createSession.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        try {
          await result.current.createSession();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.loading).toBe(false);
    });

    it('should clear errors', () => {
      const { result } = renderHook(() => useSessionStore());
      
      act(() => {
        result.current.error = 'Test error';
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });
});

