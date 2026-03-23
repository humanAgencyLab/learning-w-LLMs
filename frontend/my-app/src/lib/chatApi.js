import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';
import { interceptedFetch } from './apiInterceptor';

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

/**
 * Send message with streaming. Calls onChunk for each text chunk, resolves with final data when done.
 * Falls back to non-streaming if server doesn't support it or returns non-stream response.
 *
 * @param {{ sessionId, userMessage, mode, onChunk: (chunk: string) => void }}
 * @returns {Promise<{ data: object }>}
 */
export async function sendMessageStream({ sessionId, userMessage, mode, onChunk }) {
  const url = `${API_BASE}/v1/chat`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await interceptedFetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ sessionId, userMessage, mode, stream: true }),
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('text/event-stream')) {
      const data = await safeReadResponse(response);
      if (!response.ok) throw new Error(extractErrorMessage(response, 'Failed to send message', data));
      return { data: data?.data ?? data };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) throw new Error(payload.error);
            if (payload.chunk && onChunk) onChunk(payload.chunk);
            if (payload.done) finalData = payload;
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      try {
        const payload = JSON.parse(buffer.slice(6));
        if (payload.error) throw new Error(payload.error);
        if (payload.chunk && onChunk) onChunk(payload.chunk);
        if (payload.done) finalData = payload;
      } catch (e) {
        if (e.message && !e.message.includes('JSON')) throw e;
      }
    }

    if (!finalData) throw new Error('Stream ended without done event');
    return { data: finalData };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout. The server is taking too long to respond. Please try again.');
    }
    throw error;
  }
}

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

