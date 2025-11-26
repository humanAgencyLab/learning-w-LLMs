import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';

export async function startQuiz({ sessionId, moduleId }) {
  const response = await fetch(`${API_BASE}/v1/quiz/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      moduleId
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to start quiz');
  }

  return response.json();
}

export async function submitQuiz({ sessionId, moduleId, answers }) {
  const response = await fetch(`${API_BASE}/v1/quiz/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      moduleId,
      answers
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to submit quiz');
  }

  return response.json();
}

