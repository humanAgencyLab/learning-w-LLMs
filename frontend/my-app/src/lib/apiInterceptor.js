/**
 * Centralized API interceptor for handling authentication errors
 * Automatically refreshes tokens on 401 errors and shows appropriate toasts
 */

import { getAuthHeaders, refreshToken as refreshAccessToken, removeAccessToken } from './authApi';
import { toastBus } from '../components/ui/toast';

let isRefreshing = false;
let refreshPromise = null;

/**
 * Intercept fetch requests and handle 401 errors automatically
 * @param {string} url - Request URL
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export async function interceptedFetch(url, options = {}) {
  // Make initial request
  let response = await fetch(url, options);

  // If we get a 401, try to refresh the token
  if (response.status === 401) {
    // Clone response to read body without consuming it
    // Check content-type first - only try to parse JSON if it's actually JSON
    const contentType = response.headers.get('content-type') || '';
    const clonedResponse = response.clone();
    let data = {};
    
    if (contentType.includes('application/json')) {
      data = await clonedResponse.json().catch(() => ({}));
    } else {
      // For non-JSON responses (like PDFs), just check status code
      data = {};
    }
    
    // Check if it's actually a token expiration issue
    const isTokenError = data.code === 'INVALID_TOKEN' || 
                        data.code === 'AUTH_REQUIRED' ||
                        data.error?.toLowerCase().includes('token') ||
                        data.error?.toLowerCase().includes('expired') ||
                        data.error?.toLowerCase().includes('invalid');

    if (isTokenError) {
      // Show toast notification
      toastBus.publish({
        message: 'Token expired. Refreshing...',
        type: 'warning',
        duration: 2000
      });

      // Try to refresh token (only once at a time)
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken()
          .then(({ accessToken }) => {
            // Update token in localStorage
            if (accessToken) {
              localStorage.setItem('accessToken', accessToken);
            }
            return accessToken;
          })
          .catch((error) => {
            // Refresh failed - logout user
            console.error('Token refresh failed:', error);
            removeAccessToken();
            toastBus.publish({
              message: 'Session expired. Please log in again.',
              type: 'warning',
              duration: 5000
            });
            
            // Clear auth state and redirect to login
            setTimeout(() => {
              window.location.href = '/signin';
            }, 2000);
            
            throw error;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }

      // Wait for token refresh (error handling is done in the promise catch above)
      await refreshPromise;
      
      // Retry original request with new token
      const newHeaders = {
        ...options.headers,
        ...getAuthHeaders()
      };
      
      response = await fetch(url, {
        ...options,
        headers: newHeaders
      });

      // If retry still fails with 401, logout
      if (response.status === 401) {
        removeAccessToken();
        toastBus.publish({
          message: 'Session expired. Please log in again.',
          type: 'warning',
          duration: 5000
        });
        
        setTimeout(() => {
          window.location.href = '/signin';
        }, 2000);
      }
      // Don't show success toast - automatic refresh should be seamless
    }
    // If not a token error, return the original 401 response
  }

  return response;
}

/**
 * Check if we're currently refreshing the token
 */
export function isTokenRefreshing() {
  return isRefreshing;
}

