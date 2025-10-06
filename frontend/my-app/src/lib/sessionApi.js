const base = process.env.REACT_APP_API_BASE_URL || '';

export async function getSessions(limit = 20) {
  const response = await fetch(`${base}/sessions?limit=${limit}`, {
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

export async function updateSessionStage(sessionId, stage) {
  const response = await fetch(`${base}/session/${sessionId}`, {
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
  const response = await fetch(`${base}/session/${sessionId}/notes`, {
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


