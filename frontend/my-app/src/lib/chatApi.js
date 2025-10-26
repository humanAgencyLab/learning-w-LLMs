import { API_BASE } from '../config';

export async function sendMessage({ sessionId, userMessage }) {
  const response = await fetch(`${API_BASE}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      userMessage
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to send message');
  }

  return response.json();
}

