/**
 * Streaming API helper functions for real-time chat responses
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * Send a message with streaming response
 * @param {Object} params - Request parameters
 * @param {string} params.message - The user's message
 * @param {number} params.stage - Learning stage (1-4)
 * @param {string} params.sessionId - Session ID for continuity
 * @param {AbortController} params.abortController - For cancellation
 * @param {Function} params.onToken - Callback for each token received
 * @param {Function} params.onComplete - Callback when streaming completes
 * @param {Function} params.onError - Callback for errors
 * @returns {Promise<void>}
 */
export async function sendMessageStream({ 
  message, 
  stage = 1, 
  sessionId, 
  abortController,
  onToken,
  onComplete,
  onError 
}) {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, stage, sessionId }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Streaming failed! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.token) {
                onToken(data.token);
              } else if (data.done) {
                onComplete(data.sessionId, data.final);
                return;
              } else if (data.error) {
                onError(data.error);
                return;
              } else if (data.ping) {
                // Heartbeat - ignore
                continue;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Stream cancelled by user');
    } else {
      onError(error.message || 'Streaming failed');
    }
  }
}





