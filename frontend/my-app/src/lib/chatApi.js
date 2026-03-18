import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';
import { interceptedFetch } from './apiInterceptor';

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

export async function sendMessage({ sessionId, userMessage, mode }) {
  const url = `${API_BASE}/v1/chat`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await interceptedFetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ sessionId, userMessage, mode }),
    });
    clearTimeout(timeoutId);
    const data = await safeReadResponse(response);

    if (!response.ok) {
      if (isDev) console.error('chatApi.sendMessage - Error:', data);
      if (response.status === 429 || (typeof data === 'object' && (data.code === 'RATE_LIMITED' || data.code === 'RATE_LIMIT_EXCEEDED'))) {
        throw new Error('API rate limit exceeded. Please try again in a few minutes.');
      }
      const errorMessage = extractErrorMessage(response, 'Failed to send message', data);
      throw new Error(errorMessage);
    }
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout. The server is taking too long to respond. Please try again.');
    }
    throw error;
  }
}

