import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';
import { interceptedFetch } from './apiInterceptor';

export async function startQuiz({ sessionId, moduleId }) {
  const response = await interceptedFetch(`${API_BASE}/v1/quiz/start`, {
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
  const response = await interceptedFetch(`${API_BASE}/v1/quiz/submit`, {
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

export async function startRevisionQuiz({ sessionId, topic }) {
  const response = await interceptedFetch(`${API_BASE}/v1/quiz/revision`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      topic
    }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    console.error('Revision quiz API error:', {
      status: response.status,
      statusText: response.statusText,
      data: data
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to start revision quiz';
    if (data?.code === 'ILLEGAL_MODE') {
      errorMessage = `Revision quiz requires revision mode. Current mode: ${data.currentMode || 'unknown'}. Please select "Revision" mode first.`;
    } else if (data?.code === 'ILLEGAL_PHASE') {
      errorMessage = `Cannot start revision quiz in current phase: ${data.currentPhase || 'unknown'}`;
    } else if (data?.message) {
      errorMessage = data.message;
    } else {
      errorMessage = extractErrorMessage(response, 'Failed to start revision quiz', data);
    }
    
    throw new Error(errorMessage);
  }

  return data;
}

