import { useCallback } from 'react';
import useSessionStore from '../state/sessionStore';

/**
 * Custom hook for easier session management
 * Provides convenient methods and computed values
 */
export const useSession = () => {
  const store = useSessionStore();

  // Convenience methods
  const startNewSession = useCallback(async (profile) => {
    try {
      await store.createSession(profile);
      return true;
    } catch (error) {
      console.error('Failed to start new session:', error);
      return false;
    }
  }, [store]);

  const continueSession = useCallback(async (sessionId) => {
    try {
      await store.resumeSessionFromServer(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to continue session:', error);
      return false;
    }
  }, [store]);

  const sendMessage = useCallback(async (message) => {
    try {
      await store.sendChatMessage(message);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }, [store]);

  const startAssessment = useCallback(async (message, mode = 'studying') => {
    try {
      const response = await store.startAssessment(message, mode);
      return response;
    } catch (error) {
      console.error('Failed to start assessment:', error);
      return null;
    }
  }, [store]);

  const answerClarify = useCallback(async (answers) => {
    try {
      const response = await store.answerClarify(answers);
      return response;
    } catch (error) {
      console.error('Failed to answer clarification:', error);
      return null;
    }
  }, [store]);

  const startQuiz = useCallback(async (moduleId) => {
    try {
      await store.startQuizFromChat(moduleId);
      return true;
    } catch (error) {
      console.error('Failed to start quiz:', error);
      return false;
    }
  }, [store]);

  const submitQuiz = useCallback(async (answers) => {
    try {
      await store.submitQuiz(answers);
      return true;
    } catch (error) {
      console.error('Failed to submit quiz:', error);
      return false;
    }
  }, [store]);

  // Computed values
  const currentModule = store.plan.find(module => module.id === store.activeModuleId);
  const nextModule = store.plan.find(module => {
    const currentIndex = store.plan.findIndex(m => m.id === store.activeModuleId);
    return store.plan[currentIndex + 1]?.id === module.id;
  });
  
  const completedModules = store.plan.filter(module => module.status === 'passed');
  const totalPoints = store.plan.reduce((sum, module) => sum + module.points, 0);
  const earnedPoints = completedModules.reduce((sum, module) => sum + module.points, 0);
  
  const progressPercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const isLastModule = !nextModule;
  const canRetryQuiz = store.isPhase('feedback') && currentModule;
  const canContinue = store.isPhase('feedback') && nextModule;

  return {
    // State
    ...store,
    
    // Convenience methods
    startNewSession,
    continueSession,
    sendMessage,
    startAssessment,
    answerClarify,
    startQuiz,
    submitQuiz,
    
    // Computed values
    currentModule,
    nextModule,
    completedModules,
    totalPoints,
    earnedPoints,
    progressPercentage,
    isLastModule,
    canRetryQuiz,
    canContinue,
    
    // UI helpers
    showProgress: store.hasProgress(),
    showPlan: store.hasPlan(),
    showQuiz: store.isPhase('quizzing'),
    showFeedback: store.isPhase('feedback'),
    showCompletion: store.isCompleted(),
    isDisabled: store.isViewOnly || store.isPhase('quizzing'),
  };
};

export default useSession;

