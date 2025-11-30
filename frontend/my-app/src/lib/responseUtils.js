/**
 * Utility functions for safely handling fetch responses
 */

/**
 * Safely read a response as JSON, with fallback to text if JSON parsing fails
 * @param {Response} response - The fetch response object
 * @returns {Promise<Object|string>} - Parsed JSON object or text string
 */
export async function safeReadResponse(response) {
  // Read as text first to avoid "body stream already read" errors
  const text = await response.text();
  
  // Try to parse as JSON
  try {
    return JSON.parse(text);
  } catch (parseError) {
    // If JSON parsing fails, return the text
    return text;
  }
}

/**
 * Safely extract error message from response data
 * @param {Response} response - The fetch response object (for status if needed)
 * @param {string} defaultMessage - Default error message if extraction fails
 * @param {Object|string} data - The already-parsed response data (optional)
 * @returns {string} - Error message string
 */
export function extractErrorMessage(response, defaultMessage = 'Request failed', data = null) {
  // If data is provided, use it; otherwise this function should be called after safeReadResponse
  const responseData = data !== null ? data : null;
  
  if (responseData === null) {
    return defaultMessage;
  }
  
  // If data is a string, use it directly
  if (typeof responseData === 'string') {
    return responseData || defaultMessage;
  }
  
  // If data is an object, try to extract error message
  if (responseData && typeof responseData === 'object') {
    return responseData.error || responseData.message || responseData.errorMessage || defaultMessage;
  }
  
  return defaultMessage;
}

/**
 * Check if response is rate limited
 * @param {number} status - The response status code
 * @param {Object|string} data - The parsed response data
 * @returns {boolean} - True if rate limited
 */
export function isRateLimited(status, data) {
  // Check for 429 status code (standard rate limit status)
  if (status === 429) {
    return true;
  }
  
  // Also check for rate limit code in response (backward compatibility)
  if (status === 503 && typeof data === 'object' && data.code === 'RATE_LIMIT_EXCEEDED') {
    return true;
  }
  
  // Check for RATE_LIMITED code
  if (typeof data === 'object' && (data.code === 'RATE_LIMITED' || data.code === 'RATE_LIMIT_EXCEEDED')) {
    return true;
  }
  
  return false;
}

