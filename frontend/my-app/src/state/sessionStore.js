import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as sessionApi from '../lib/sessionApi';
import * as assessmentApi from '../lib/assessmentApi';
import * as chatApi from '../lib/chatApi';
import * as quizApi from '../lib/quizApi';
import * as courseApi from '../lib/courseApi';
import useAuthStore from './authStore';

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
  totalMessageCount: null, // total in session (for paging)
  hasMoreMessages: false, // true if more older messages can be loaded
  profile: null, // Will be populated from auth store
  model: 'llama',
  meta: {
    countSinceLastCheck: 0,
    outstandingCheck: null,
    assessClarifyCount: 0
  },
  pendingQuizModuleId: null,
  // UI state
  loading: false,
  error: null,
  // Quiz state (transient)
  quizDraft: null,
  quizResult: null,
  isQuizSubmitting: false,
  // Course session fields (null for self-directed sessions)
  courseId: null,
  courseTopicId: null,
  courseName: null,
  courseTopicTitle: null
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
          // DON'T clear messages - backend already manages them
          // messages will be reloaded from backend via resumeSessionFromServer
          error: null,
          // Clear assessClarifyCount when entering learning phase
          meta: {
            ...get().meta,
            assessClarifyCount: 0
          }
        });
      },

      // Approve plan and move to learning phase
      approvePlan: async () => {
        const state = get();
        console.log('approvePlan called', { sessionId: state.sessionId, phase: state.phase });
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        if (state.phase !== 'planning') {
          throw new Error('Plan must be in planning phase to approve');
        }

        set({ loading: true, error: null });

        try {
          const response = await assessmentApi.approvePlan({
            sessionId: state.sessionId
          });
          console.log('approvePlan response:', response);

          // Apply approved plan and move to learning phase
          get().applyAssessment({
            topic: response.data.topic,
            chatTitle: response.data.chatTitle,
            plan: response.data.plan
          });
          
          // Reload session to get backend messages (including approval message)
          await get().resumeSessionFromServer(state.sessionId);
          
          set({ loading: false });
          return response;
        } catch (error) {
          console.error('Error approving plan:', error);
          set({ 
            error: error.message, 
            loading: false
          });
          throw error;
        }
      },

      // Request plan modifications
      modifyPlan: async (modificationRequest) => {
        const state = get();
        console.log('modifyPlan called', { sessionId: state.sessionId, modificationRequest, phase: state.phase });
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        if (state.phase !== 'planning') {
          throw new Error('Plan must be in planning phase to modify');
        }

        if (!modificationRequest || modificationRequest.trim() === '') {
          throw new Error('Modification request required');
        }

        set({ loading: true, error: null });

        try {
          const response = await assessmentApi.modifyPlan({
            sessionId: state.sessionId,
            modificationRequest: modificationRequest.trim()
          });
          console.log('modifyPlan response:', response);

          // Update plan with modified version (stay in planning phase)
          set({
            topic: response.data.topic,
            chatTitle: response.data.chatTitle,
            plan: Array.isArray(response.data.plan) ? response.data.plan : [],
            phase: 'planning', // Stay in planning phase for re-approval
            activeModuleId: null,
            loading: false,
            error: null
          });
          
          // Reload session to get backend messages (including modification messages)
          await get().resumeSessionFromServer(state.sessionId);
          
          return response;
        } catch (error) {
          console.error('Error modifying plan:', error);
          set({ 
            error: error.message, 
            loading: false
          });
          throw error;
        }
      },

      appendMessage: ({ role, content, ts, tokens }) => {
        const tsVal = ts || new Date().toISOString();
        const newMessage = {
          id: `msg-${tsVal}-${Math.random().toString(36).slice(2, 11)}`,
          role,
          content,
          ts: tsVal,
          tokens: tokens || 0
        };
        
        set(state => ({
          messages: [...state.messages, newMessage]
        }));
      },

      /** Append content to the last assistant message (for streaming). Creates one if needed. */
      appendToLastMessage: (chunk) => {
        set(state => {
          const messages = Array.isArray(state.messages) ? [...state.messages] : [];
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = {
              ...last,
              content: (last.content || '') + chunk
            };
          } else {
            messages.push({
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              role: 'assistant',
              content: chunk,
              ts: new Date().toISOString(),
              tokens: 0
            });
          }
          return { messages };
        });
      },

      /** Remove the last message if it is from assistant (for retry flow). */
      removeLastAssistantMessage: () => {
        set(state => {
          const messages = Array.isArray(state.messages) ? state.messages : [];
          if (messages.length === 0) return state;
          const last = messages[messages.length - 1];
          if (last.role !== 'assistant') return state;
          return { messages: messages.slice(0, -1) };
        });
      },

  setPhase: (phase) => {
    const validPhases = ['pre', 'assessing', 'learning', 'quizzing', 'feedback', 'completed'];
    if (!validPhases.includes(phase)) {
      console.warn(`Invalid phase: ${phase}. Must be one of: ${validPhases.join(', ')}`);
      return;
    }

        // Enforce legal transitions
        const currentPhase = get().phase;
        if (currentPhase === phase) {
          return;
        }
        const validTransitions = {
          'pre': ['assessing', 'learning'],
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
        // Map frontend 'revision' to backend 'reviewing' when creating/updating session
        // But store as 'revision' in frontend state
        set({ mode });
      },

      setLearningStyle: (mode) => {
        // Alias for setMode for backward compatibility
        get().setMode(mode);
      },

      startQuiz: (moduleId) => {
        const state = get();
        const activeModuleId = moduleId || state.activeModuleId;
        if (!activeModuleId) {
          console.warn('No module ID provided for quiz start');
          return;
        }

        // This is a STUDY quiz - ensure revision flags are cleared
        set({
          phase: 'quizzing',
          activeModuleId,
          error: null,
          meta: {
            ...state.meta,
            isRevision: false, // Explicitly set to false for study quizzes
            revisionTopic: null // Clear revision topic
          }
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
          quizDraft: null,
          quizResult: null,
          isQuizSubmitting: false,
          pendingQuizModuleId: null // Clear any draft quiz state
        });
      },

      resumeSession: (payload) => {
        if (!payload) return;
        // Normalize for old backend: it may send full messages array instead of lastMessages/totalMessageCount/hasMoreMessages
        const lastMessages = Array.isArray(payload.lastMessages) ? payload.lastMessages : (Array.isArray(payload.messages) ? payload.messages.slice(-20) : null);
        const totalMessageCount = payload.totalMessageCount !== undefined ? payload.totalMessageCount : (Array.isArray(payload.messages) ? payload.messages.length : undefined);
        const hasMoreMessages = payload.hasMoreMessages ?? (Array.isArray(payload.messages) && payload.messages.length > 20);
        
        const currentSessionId = get().sessionId;
        const resolvedSessionId = payload.sessionId ?? payload.id ?? currentSessionId ?? null;

        const draftAttempt = Array.isArray(payload.quizAttempts)
          ? payload.quizAttempts
              .filter(attempt => attempt && attempt.status === 'draft')
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
          : null;
        const draftItems = draftAttempt?.items || null;
        
        // Always update plan if provided to ensure milestone states are synced
        const updatedPlan = Array.isArray(payload.plan) ? payload.plan : get().plan;
        
        // Map backend 'reviewing' to frontend 'revision'
        const mappedMode = payload.mode === 'reviewing' ? 'revision' : (payload.mode || get().mode || 'studying');
        
        const prevMessages = get().messages;
        const messagesWithIds = Array.isArray(lastMessages)
          ? lastMessages.map((m, i) => ({ ...m, id: m.id || m._id || `msg-resumed-${i}-${m.ts || ''}-${String(m.content || '').slice(0, 40)}` }))
          : (Array.isArray(prevMessages) ? prevMessages : []);

        set(prev => {
          // Merge meta from backend so StudyPanelNav shows correct active milestone (currentMilestoneIndex)
          const mergedMeta = payload.meta && typeof payload.meta === 'object'
            ? { ...prev.meta, ...payload.meta }
            : prev.meta;
          return {
          sessionId: resolvedSessionId,
          phase: payload.phase || prev.phase || 'pre',
          mode: mappedMode,
          topic: payload.topic ?? prev.topic ?? '',
          chatTitle: payload.chatTitle ?? prev.chatTitle ?? '',
          plan: updatedPlan, // Always use updated plan to sync milestone states
          activeModuleId: payload.activeModuleId ?? prev.activeModuleId ?? null,
          // Use payload values if provided (0 is valid), otherwise keep prev values
          points: payload.points !== undefined ? payload.points : prev.points ?? 0,
          gems: payload.gems !== undefined ? payload.gems : prev.gems ?? 0,
          progressPct: payload.progressPct !== undefined ? payload.progressPct : prev.progressPct ?? 0,
          isViewOnly: payload.isViewOnly ?? prev.isViewOnly ?? false,
          courseId: payload.courseId ?? prev.courseId ?? null,
          courseTopicId: payload.courseTopicId ?? prev.courseTopicId ?? null,
          courseName: payload.courseName ?? prev.courseName ?? null,
          courseTopicTitle: payload.courseTopicTitle ?? prev.courseTopicTitle ?? null,
          meta: mergedMeta,
          messages: messagesWithIds,
          totalMessageCount: totalMessageCount !== undefined ? totalMessageCount : prev.totalMessageCount,
          hasMoreMessages: hasMoreMessages ?? prev.hasMoreMessages ?? false,
          profile: payload.profile || prev.profile || null,
          error: null,
          quizDraft: draftItems && draftItems.length > 0
            ? draftItems
            : payload.phase === 'quizzing'
              ? prev.quizDraft
              : null,
          quizResult: prev.quizResult,
          isQuizSubmitting: false,
          pendingQuizModuleId: payload.phase === 'quizzing' ? prev.pendingQuizModuleId : prev.pendingQuizModuleId
        };
        });

        const latest = get();
        if (
          latest.pendingQuizModuleId &&
          latest.phase === 'quizzing' &&
          (!latest.quizDraft || latest.quizDraft.length === 0)
        ) {
          queueMicrotask(() => {
            const current = get();
            if (
              current.pendingQuizModuleId &&
              current.phase === 'quizzing' &&
              (!current.quizDraft || current.quizDraft.length === 0)
            ) {
              get().startQuizFromChat(current.pendingQuizModuleId)
                .then(() => {
                  set({ pendingQuizModuleId: null });
                })
                .catch(err => {
                  console.error('Deferred quiz start failed:', err);
                });
            }
          });
        }
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
          totalMessageCount: null,
          hasMoreMessages: false,
          model: 'llama',
          meta: {
            countSinceLastCheck: 0,
            outstandingCheck: null,
            assessClarifyCount: 0
          },
          loading: false,
          error: null,
          quizDraft: null,
          quizResult: null,
          isQuizSubmitting: false,
          pendingQuizModuleId: null
        });
      },

      // API Actions (thunks)
      createSession: async (profileOverride) => {
        const state = get();
        
        // Prevent multiple simultaneous session creation calls
        if (state.loading) {
          console.log('Session creation already in progress, skipping...');
          return;
        }
        
        // Get profile from auth store if not provided
        let profileToUse = profileOverride;
        if (!profileToUse) {
          const authState = useAuthStore.getState();
          if (authState.user && authState.user.profile) {
            // Convert user profile to session profile format
            profileToUse = {
              source: 'user',
              name: authState.user.name,
              background: authState.user.profile.background || '',
              goals: authState.user.profile.goals || [],
              strengths: authState.user.profile.strengths || [],
              gaps: authState.user.profile.gaps || [],
              timePerDayMins: authState.user.profile.timePerDayMins || 30,
              preferredStyle: authState.user.profile.preferredStyle || 'mixed',
              lastUpdated: new Date().toISOString(),
              skillLevel: authState.user.profile.skillLevel || 'Beginner',
              learningType: authState.user.profile.learningType || 'Visual',
              major: authState.user.profile.major || '',
              currentCourses: authState.user.profile.currentCourses || [],
              daysPerWeek: authState.user.profile.daysPerWeek || 3,
              minutesPerSession: authState.user.profile.minutesPerSession || 30,
              recentTopics: authState.user.profile.recentTopics || [],
              selfRating: authState.user.profile.selfRating || '',
              primaryGoal: authState.user.profile.primaryGoal || '',
              defaultMode: authState.user.profile.defaultMode || 'Studying',
              explanationLength: authState.user.profile.explanationLength || 'Balanced',
              examplesPreference: authState.user.profile.examplesPreference || 'Many',
              language: authState.user.profile.language || 'English',
            };
          } else {
            // Fallback: user must be authenticated to create sessions
            throw new Error('User must be authenticated to create a session');
          }
        }
        
        console.log('Creating new session with profile:', profileToUse);
        set({ loading: true, error: null });
        
        // Map frontend 'revision' to backend 'reviewing' when creating session
        const currentMode = get().mode;
        const backendMode = currentMode === 'revision' ? 'reviewing' : (currentMode || 'studying');
        const profileWithMode = {
          ...profileToUse,
          mode: backendMode
        };
        
        try {
          const response = await sessionApi.createSession(profileWithMode);
          console.log('Session API response:', response);
          
          if (response.success) {
            console.log('Setting new session data:', response.data);
            
            // IMPORTANT: Load the actual session state from backend, not assume 'pre'
            const actualSession = response.data;
            
            // Map backend 'reviewing' to frontend 'revision'
            const sessionMode = actualSession.mode === 'reviewing' ? 'revision' : (actualSession.mode || 'studying');
            
            const messagesWithIds = Array.isArray(actualSession.messages)
              ? actualSession.messages.map((m, i) => ({ ...m, id: m.id || m._id || `msg-created-${i}-${m.ts || ''}` }))
              : [];
            set({
              sessionId: actualSession.id,
              profile: actualSession.profile,
              phase: actualSession.phase || 'pre',  // Use actual phase from backend
              mode: sessionMode,
              topic: actualSession.topic || '',
              chatTitle: actualSession.chatTitle || '',
              plan: Array.isArray(actualSession.plan) ? actualSession.plan : [],
              activeModuleId: actualSession.activeModuleId || null,
              points: actualSession.points || 0,
              gems: actualSession.gems || 0,
              progressPct: actualSession.progressPct || 0,
              isViewOnly: actualSession.isViewOnly || false,
              messages: messagesWithIds,
              model: 'llama',
              meta: {
                countSinceLastCheck: 0,
                outstandingCheck: null
              },
              quizDraft: null,
              quizResult: null,
              isQuizSubmitting: false,
              loading: false
            });
            console.log('New session created with ID:', actualSession.id, 'phase:', actualSession.phase);
            return actualSession;
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
        console.log('startAssessment called', { userMessage, mode, currentPhase: state.phase, sessionId: state.sessionId });
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        // DON'T add user message here - backend will add it to avoid duplicates
        // The backend already added it when shouldTriggerAssessment was true

        set({ 
          phase: 'assessing', 
          mode,
          loading: true, 
          error: null 
        });

        try {
          console.log('Calling assessmentApi.assess with:', { sessionId: state.sessionId, userMessage, mode });
          const response = await assessmentApi.assess({
            sessionId: state.sessionId,
            userMessage,
            mode,
            profile: state.profile
          });
          console.log('assessmentApi.assess response:', response);

          // Always expect a plan (no clarification questions anymore)
          if (response.data?.plan) {
            // Backend already added the assistant plan announcement message
            // Apply the plan data but stay in planning phase (not learning)
            
            // Update plan data but keep phase as 'planning' for approval
            set({
              topic: response.data.topic,
              chatTitle: response.data.chatTitle,
              plan: Array.isArray(response.data.plan) ? response.data.plan : [],
              phase: 'planning', // Stay in planning phase until approved
              activeModuleId: null, // No active module until approved
              loading: false,
              error: null,
              meta: {
                ...state.meta,
                assessClarifyCount: 0
              }
            });
            
            // Reload session to get backend messages
            await get().resumeSessionFromServer(state.sessionId);
            
            return response;
          } else {
            throw new Error('Unexpected assessment response - expected plan');
          }
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

      sendChatMessage: async (userMessage, options = {}) => {
        const state = get();
        const skipUserAppend = options.skipUserAppend === true; // true when retrying (don't re-append user message)
        
        if (!state.sessionId) {
          throw new Error('No active session');
        }

        if (state.phase === 'assessing') {
          set({ loading: false });
          return;
        }

        if (!skipUserAppend) {
          get().appendMessage({
            role: 'user',
            content: userMessage,
            ts: new Date().toISOString()
          });
        }

        set({ loading: true, error: null });

        try {
          const backendMode = state.mode === 'revision' ? 'reviewing' : (state.mode || 'studying');
          let response;
          let hadStreamChunks = false;

          try {
            response = await chatApi.sendMessageStream({
              sessionId: state.sessionId,
              userMessage,
              mode: backendMode,
              onChunk: (chunk) => {
                hadStreamChunks = true;
                get().appendToLastMessage(chunk);
              }
            });
          } catch (streamError) {
            console.warn('Streaming failed, falling back to non-streaming', streamError.message);
            if (hadStreamChunks) {
              get().removeLastAssistantMessage();
            }
            hadStreamChunks = false;
            response = await chatApi.sendMessage({
              sessionId: state.sessionId,
              userMessage,
              mode: backendMode
            });
          }

              if (!hadStreamChunks && response.data?.message) {
                get().appendMessage({
                  role: 'assistant',
                  content: response.data.message,
                  ts: new Date().toISOString(),
                  tokens: response.data.tokensOut
                });
              } else if (hadStreamChunks && response.data?.message) {
                set(s => {
                  const messages = [...(s.messages || [])];
                  const last = messages[messages.length - 1];
                  if (last?.role === 'assistant') {
                    messages[messages.length - 1] = { ...last, content: response.data.message };
                  }
                  return { messages };
                });
              }

              // Check if we should trigger assessment
              if (response.data?.shouldTriggerAssessment) {
                console.log('shouldTriggerAssessment detected, starting assessment with:', response.data.originalMessage);
                
                // Update phase immediately if backend set it
                if (response.data.phase && response.data.phase !== state.phase) {
                  set({ phase: response.data.phase });
                }
                
                // Automatically start assessment (don't add intermediate message - let assessment API handle messages)
                const assessmentMessage = response.data.originalMessage || userMessage;
                await get().startAssessment(assessmentMessage, state.mode);
                return response;
              }

              get().appendMessage({
                role: 'assistant',
                content: response.data.message,
                ts: new Date().toISOString(),
                tokens: response.data.tokensOut
              });

              // Always sync meta from chat response so StudyPanelNav shows correct active milestone
              const metaFromResponse = response.data?.meta || response.meta;
              const currentIdx = response.data?.currentMilestoneIndex;
              if (metaFromResponse || typeof currentIdx === 'number') {
                set(s => ({
                  meta: {
                    ...s.meta,
                    ...(metaFromResponse || {}),
                    ...(typeof currentIdx === 'number' ? { currentMilestoneIndex: currentIdx } : {})
                  }
                }));
              }

              if (response.data?.phase && response.data.phase !== state.phase) {
                set({ phase: response.data.phase });
              }
              if (response.data?.plan) {
                set({ plan: response.data.plan });
              }
              
              if (response.data?.activeModuleId !== undefined) {
                set({ activeModuleId: response.data.activeModuleId });
              }
              
              // Update points, gems, and progressPct together (points should be checked first for atomic update)
              let pointsOrGemsUpdated = false;
              if (response.data?.points !== undefined) {
                const newPoints = response.data.points;
                // Update gems when points change (from reset or other operations)
                // CRITICAL: Gems should NEVER decrease - only increase or stay the same
                let newGems;
                if (response.data?.gems !== undefined) {
                  const responseGems = response.data.gems;
                  const currentGems = get().gems || 0;
                  newGems = Math.max(currentGems, responseGems);
                } else {
                  // Calculate gems from points if not provided, but never decrease
                  const calculatedGems = Math.floor(newPoints / 20);
                  const currentGems = get().gems || 0;
                  newGems = Math.max(currentGems, calculatedGems);
                }
                // Use progressPct from response if provided, otherwise use points
                const newProgressPct = response.data?.progressPct !== undefined 
                  ? response.data.progressPct 
                  : newPoints;
                
                set({ 
                  points: newPoints,
                  gems: newGems,
                  progressPct: newProgressPct
                });
                pointsOrGemsUpdated = true;
              } else if (response.data?.progressPct !== undefined) {
                // Only update progressPct if points not provided
                set({ progressPct: response.data.progressPct });
              }
              
              // Refresh user data to sync gems in profile chip after points/gems update
              if (pointsOrGemsUpdated) {
                try {
                  await useAuthStore.getState().fetchUser();
                  console.log('User data refreshed after points/gems update for profile sync');
                } catch (userRefreshError) {
                  console.error('Failed to refresh user data after points update:', userRefreshError);
                }
              }
              
              // Update milestone completion status
              // Plan and activeModuleId are already updated from response above - no need to
              // call resumeSessionFromServer (which replaces messages and causes chat "reload" UX)
              if (response.data?.milestoneCompleted) {
                console.log('Milestone completed, plan/activeModuleId already synced from response', {
                  currentMilestoneIndex: response.data.currentMilestoneIndex,
                  totalMilestones: response.data.totalMilestones
                });
                
                // Refresh user data to sync gems in profile chip after milestone completion
                try {
                  await useAuthStore.getState().fetchUser();
                  console.log('User data refreshed after milestone completion for gems sync');
                } catch (userRefreshError) {
                  console.error('Failed to refresh user data after milestone:', userRefreshError);
                }
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
                
                // Refresh user data to sync gems in profile chip after points update
                try {
                  await useAuthStore.getState().fetchUser();
                  console.log('User data refreshed after points update for gems sync');
                } catch (userRefreshError) {
                  console.error('Failed to refresh user data after points update:', userRefreshError);
                }
              }
              // If intent is 'general' or 'admin', do not mutate points/gems

          // Handle revision quiz start when backend returns nextAction: 'START_REVISION_QUIZ'
          if (response.data?.nextAction === 'START_REVISION_QUIZ' || response.nextAction === 'START_REVISION_QUIZ') {
            const topic = response.data?.topic || userMessage;
            const chatTitle = response.data?.chatTitle || topic;
            console.log('Revision quiz start requested by backend', { topic, chatTitle, sessionId: state.sessionId });
            
            try {
              // Refresh session state first to ensure mode and chatTitle are updated from backend
              const resumedSession = await get().resumeSessionFromServer(state.sessionId);
              
              // Update with LLM-generated topic and chatTitle if provided (backend may have saved it, but ensure it's set)
              if (topic || chatTitle) {
                set({ 
                  topic: topic || resumedSession?.topic || state.topic,
                  chatTitle: chatTitle || resumedSession?.chatTitle || topic || state.chatTitle
                });
              }
              
              // Small delay to ensure state is synced
              await new Promise(resolve => setTimeout(resolve, 100));
              await get().startRevisionQuiz(topic);
            } catch (quizError) {
              console.error('Failed to start revision quiz after backend request:', quizError);
              console.error('Quiz error details:', {
                message: quizError.message,
                stack: quizError.stack,
                sessionId: state.sessionId,
                topic: topic
              });
              set({ error: quizError.message || 'Failed to start revision quiz. Please try again.' });
            }
          }
          
          // Handle quiz start when backend returns nextAction: 'START_QUIZ'
          if (response.data?.nextAction === 'START_QUIZ' || response.nextAction === 'START_QUIZ') {
            const moduleForQuiz = response.data?.moduleId || response.moduleId || get().activeModuleId;
            console.log('Quiz start requested by backend, calling startQuizFromChat', { moduleForQuiz });
            try {
              await get().startQuizFromChat(moduleForQuiz);
            } catch (quizError) {
              console.error('Failed to start quiz after backend request:', quizError);
              set({ error: 'Failed to start quiz. Please try again.' });
            }
          } else if (response.data?.phase === 'quizzing' && state.phase !== 'quizzing') {
            console.log('Phase changed to quizzing - waiting for user to type "start quiz"');
            // Don't auto-start - let user explicitly trigger with "start quiz" message
          }

          set({ loading: false });
          return response;
        } catch (error) {
          console.error('Error in sendChatMessage:', error);
          
          // Handle validation errors
          if (error.message.includes('Validation failed') || error.message.includes('Session ID is required') || error.message.includes('Invalid session ID')) {
            console.log('Validation error detected, attempting to create new session...');
            try {
              // Clear the invalid session and create a new one
              set({ sessionId: null });
              await get().createSession();
              // Retry the message with the new session
              const newState = get();
              if (newState.sessionId) {
                return await get().sendChatMessage(userMessage);
              } else {
                throw new Error('Failed to create new session. Please refresh the page.');
              }
            } catch (createError) {
              console.error('Failed to create new session:', createError);
              set({ 
                error: 'Session error. Please refresh the page and try again.', 
                loading: false 
              });
              throw new Error('Session error. Please refresh the page and try again.');
            }
          }
          
          // Handle 409 ILLEGAL_PHASE - session state mismatch
          if (error.message.includes('409') || error.message.includes('ILLEGAL_PHASE') || error.message.includes('Please complete assessment first')) {
            console.log('Session phase mismatch detected, resuming from server...');
            try {
              await get().resumeSessionFromServer(state.sessionId);
              console.log('Session resumed successfully, retrying message...');
              // Retry the message after resuming
              return await get().sendChatMessage(userMessage);
            } catch (resumeError) {
              console.error('Failed to resume session:', resumeError);
              set({ 
                error: 'Session state error. Please refresh the page.', 
                loading: false 
              });
              throw new Error('Session state error. Please refresh the page.');
            }
          }
          
          // Handle 404 - session not found
          if (error.message.includes('404') || error.message.includes('Session not found')) {
            console.log('Session not found, creating new session...');
            try {
              set({ sessionId: null });
              await get().createSession();
              const newState = get();
              if (newState.sessionId) {
                return await get().sendChatMessage(userMessage);
              } else {
                throw new Error('Failed to create new session.');
              }
            } catch (createError) {
              console.error('Failed to create new session:', createError);
              set({ 
                error: 'Session not found. Please refresh the page.', 
                loading: false 
              });
              throw new Error('Session not found. Please refresh the page.');
            }
          }
          
          set({ 
            error: error.message || 'Failed to send message. Please try again.', 
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
        if (state.quizDraft && state.quizDraft.length > 0 && !state.meta?.isRevision) {
          console.log('startQuizFromChat skipped - draft already present');
          return { questions: state.quizDraft };
        }

        try {
          set({ loading: true, error: null });
          console.log('startQuizFromChat invoked', { moduleId, activeModuleId: state.activeModuleId, existingDraft: state.quizDraft?.length, currentMode: state.mode });
          const response = await quizApi.startQuiz({
            sessionId: state.sessionId,
            moduleId: moduleId || state.activeModuleId
          });

          console.log('Quiz API response received', { 
            hasQuestions: !!response.questions, 
            questionsCount: response.questions?.length,
            responseKeys: Object.keys(response)
          });

          // Ensure we have questions in the response
          if (!response.questions || !Array.isArray(response.questions) || response.questions.length === 0) {
            throw new Error('Quiz API returned no questions. Please try again.');
          }

          // Store quiz draft and CLEAR revision flags (this is a STUDY quiz, not revision)
          set({ 
            quizDraft: response.questions,
            quizResult: null,
            isQuizSubmitting: false,
            loading: false,
            pendingQuizModuleId: null,
            phase: 'quizzing', // Explicitly set phase to quizzing
            meta: {
              ...state.meta,
              isRevision: false, // Explicitly set to false for study quizzes
              revisionTopic: null // Clear revision topic
            }
          });

          // Start quiz - this sets phase to quizzing (already set above, but this ensures consistency)
          get().startQuiz(moduleId || state.activeModuleId);
          
          console.log('Quiz state set', { 
            quizDraftLength: response.questions.length, 
            phase: 'quizzing' 
          });
          
          return response;
        } catch (error) {
          set({ 
            error: error.message, 
            loading: false 
          });
          throw error;
        }
      },

      startRevisionQuiz: async (topic) => {
        const state = get();
        if (!state.sessionId) {
          throw new Error('No active session');
        }
        if (state.quizDraft && state.quizDraft.length > 0 && state.meta?.isRevision) {
          console.log('startRevisionQuiz skipped - draft already present');
          return { questions: state.quizDraft, topic, isRevision: true };
        }

        try {
          set({ loading: true, error: null });
          console.log('startRevisionQuiz invoked', { 
            topic, 
            sessionId: state.sessionId,
            currentMode: state.mode,
            currentPhase: state.phase
          });
          
          const response = await quizApi.startRevisionQuiz({
            sessionId: state.sessionId,
            topic: topic.trim()
          });
          
          console.log('startRevisionQuiz response:', response);

          // Store quiz draft with revision flag
          set({ 
            quizDraft: response.questions,
            quizResult: null,
            isQuizSubmitting: false,
            loading: false,
            phase: 'quizzing',
            topic: topic.trim(),
            meta: {
              ...state.meta,
              isRevision: true,
              revisionTopic: topic.trim()
            }
          });

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
        if (!state.sessionId) {
          throw new Error('No active session');
        }
        
        // For revision quizzes, moduleId is not required
        const isRevision = state.meta?.isRevision;
        if (!isRevision && !state.activeModuleId) {
          throw new Error('No active module');
        }

        set({ isQuizSubmitting: true, error: null });

        try {
          const response = await quizApi.submitQuiz({
            sessionId: state.sessionId,
            moduleId: isRevision ? undefined : state.activeModuleId,
            answers
          });

          const result = response?.data || response;
          if (!result) {
            throw new Error('Invalid quiz submission response');
          }

          // Update gems if bonus gems were awarded
          if (result.passed && result.bonusGems) {
            set(prevState => ({
              gems: (prevState.gems || 0) + result.bonusGems
            }));
          }

          // Set quiz result first
          set(prevState => ({
            quizResult: result,
            quizDraft: null,
            isQuizSubmitting: false
          }));

          // Always refresh session state after quiz submit to sync milestones, activeModuleId, and phase
          // The backend sets the correct phase (e.g., 'completed' for revision quizzes from study sessions)
          // resumeSessionFromServer will update the phase automatically via resumeSession
          try {
            const refreshedSession = await get().resumeSessionFromServer(state.sessionId);
            console.log('Session refreshed after quiz submit', {
              activeModuleId: refreshedSession?.activeModuleId,
              phase: refreshedSession?.phase,
              mode: refreshedSession?.mode,
              planLength: refreshedSession?.plan?.length
            });
          } catch (resumeError) {
            console.error('Failed to refresh session after quiz submit:', resumeError);
            // If refresh fails, fallback to setting phase manually
            const fallbackPhase = result.passed ? 'feedback' : state.phase === 'quizzing' ? 'learning' : state.phase;
            set(prevState => ({
              phase: fallbackPhase
            }));
          }

          // Refresh user data to sync gems in profile chip
          // This ensures the global user stats (gemsTotal) are updated after quiz completion
          try {
            await useAuthStore.getState().fetchUser();
            console.log('User data refreshed after quiz submit for gems sync');
          } catch (userRefreshError) {
            console.error('Failed to refresh user data after quiz submit:', userRefreshError);
            // Non-critical - gems will sync on next page load
          }

          return result;
        } catch (error) {
          set({ 
            error: error.message, 
            isQuizSubmitting: false 
          });
          throw error;
        }
      },

      resumeSessionFromServer: async (sessionId) => {
        console.log('resumeSessionFromServer called', { sessionId });
        set({ loading: true, error: null });

        try {
          const response = await sessionApi.resumeSession(sessionId);
          if (response.success) {
            console.log('resumeSessionFromServer success', response.data);
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

      /** Start an instructor-published course topic (backend seeds learning-phase session). */
      startCourseTopicSession: async (courseId, topicId) => {
        set({ loading: true, error: null });
        try {
          const response = await courseApi.startCourseTopic(courseId, topicId);
          if (!response.success || !response.data?.sessionId) {
            throw new Error(response.error || 'Failed to start course topic');
          }
          await get().resumeSessionFromServer(response.data.sessionId);
          set({ loading: false });
          return response.data.sessionId;
        } catch (error) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      /** Load older messages (prepend) for display; used when user scrolls to top. */
      loadOlderMessages: async (sessionId) => {
        const state = get();
        const currentMessages = Array.isArray(state.messages) ? state.messages : [];
        const mightHaveMore = state.hasMoreMessages || (currentMessages.length === 20 && state.totalMessageCount == null);
        if (!mightHaveMore || !sessionId) return { hasMore: false };
        set({ loading: true });
        try {
          const response = await sessionApi.getSessionMessagesWithFallback(sessionId, {
            fromEnd: currentMessages.length,
            limit: 20
          });
          if (!response.success || !response.data) {
            set({ loading: false, hasMoreMessages: false });
            return { hasMore: false };
          }
          const { messages: older, hasMore } = response.data;
          const olderWithIds = (older || []).map((m, i) => ({ ...m, id: m.id || m._id || `msg-old-${i}-${m.ts || ''}` }));
          set(prev => ({
            messages: [...olderWithIds, ...(prev.messages || [])],
            hasMoreMessages: !!hasMore,
            totalMessageCount: response.data.totalCount ?? prev.totalMessageCount,
            loading: false
          }));
          return { hasMore: !!hasMore };
        } catch (error) {
          set({ loading: false, hasMoreMessages: false });
          throw error;
        }
      },

      // Utility methods
      clearQuizState: () => {
        set({
          quizDraft: null,
          quizResult: null,
          isQuizSubmitting: false
        });
      },

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
      }),
      // Ensure mode defaults to 'studying' for new users or if mode is invalid
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        // Always default to 'studying' if mode is not set or invalid
        mode: (persistedState?.mode === 'studying' || persistedState?.mode === 'revision') 
          ? persistedState.mode 
          : 'studying'
      })
    }
  )
);

if (process.env.NODE_ENV === 'development') {
  useSessionStore.subscribe((state, previous) => {
    try {
      console.log('sessionStore update', {
        phase: state.phase,
        prevPhase: previous?.phase,
        quizDraftLen: state.quizDraft?.length || 0,
        loading: state.loading,
        sessionId: state.sessionId
      });
    } catch (logError) {
      console.warn('sessionStore logging failed', logError);
    }
  });
}

export default useSessionStore;