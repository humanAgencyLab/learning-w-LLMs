const base = process.env.REACT_APP_API_BASE_URL || '';

export async function assessStage(message, topic = 'General Learning', historySessionId = null) {
  const response = await fetch(`${base}/assess`, {
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
  const response = await fetch(`${base}/session/${sessionId}`, {
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

export async function startQuiz(sessionId, stage) {
  const response = await fetch(`${base}/quiz/start`, {
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
  const response = await fetch(`${base}/quiz/submit`, {
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




