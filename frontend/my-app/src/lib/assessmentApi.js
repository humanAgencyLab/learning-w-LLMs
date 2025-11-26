import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';

export async function assess({ sessionId, userMessage, mode, profile }) {
  const response = await fetch(`${API_BASE}/v1/assessment`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      userMessage,
      mode,
      profile
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    // Check for rate limit
    if (response.status === 503 && errorData.code === 'RATE_LIMIT_EXCEEDED') {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    
    throw new Error(errorData.error || errorData.message || 'Assessment failed');
  }

  return response.json();
}

export async function approvePlan({ sessionId }) {
  const response = await fetch(`${API_BASE}/v1/assessment/approve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    // Check for rate limit
    if (response.status === 503 && errorData.code === 'RATE_LIMIT_EXCEEDED') {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    
    throw new Error(errorData.error || errorData.message || 'Failed to approve plan');
  }

  return response.json();
}

export async function modifyPlan({ sessionId, modificationRequest }) {
  const response = await fetch(`${API_BASE}/v1/assessment/modify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      modificationRequest
    }),
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (parseError) {
      // If JSON parsing fails, read as text
      const textError = await response.text();
      throw new Error(textError || 'Failed to modify plan');
    }
    
    // Check for rate limit
    if (response.status === 503 && errorData.code === 'RATE_LIMIT_EXCEEDED') {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    
    throw new Error(errorData.error || errorData.message || 'Failed to modify plan');
  }

  return response.json();
}

// Legacy method for backward compatibility (no longer used but kept for reference)
export async function answerClarify(sessionId, answers) {
  const response = await fetch(`${API_BASE}/v1/assessment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      userMessage: answers, // Send answers as userMessage
      mode: 'studying'
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    // Check for rate limit
    if (response.status === 503 && errorData.code === 'RATE_LIMIT_EXCEEDED') {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    
    throw new Error(errorData.error || errorData.message || 'Failed to answer clarification');
  }

  return response.json();
}

// Legacy methods for backward compatibility
export async function assessStage(
  message,
  topic = 'General Learning',
  historySessionId = null,
) {
  const response = await fetch(`${API_BASE}/assess`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, topic, historySessionId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Assessment failed');
  }

  return response.json();
}

export async function getSessionDetails(sessionId) {
  const response = await fetch(`${API_BASE}/session/${sessionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to load session details');
  }

  return response.json();
}

export async function updateSessionStage(sessionId, stage) {
  const response = await fetch(`${API_BASE}/session/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stage }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update session stage');
  }

  return response.json();
}

export async function startQuiz(sessionId, stage) {
  const response = await fetch(`${API_BASE}/quiz/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, stage }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to start quiz');
  }

  return response.json();
}

export async function submitQuiz(quizId, sessionId, answers) {
  const response = await fetch(`${API_BASE}/quiz/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quizId, sessionId, answers }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to submit quiz');
  }

  return response.json();
}