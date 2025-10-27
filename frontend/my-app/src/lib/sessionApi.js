import { API_BASE } from '../config';

export async function createSession(profile) {
  const url = `${API_BASE}/v1/sessions`;
  console.log('sessionApi.createSession - Making request to:', url);
  console.log('Payload:', profile || {});
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile || {}),
  });

  console.log('sessionApi.createSession - Response status:', response.status);
  console.log('sessionApi.createSession - Response ok:', response.ok);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }));
    console.error('sessionApi.createSession - Error response:', errorData);
    throw new Error(errorData.error || errorData.message || 'Failed to create session');
  }

  const data = await response.json();
  console.log('sessionApi.createSession - Success response:', data);
  return data;
}

export async function getSession(sessionId) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to load session');
  }

  return response.json();
}

export async function resumeSession(sessionId) {
  const response = await fetch(`${API_BASE}/v1/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to resume session');
  }

  return response.json();
}

export async function getSessions(limit = 20) {
  const response = await fetch(`${API_BASE}/v1/sessions?limit=${limit}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to load sessions');
  }

  return response.json();
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

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update session stage');
  }

  return response.json();
}

export async function updateSessionNotes(sessionId, notes) {
  const response = await fetch(`${API_BASE}/session/${sessionId}/notes`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update notes');
  }

  return response.json();
}