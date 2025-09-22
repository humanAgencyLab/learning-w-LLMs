/**
 * API helper functions for communicating with the backend
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * Send a message to the AI tutor
 * @param {Object} params - Message parameters
 * @param {string} params.message - The user's message
 * @param {number} [params.stage=1] - Learning stage (1-4)
 * @param {string} [params.sessionId] - Session ID for conversation continuity
 * @returns {Promise<{sessionId: string, reply: string}>} Response from the AI tutor
 */
export async function sendMessage({ message, stage = 1, sessionId }) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, stage, sessionId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Get health status of the backend
 * @returns {Promise<{ok: boolean}>} Health status
 */
export async function getHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  
  if (!response.ok) {
    throw new Error(`Health check failed! status: ${response.status}`);
  }

  return response.json();
}
