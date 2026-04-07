import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage, isRateLimited } from './responseUtils';

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

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    if (isRateLimited(response.status, data)) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    const errorMessage = extractErrorMessage(response, 'Assessment failed', data);
    throw new Error(errorMessage);
  }

  return data;
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

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    if (isRateLimited(response.status, data)) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    const errorMessage = extractErrorMessage(response, 'Failed to approve plan', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function modifyPlan({ sessionId, modificationRequest }) {
  const response = await fetch(`${API_BASE}/v1/assessment/modify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      modificationRequest
    }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    if (isRateLimited(response.status, data)) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    const errorMessage = extractErrorMessage(response, 'Failed to modify plan', data);
    throw new Error(errorMessage);
  }

  return data;
}

// Legacy method for backward compatibility (no longer used but kept for reference)
export async function answerClarify(sessionId, answers) {
  const response = await fetch(`${API_BASE}/v1/assessment`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      userMessage: answers, // Send answers as userMessage
      mode: 'studying'
    }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    if (isRateLimited(response.status, data)) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    const errorMessage = extractErrorMessage(response, 'Failed to answer clarification', data);
    throw new Error(errorMessage);
  }

  return data;
}

