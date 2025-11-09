// API Retry Utility with Exponential Backoff
// Handles rate limiting and API errors with intelligent retry logic

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry API call with exponential backoff
 * @param {Function} apiCall - Async function that makes the API call
 * @param {Object} options - Retry options
 * @returns {Promise} API response
 */
async function retryWithBackoff(apiCall, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000, // 1 second
    maxDelay = 10000, // 10 seconds
    backoffMultiplier = 2,
    onRetry = null,
    shouldRetry = null
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await apiCall();
      
      // Check if result is valid (not empty)
      if (result && typeof result === 'string' && result.trim().length > 0) {
        return result;
      }
      
      // If result is empty and we have retries left, throw to trigger retry
      if (attempt < maxRetries && (!result || result.trim().length === 0)) {
        if (onRetry) {
          onRetry(attempt + 1, 'Empty response', delay);
        }
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelay);
        // Throw error to trigger retry in outer loop
        throw new Error('EMPTY_RESPONSE');
      }
      
      // If we've exhausted retries and result is still empty, return it
      return result || '';
      
    } catch (error) {
      lastError = error;
      
      // Check for empty response error (special case)
      const isEmptyResponse = error.message === 'EMPTY_RESPONSE';
      
      // Check if we should retry this error
      if (shouldRetry && !isEmptyResponse && !shouldRetry(error)) {
        throw error;
      }
      
      // Check for rate limiting (429)
      const isRateLimit = error.status === 429 || 
                         error.message?.includes('rate_limit') ||
                         error.message?.includes('429');
      
      // Check for server errors (5xx)
      const isServerError = error.status >= 500 && error.status < 600;
      
      // Check for timeout or connection errors
      const isNetworkError = error.code === 'ECONNRESET' || 
                            error.code === 'ETIMEDOUT' ||
                            error.message?.includes('timeout');
      
      // Retry on empty response, rate limit, server errors, or network errors
      if (isEmptyResponse || isRateLimit || isServerError || isNetworkError) {
        if (attempt < maxRetries) {
          if (onRetry) {
            onRetry(attempt + 1, isEmptyResponse ? 'Empty response' : (error.message || 'API error'), delay);
          }
          
          // For rate limits, use longer delay
          if (isRateLimit) {
            delay = Math.max(delay * 2, 2000); // At least 2 seconds for rate limits
          }
          
          await sleep(delay);
          delay = Math.min(delay * backoffMultiplier, maxDelay);
          continue;
        }
      }
      
      // If we've exhausted retries or error is not retryable, throw
      if (attempt >= maxRetries) {
        throw error;
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

module.exports = { retryWithBackoff, sleep };

