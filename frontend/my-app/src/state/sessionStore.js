import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as sessionApi from '../lib/sessionApi';
import * as assessmentApi from '../lib/assessmentApi';
import * as chatApi from '../lib/chatApi';
import * as quizApi from '../lib/quizApi';

// Types (for reference - not enforced at runtime)
const Phase = 'pre' | 'assessing' | 'learning' | 'quizzing' | 'feedback' | 'completed';
const Mode = 'studying' | 'revision';
const ModuleStatus = 'locked' | 'in_progress' | 'passed';
const PreferredStyle = 'examples-first' | 'theory-first' | 'mixed';

const initial = { 
  // Core session fields
  sessionId: null, 
  phase: 'pre', 
  mode: 'studying', // Default to studying
  topic: '',
  chatTitle: '', 
  plan: [],
  activeModuleId: null,
  points: 0, 
  gems: 0, 
  progressPct: 0,
  isViewOnly: false, 
  messages: [],
  profile: {
    source: 'dummy',
    name: 'Alex',
    background: '2nd-year CS undergrad',
    goals: ['Pass Algorithms midterm', 'Understand graph traversal well enough to explain it'],
    strengths: ['arrays', 'big-O basics', 'sorting fundamentals'],
    gaps: ['graph traversal', 'BFS vs DFS tradeoffs', 'recurrence intuition'],
    timePerDayMins: 30,
    preferredStyle: 'examples-first',
    lastUpdated: new Date().toISOString()
  },
  model: 'llama',
  meta: {
    countSinceLastCheck: 0,
    outstandingCheck: null,
    assessClarifyCount: 0
  },
  // UI state
  loading: false,
  error: null,
  // Quiz state (transient)
  quizDraft: null
};

const useSessionStore = create(
  persist(
    (set, get) => ({
      // State
      ...initial,

      // Actions - Pure reducers
      applyAssessment: ({ topic, chatTitle, plan }) => {
        const currentTopic = get().topic;
        const topicChanged = currentTopic !== topic;
        
        set({
          topic,
          chatTitle,
          plan: Array.isArray(plan) ? plan : [],
          activeModuleId: plan && plan.length > 0 ? plan[0].id : null,
          phase: 'learning',
          points: 0,
          gems: 0,
          progressPct: 0,
          isViewOnly: false,
          // Only clear messages if topic changed
          messages: topicChanged ? [] : get().messages,
          error: null,
          // Clear assessClarifyCount when entering learning phase
          meta: {
            ...get().meta,
            assessClarifyCount: 0
          }
        });
      },

      appendMessage: ({ role, content, ts, tokens }) => {
        const newMessage = {
          role,
          content,
          ts: ts || new Date().toISOString(),
          tokens: tokens || 0
        };
        
        set(state => ({
          messages: [...state.messages, newMessage]
        }));
  },

  setPhase: (phase) => {
    const validPhases = ['pre', 'assessing', 'learning', 'quizzing', 'feedback', 'completed'];
    if (!validPhases.includes(phase)) {
      console.warn(`Invalid phase: ${phase}. Must be one of: ${validPhases.join(', ')}`);
      return;
    }

        // Enforce legal transitions
        const currentPhase = get().phase;
        const validTransitions = {
          'pre': ['assessing'],
          'assessing': ['learning'],
          'learning': ['quizzing', 'feedback'],
          'quizzing': ['feedback'],
          'feedback': ['learning', 'completed'],
          'completed': []
        };

        if (!validTransitions[currentPhase]?.includes(phase) && phase !== 'assessing') {
          console.warn(`Invalid phase transition: ${currentPhase} → ${phase}`);
          return;
        }

    set({ phase });
  },

      setMode: (mode) => {
        const validModes = ['studying', 'revision'];
        if (!validModes.includes(mode)) {
          console.warn(`Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
          return;
        }
        set({ mode });
      },

      setLearningStyle: (mode) => {
        // Alias for setMode for backward compatibility
        get().setMode(mode);
      },

      startQuiz: (moduleId) => {
        const activeModuleId = moduleId || get().activeModuleId;
        if (!activeModuleId) {
          console.warn('No module ID provided for quiz start');
          return;
        }

        set({
          phase: 'quizzing',
          activeModuleId,
          error: null
        });
      },

      finishQuiz: ({ passed, pointsEarned, nextModuleId }) => {
        const state = get();
        
        // Update plan status optimistically
        if (passed && state.activeModuleId) {
          const updatedPlan = state.plan.map(module => 
            module.id === state.activeModuleId 
              ? { ...module, status: 'passed' }
              : module
          );
          
          set({
            plan: updatedPlan,
            activeModuleId: nextModuleId || null
          });
        }

        set({
          phase: 'feedback',
          error: null
        });
      },

      awardPoints: (points, gems) => {
        const newPoints = Math.max(0, Math.min(100, points));
        const newGems = Math.max(0, gems || Math.floor(newPoints / 20));
        
        set({
          points: newPoints,
          gems: newGems,
          progressPct: newPoints
        });
      },

      lockViewOnly: () => {
        set({
          isViewOnly: true,
          phase: 'completed',
          quizDraft: null // Clear any draft quiz state
        });
      },

      resumeSession: (payload) => {
        if (!payload) return;
        
        set({
          sessionId: payload.sessionId || null,
          phase: payload.phase || 'pre',
          mode: payload.mode || 'studying',
          topic: payload.topic || '',
          chatTitle: payload.chatTitle || '',
          plan: Array.isArray(payload.plan) ? payload.plan : [],
          activeModuleId: payload.activeModuleId || null,
          points: payload.points || 0,
          gems: payload.gems || 0,
          progressPct: payload.progressPct || 0,
          isViewOnly: payload.isViewOnly || false,
          messages: Array.isArray(payload.lastMessages) ? payload.lastMessages : [],
          profile: payload.profile || initial.profile,
          error: null
        });
      },

      // Clear current session (for reset/start fresh)
      clearSession: () => {
        set({
          sessionId: null,
          phase: 'pre',
          mode: 'studying',
          topic: '',
          chatTitle: '',
          plan: [],
          activeModuleId: null,
          points: 0,
          gems: 0,
          progressPct: 0,
          isViewOnly: false,
          messages: [],
          model: 'llama',
          meta: {
            countSinceLastCheck: 0,
            outstandingCheck: null,
            assessClarifyCount: 0
          },
          loading: false,
          error: null,
          quizDraft: null
        });
      },

      // API Actions (thunks)
      createSession: async (profile) => {
        console.log('Creating new session with profile:', profile);
        set({ loading: true, error: null });
        
        try {
          const response = await sessionApi.createSession(profile);
          console.log('Session API response:', response);
          
          if (response.success) {
            console.log('Setting new session data:', response.data);
            set({
              sessionId: response.data.id,
              profile: response.data.profile,
              phase: 'pre',
              mode: 'studying',
              topic: '',
              chatTitle: '',
              plan: [],
              activeModuleId: null,
              points: 0,
              gems: 0,
              progressPct: 0,
              isViewOnly: false,
              messages: [], // Reset messages for new session
              model: 'llama',
              meta: {
                countSinceLastCheck: 0,
                outstandingCheck: null
              },
              quizDraft: null,
              loading: false
            });
            console.log('New session created with ID:', response.data.id);
            return response.data;
          } else {
            throw new Error(response.error || 'Failed to create session');
          }
        } catch (error) {
          console.error('Error creating session:', error);
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      startAssessment: async (userMessage, mode = 'studying') => {
        const state = get();
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        // Add user message immediately
        get().appendMessage({
          role: 'user',
          content: userMessage,
          ts: new Date().toISOString()
        });

        set({ 
          phase: 'assessing', 
          mode,
          loading: true, 
          error: null 
        });

        try {
          const response = await assessmentApi.assess({
            sessionId: state.sessionId,
            userMessage,
            mode,
            profile: state.profile
          });

          if (response.clarify) {
            // Add assistant message with clarification questions
            const questionsText = response.questions.join('\n');
            get().appendMessage({
              role: 'assistant',
              content: `I'd like to clarify a few things:\n\n${questionsText}`,
              ts: new Date().toISOString()
            });
            
            // Handle clarifying questions
            set({
              meta: {
                ...state.meta,
                assessClarifyCount: (state.meta.assessClarifyCount || 0) + 1
              }
            });
            // Stay in assessing phase, return questions for UI
            set({ loading: false });
            return response;
          } else if (response.data?.plan) {
            // Add assistant message announcing the plan
            get().appendMessage({
              role: 'assistant',
              content: `Great! I've created a learning plan for you. Let's start learning!`,
              ts: new Date().toISOString()
            });
            
            // Apply assessment results
            get().applyAssessment({
              topic: response.data.topic,
              chatTitle: response.data.chatTitle,
              plan: response.data.plan
            });
            set({ loading: false });
            return response;
          }

          set({ loading: false });
          return response;
        } catch (error) {
          // Handle 409 errors by resuming session
          if (error.message.includes('409') || error.message.includes('Illegal phase')) {
            try {
              await get().resumeSessionFromServer(state.sessionId);
            } catch (resumeError) {
              console.error('Failed to resume session after 409:', resumeError);
            }
          }
          
          set({ 
            error: error.message, 
            loading: false,
            phase: 'pre' // Revert to pre on error
          });
          throw error;
        }
      },

      answerClarify: async (answers) => {
        const state = get();
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        set({ loading: true, error: null });

        try {
          const response = await assessmentApi.answerClarify(state.sessionId, answers);

          // Check if we got a plan or more clarification
          if (response.data?.plan) {
            // We got a plan - transition to learning
            get().applyAssessment({
              topic: response.data.topic,
              chatTitle: response.data.chatTitle,
              plan: response.data.plan
            });
            // Clear assessClarifyCount
            set({
              meta: {
                ...state.meta,
                assessClarifyCount: 0
              }
            });
          } else if (response.clarify) {
            // Still in clarification
            set({
              meta: {
                ...state.meta,
                assessClarifyCount: (state.meta.assessClarifyCount || 0) + 1
              }
            });
          }

          set({ loading: false });
          return response;
        } catch (error) {
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      sendChatMessage: async (userMessage) => {
        const state = get();
        console.log('sendChatMessage called with:', userMessage);
        console.log('Current sessionId:', state.sessionId);
        console.log('Current messages count:', state.messages.length);
        
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        // Add user message immediately
        get().appendMessage({
          role: 'user',
          content: userMessage,
          ts: new Date().toISOString()
        });
        
        console.log('User message added. Messages count now:', get().messages.length);

        set({ loading: true, error: null });

        try {
          console.log('Sending request to backend...');
          const response = await chatApi.sendMessage({
            sessionId: state.sessionId,
            userMessage
          });
          
          console.log('Backend response:', response);

              // Add assistant response
              get().appendMessage({
                role: 'assistant',
                content: response.data.message,
                ts: new Date().toISOString(),
                tokens: response.data.tokensOut
              });
              
              console.log('Assistant message added. Messages count now:', get().messages.length);

              // Update meta if provided
              if (response.data?.meta || response.meta) {
                set({ meta: { ...state.meta, ...(response.data?.meta || response.meta) } });
              }

              // Update phase if it changed (e.g., from 'pre' to 'learning')
              if (response.data?.phase && response.data.phase !== state.phase) {
                console.log('Phase changed from', state.phase, 'to', response.data.phase);
                set({ phase: response.data.phase });
              }

              // Only update points/gems for learning intent
              // General and admin intents should not mutate progress
              const intent = response.data?.intent;
              if (intent === 'learning' && response.data.pointsDelta) {
                const newPoints = Math.max(0, Math.min(100, state.points + (response.data.pointsDelta || 0)));
                const newGems = Math.floor(newPoints / 20);
                set({ 
                  points: newPoints, 
                  gems: newGems,
                  progressPct: newPoints
                });
              }
              // If intent is 'general' or 'admin', do not mutate points/gems

          // Check for quiz intent
          if (response.data?.nextAction === 'START_QUIZ' || response.nextAction === 'START_QUIZ') {
            await get().startQuizFromChat(response.moduleId || response.data?.moduleId);
          }

          set({ loading: false });
          return response;
        } catch (error) {
          console.error('Error in sendChatMessage:', error);
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      startQuizFromChat: async (moduleId) => {
        const state = get();
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        try {
          const response = await quizApi.startQuiz({
            sessionId: state.sessionId,
            moduleId: moduleId || state.activeModuleId
          });

          // Store quiz draft
          set({ 
            quizDraft: response.questions,
            loading: false 
          });

          // Start quiz
          get().startQuiz(moduleId || state.activeModuleId);
          return response;
        } catch (error) {
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      submitQuiz: async (answers) => {
        const state = get();
        if (!state.sessionId || !state.activeModuleId) {
          throw new Error('No active session or module');
        }

        set({ loading: true, error: null });

        try {
          const response = await quizApi.submitQuiz({
            sessionId: state.sessionId,
            moduleId: state.activeModuleId,
            answers
          });

          // Update points and progress
          get().awardPoints(
            state.points + response.pointsEarned,
            Math.floor((state.points + response.pointsEarned) / 20)
          );

          // Finish quiz with results
          get().finishQuiz({
            passed: response.passed,
            pointsEarned: response.pointsEarned,
            nextModuleId: response.nextModuleId
          });

          // Check if completed
          if (response.completed) {
            get().lockViewOnly();
          }

          set({ loading: false });
          return response;
        } catch (error) {
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      resumeSessionFromServer: async (sessionId) => {
        set({ loading: true, error: null });

        try {
          const response = await sessionApi.resumeSession(sessionId);
          if (response.success) {
            get().resumeSession(response.data);
            set({ sessionId, loading: false });
            return response.data;
          } else {
            throw new Error(response.error || 'Failed to resume session');
          }
        } catch (error) {
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      // Utility methods
      reset: async () => {
        console.log('Resetting session...');
        
        // Clear local state first
        set({ ...initial });
        
        // Clear persisted data from localStorage
        localStorage.removeItem('session-storage');
        
        // Create a new session to ensure clean state
        try {
          console.log('Creating new session after reset...');
          await get().createSession();
          console.log('New session created successfully');
        } catch (error) {
          console.error('Failed to create new session after reset:', error);
        }
      },

      clearError: () => set({ error: null }),

      // Computed values
      isPhase: (phase) => get().phase === phase,
      isMode: (mode) => get().mode === mode,
      hasProgress: () => get().progressPct > 0,
      hasPlan: () => get().plan.length > 0,
      isActive: () => get().sessionId !== null,
      canChat: () => !get().isViewOnly && !get().isPhase('quizzing'),
      canStartQuiz: () => get().isPhase('learning') || get().isPhase('feedback'),
      isCompleted: () => get().isPhase('completed') || get().isViewOnly,

      // Phase display names
  getPhaseDisplayName: () => {
    const phaseNames = {
      pre: 'Pre-Assessment',
      assessing: 'Assessing',
      learning: 'Learning',
      quizzing: 'Quizzing',
      feedback: 'Feedback',
      completed: 'Completed',
    };
        return phaseNames[get().phase] || get().phase;
      },

    }),
    {
      name: 'session-storage',
      partialize: (state) => ({
        sessionId: state.sessionId,
        phase: state.phase,
        mode: state.mode,
        topic: state.topic,
        chatTitle: state.chatTitle,
        plan: state.plan,
        activeModuleId: state.activeModuleId,
        points: state.points,
        gems: state.gems,
        progressPct: state.progressPct,
        isViewOnly: state.isViewOnly,
        profile: state.profile,
        model: state.model
      })
    }
  )
);

export default useSessionStore;