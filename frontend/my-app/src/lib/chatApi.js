import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';

export async function sendMessage({ sessionId, userMessage }) {
  const url = `${API_BASE}/v1/chat`;
  console.log('chatApi.sendMessage - Making request to:', url);
  console.log('Payload:', { sessionId, userMessage });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      userMessage
    }),
  });

  console.log('chatApi.sendMessage - Response status:', response.status);
  console.log('chatApi.sendMessage - Response ok:', response.ok);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }));
    console.error('chatApi.sendMessage - Error response:', errorData);
    
    // Check for rate limit
    if (response.status === 503 && errorData.code === 'RATE_LIMIT_EXCEEDED') {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    
    throw new Error(errorData.error || errorData.message || 'Failed to send message');
  }

  const data = await response.json();
  console.log('chatApi.sendMessage - Success response:', data);
  return data;
}

