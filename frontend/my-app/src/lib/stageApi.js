// API helper functions for stage assessment and progression

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

// Initial assessment for first message
export const assessStage = async (sessionId, userMessage) => {
  const response = await fetch(`${API_BASE}/assessment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      userMessage
    })
  });

  if (!response.ok) {
    throw new Error('Assessment failed');
  }

  return response.json();
};

// Re-assessment based on recent conversation
export const recheckAssessment = async (sessionId) => {
  const response = await fetch(`${API_BASE}/assessment/recheck`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId
    })
  });

  if (!response.ok) {
    throw new Error('Re-assessment failed');
  }

  return response.json();
};

// Start a quiz for current stage
export const startQuiz = async (sessionId, stage) => {
  const response = await fetch(`${API_BASE}/quiz/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      stage
    })
  });

  if (!response.ok) {
    throw new Error('Failed to start quiz');
  }

  return response.json();
};

// Submit quiz answers
export const submitQuiz = async (sessionId, quizId, answers) => {
  const response = await fetch(`${API_BASE}/quiz/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      quizId,
      answers
    })
  });

  if (!response.ok) {
    throw new Error('Failed to submit quiz');
  }

  return response.json();
};

// Promote to next stage after passing quiz
export const promoteStage = async (sessionId) => {
  const response = await fetch(`${API_BASE}/stage/promote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId
    })
  });

  if (!response.ok) {
    throw new Error('Failed to promote stage');
  }

  return response.json();
};

// Get session details
export const getSessionDetails = async (sessionId) => {
  const response = await fetch(`${API_BASE}/session/${sessionId}`);

  if (!response.ok) {
    throw new Error('Failed to get session details');
  }

  return response.json();
};





