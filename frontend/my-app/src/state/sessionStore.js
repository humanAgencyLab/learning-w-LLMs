import { create } from 'zustand';

const useSessionStore = create((set, get) => ({
  // State
  sessionId: 'test-session-123',
  phase: 'learning', // 'pre' | 'assessing' | 'learning' | 'quizzing' | 'feedback' | 'completed'
  learningStyle: 'studying', // 'studying' | 'revision' only
  model: 'llama',
  topic: 'React Development',
  chatTitle: '',
  plan: [
    { id: 'm1', title: 'Introduction to React', status: 'complete', points: 20, milestones: [{ text: 'Setup React project', completed: true }] },
    { id: 'm2', title: 'Components and Props', status: 'in_progress', points: 20, milestones: [{ text: 'Create first component', completed: false }] },
    { id: 'm3', title: 'State Management', status: 'locked', points: 0, milestones: [{ text: 'Learn useState hook', completed: false }] },
  ],
  progressPercent: 40,
  points: 40,
  gems: 2,
  hasTrophy: false,
  isViewOnly: false,
  nextAction: null,

  // Actions
  reset: () => set({
    sessionId: null,
    phase: 'pre',
    learningStyle: 'studying',
    model: 'llama',
    topic: '',
    chatTitle: '',
    plan: [],
    progressPercent: 0,
    points: 0,
    gems: 0,
    hasTrophy: false,
    isViewOnly: false,
    nextAction: null,
  }),

  setLearningStyle: (style) => {
    if (style !== 'studying' && style !== 'revision') {
      console.warn('Learning style must be either "studying" or "revision"');
      return;
    }
    set({ learningStyle: style });
  },

  setModel: (model) => set({ model }),

  hydrateFromSession: (sessionSnapshot) => {
    if (!sessionSnapshot) return;
    
    set({
      sessionId: sessionSnapshot.sessionId || null,
      phase: sessionSnapshot.phase || 'pre',
      learningStyle: sessionSnapshot.learningStyle || 'studying',
      model: sessionSnapshot.model || 'llama',
      topic: sessionSnapshot.topic || '',
      chatTitle: sessionSnapshot.chatTitle || '',
      plan: sessionSnapshot.plan || [],
      progressPercent: sessionSnapshot.progressPercent || 0,
      points: sessionSnapshot.points || 0,
      gems: sessionSnapshot.gems || 0,
      hasTrophy: sessionSnapshot.hasTrophy || false,
      isViewOnly: sessionSnapshot.isViewOnly || false,
      nextAction: sessionSnapshot.nextAction || null,
    });
  },

  setPhase: (phase) => {
    const validPhases = ['pre', 'assessing', 'learning', 'quizzing', 'feedback', 'completed'];
    if (!validPhases.includes(phase)) {
      console.warn(`Invalid phase: ${phase}. Must be one of: ${validPhases.join(', ')}`);
      return;
    }
    set({ phase });
  },

  setTopic: (topic) => set({ topic }),
  setChatTitle: (title) => set({ chatTitle: title }),
  setPlan: (plan) => set({ plan: Array.isArray(plan) ? plan : [] }),
  setProgress: (percent) => set({ progressPercent: Math.max(0, Math.min(100, percent)) }),
  setPoints: (points) => set({ 
    points: Math.max(0, points),
    gems: Math.floor(Math.max(0, points) / 20) // Auto-calculate gems
  }),
  setGems: (gems) => set({ gems: Math.max(0, gems) }),
  setHasTrophy: (flag) => set({ hasTrophy: Boolean(flag) }),
  setViewOnly: (flag) => set({ isViewOnly: Boolean(flag) }),
  setNextAction: (action) => set({ nextAction: action }),

  // Computed values
  getLearningStyleDisplayName: () => {
    const style = get().learningStyle;
    return style === 'studying' ? 'Studying' : 'Revision';
  },

  getPhaseDisplayName: () => {
    const phase = get().phase;
    const phaseNames = {
      pre: 'Pre-Assessment',
      assessing: 'Assessing',
      learning: 'Learning',
      quizzing: 'Quizzing',
      feedback: 'Feedback',
      completed: 'Completed',
    };
    return phaseNames[phase] || phase;
  },

  // Utility methods
  isPhase: (phase) => get().phase === phase,
  isLearningStyle: (style) => get().learningStyle === style,
  hasProgress: () => get().progressPercent > 0,
  hasPlan: () => get().plan.length > 0,
  isActive: () => get().sessionId !== null,
}));

export default useSessionStore;
