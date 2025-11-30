import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';

export async function createSession(profile) {
  const url = `${API_BASE}/v1/sessions`;
  console.log('sessionApi.createSession - Making request to:', url);
  console.log('Payload:', profile || {});
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(profile || {}),
  });

  console.log('sessionApi.createSession - Response status:', response.status);
  console.log('sessionApi.createSession - Response ok:', response.ok);

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    console.error('sessionApi.createSession - Error response:', data);
    const errorMessage = extractErrorMessage(response, 'Failed to create session', data);
    throw new Error(errorMessage);
  }
  console.log('sessionApi.createSession - Success response:', data);
  return data;
}

export async function getSession(sessionId) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to load session', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function resumeSession(sessionId) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to resume session', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function getSessions(limit = 20, options = {}) {
  const { favorites, search, status } = options;
  let url = `${API_BASE}/v1/sessions?limit=${limit}`;
  
  if (favorites) {
    url += '&favorites=true';
  }
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }
  if (status) {
    url += `&status=${encodeURIComponent(status)}`;
  }
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to load sessions', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function searchSessions(query, limit = 20) {
  const response = await fetch(`${API_BASE}/v1/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to search sessions', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function toggleFavorite(sessionId, isFavorite) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}/favorite`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ isFavorite }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to toggle favorite', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function deleteSession(sessionId) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to delete session', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function updateSessionTitle(sessionId, chatTitle) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ chatTitle }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to update session title', data);
    throw new Error(errorMessage);
  }

  return data;
}

// Legacy methods for backward compatibility
export async function updateSessionStage(sessionId, stage) {
  const response = await fetch(`${API_BASE}/session/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stage }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to update session stage', data);
    throw new Error(errorMessage);
  }

  return data;
}

export async function updateSessionNotes(sessionId, notes) {
  const response = await fetch(`${API_BASE}/session/${sessionId}/notes`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
  });

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to update notes', data);
    throw new Error(errorMessage);
  }

  return data;
}