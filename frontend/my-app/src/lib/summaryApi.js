/**
 * API helper functions for session summary functionality
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * Generate a summary of a study session
 * @param {string} sessionId - The session ID to summarize
 * @returns {Promise<{sessionId: string, summary: string}>} Summary response
 */
export async function summarizeSession(sessionId) {
  const response = await fetch(`${API_BASE_URL}/session/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Summary failed! status: ${response.status}`);
  }

  return response.json();
}


