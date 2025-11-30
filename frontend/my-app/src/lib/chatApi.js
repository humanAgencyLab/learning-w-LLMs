import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';

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

  const data = await safeReadResponse(response);
  
  if (!response.ok) {
    console.error('chatApi.sendMessage - Error response:', data);
    
    // Check for rate limit (429 or RATE_LIMITED code)
    if (response.status === 429 || (typeof data === 'object' && (data.code === 'RATE_LIMITED' || data.code === 'RATE_LIMIT_EXCEEDED'))) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    
    const errorMessage = extractErrorMessage(response, 'Failed to send message', data);
    throw new Error(errorMessage);
  }
  console.log('chatApi.sendMessage - Success response:', data);
  return data;
}

