import { create } from 'zustand';

const initial = { 
  sessionId: null, 
  phase: 'pre', 
  learningStyle: 'studying', 
  model: 'llama', 
  topic: null, 
  chatTitle: '', 
  plan: null, 
  progressPercent: 0, 
  points: 0, 
  gems: 0, 
  isViewOnly: false, 
  nextAction: 'start_assessment', 
  messages: [] 
};

    const useSessionStore = create((set, get) => ({
      // State
      sessionId: null,
      phase: 'pre', // 'pre' | 'assessing' | 'learning' | 'quizzing' | 'feedback' | 'completed'
      learningStyle: 'studying', // 'studying' | 'revision' only
      model: 'llama',
      topic: null,
      chatTitle: '',
      plan: null,
      progressPercent: 0,
      points: 0,
      gems: 0,
      hasTrophy: false,
      isViewOnly: false,
      nextAction: 'start_assessment',

  // Actions
  reset: () => {
    localStorage.removeItem('sessionId');
    set({ ...initial });
  },

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

  // AI/System controlled milestone completion
  completeModuleMilestone: (moduleIndex, milestoneIndex) => {
    const currentPlan = get().plan;
    if (currentPlan && currentPlan[moduleIndex] && currentPlan[moduleIndex].milestones[milestoneIndex]) {
      const updatedPlan = [...currentPlan];
      updatedPlan[moduleIndex].milestones[milestoneIndex].completed = true;
      
      // Calculate new progress
      const totalMilestones = updatedPlan.reduce((sum, module) => sum + module.milestones.length, 0);
      const completedMilestones = updatedPlan.reduce((sum, module) => 
        sum + module.milestones.filter(m => m.completed).length, 0);
      const newProgress = Math.round((completedMilestones / totalMilestones) * 100);
      
      // Calculate new points (5 points per milestone)
      const newPoints = completedMilestones * 5;
      
      set({ 
        plan: updatedPlan, 
        progressPercent: newProgress,
        points: newPoints,
        gems: Math.floor(newPoints / 20)
      });
    }
  },

  // Debug/Testing methods
  setDummyData: () => {
    const dummyPlan = [
      {
        id: 'module-0',
        title: 'Setup',
        points: 20,
        milestones: [
          { text: 'Install python', completed: true },
          { text: 'Basic syntax', completed: false },
          { text: 'Control structure', completed: false },
        ]
      },
      {
        id: 'module-1', 
        title: 'Data Structures',
        points: 20,
        milestones: [
          { text: 'Lists and tuples', completed: false },
          { text: 'Dictionaries and sets', completed: false },
          { text: 'Working with data', completed: false },
        ]
      },
      {
        id: 'module-2',
        title: 'File Input/Output',
        points: 20,
        milestones: [
          { text: 'Reading files', completed: false },
          { text: 'Writing files', completed: false },
          { text: 'File handling', completed: false },
        ]
      },
      {
        id: 'module-3',
        title: 'Functions & Modules',
        points: 20,
        milestones: [
          { text: 'Function definition', completed: false },
          { text: 'Function parameters', completed: false },
          { text: 'Module imports', completed: false },
        ]
      },
      {
        id: 'module-4',
        title: 'Advanced Topics',
        points: 20,
        milestones: [
          { text: 'Object-oriented programming', completed: false },
          { text: 'Error handling', completed: false },
          { text: 'Testing and debugging', completed: false },
        ]
      }
    ];

    set({
      sessionId: 'dummy-session-123',
      phase: 'learning',
      topic: 'Python Basic',
      chatTitle: 'Learning Python Fundamentals',
      plan: dummyPlan,
      progressPercent: 7, // 1 out of 15 milestones completed
      points: 5, // 1 milestone * 5 points
      gems: 0,
      isViewOnly: false,
    });
  },
}));

export default useSessionStore;
