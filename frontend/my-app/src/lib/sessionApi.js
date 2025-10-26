import { API_BASE } from '../config';

export async function createSession(profile) {
  const response = await fetch(`${API_BASE}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile || {}),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create session');
  }

  return response.json();
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