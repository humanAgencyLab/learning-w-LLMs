import { API_BASE } from '../config';

// Pre-assessment API
export const runPreAssessment = async (topic, message, sessionId = null) => {
  try {
    const response = await fetch(`${API_BASE}/preassessment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        message,
        sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Pre-assessment error:', error);
    throw error;
  }
};

// Generate learning plan
export const generateLearningPlan = async (
  sessionId,
  learningGoal,
  priorKnowledge,
  learningStyle,
) => {
  try {
    const response = await fetch(`${API_BASE}/learning-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        learningGoal,
        priorKnowledge,
        learningStyle,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Learning plan generation error:', error);
    throw error;
  }
};

// Get learning plan
export const getLearningPlan = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE}/plan/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get learning plan error:', error);
    throw error;
  }
};

// Update module status
export const updateModuleStatus = async (
  sessionId,
  moduleId,
  status,
  progress = null,
  quizScore = null,
) => {
  try {
    const response = await fetch(`${API_BASE}/session/${sessionId}/module`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        moduleId,
        status,
        progress,
        quizScore,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Module update error:', error);
    throw error;
  }
};

// Start module quiz
export const startModuleQuiz = async (sessionId, moduleId = null) => {
  try {
    const response = await fetch(`${API_BASE}/quiz/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        moduleId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Start module quiz error:', error);
    throw error;
  }
};
