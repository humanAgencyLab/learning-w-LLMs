import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';

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

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to start quiz', data);
    throw new Error(errorMessage);
  }

  return data;
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

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to submit quiz', data);
    throw new Error(errorMessage);
  }

  return data;
}

