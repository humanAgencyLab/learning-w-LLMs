/**
 * Authentication API client
 */

import { API_BASE } from '../config';

const API_PREFIX = `${API_BASE}/v1/auth`;

/**
 * Get stored access token from localStorage
 */
export function getAccessToken() {
  return localStorage.getItem('accessToken');
}

/**
 * Store access token in localStorage
 */
export function setAccessToken(token) {
  localStorage.setItem('accessToken', token);
}

/**
 * Remove access token from localStorage
 */
export function removeAccessToken() {
  localStorage.removeItem('accessToken');
}

/**
 * Get authorization header with access token
 */
export function getAuthHeaders() {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Sign up a new user
 * @param {Object} credentials - Signup credentials
 * @param {string} credentials.password - User password
 * @param {string} credentials.name - User name
 * @param {string} [credentials.username] - User username (optional if autoGenerateUsername is true)
 * @param {boolean} [credentials.autoGenerateUsername] - Auto-generate username based on name
 * @returns {Promise<{user: Object, accessToken: string}>}
 */
export async function signup({ password, name, username, autoGenerateUsername }) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for refresh token
      body: JSON.stringify({ password, name, username, autoGenerateUsername }),
    });
  } catch (networkError) {
    throw new Error('Network error: Unable to connect to server. Please check your connection.');
  }

  let data;
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server error: ${text.substring(0, 100)}`);
    }
  } catch (parseError) {
    if (parseError.message.startsWith('Server error:')) {
      throw parseError;
    }
    throw new Error('Invalid response from server. Please try again.');
  }

  if (!response.ok) {
    // Handle specific error codes
    if (response.status === 409) {
      if (data.code === 'USERNAME_EXISTS') {
        const error = new Error(data.error || 'Username already taken');
        error.code = 'USERNAME_EXISTS';
        error.status = 409;
        throw error;
      }
    }
    throw new Error(data.error || data.message || 'Signup failed');
  }

  // Store access token
  if (data.data?.accessToken) {
    setAccessToken(data.data.accessToken);
  }

  return data.data;
}

/**
 * Check if username already exists
 * @param {string} username - Username to check
 * @returns {Promise<{exists: boolean}>}
 */
export async function checkUsername(username) {
  let response;
  const url = `${API_PREFIX}/check-username`;
  
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username }),
    });
  } catch (networkError) {
    console.error('Network error checking username:', networkError);
    throw new Error('Network error: Unable to connect to server. Please check your connection.');
  }

  let data;
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error('Non-JSON response from check-username:', text.substring(0, 200));
      throw new Error(`Server error: ${text.substring(0, 100)}`);
    }
  } catch (parseError) {
    if (parseError.message.startsWith('Server error:')) {
      throw parseError;
    }
    console.error('Parse error checking username:', parseError);
    throw new Error('Invalid response from server. Please try again.');
  }

  if (!response.ok) {
    if (response.status === 404) {
      console.error(`404 Error: Route not found at ${url}. Status: ${response.status}`);
      throw new Error('Username check endpoint not found. Please ensure the backend server is running.');
    }
    console.error(`API error checking username:`, data);
    throw new Error(data.error || data.message || `Failed to check username (${response.status})`);
  }

  if (!data || !data.data) {
    console.error('Invalid response structure from check-username:', data);
    throw new Error('Invalid response from server. Please try again.');
  }

  return data.data;
}

/**
 * Log in a user
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.username - User username
 * @param {string} credentials.password - User password
 * @returns {Promise<{user: Object, accessToken: string}>}
 */
export async function login({ username, password }) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for refresh token
      body: JSON.stringify({ username, password }),
    });
  } catch (networkError) {
    throw new Error('Network error: Unable to connect to server. Please check your connection.');
  }

  let data;
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server error: ${text.substring(0, 100)}`);
    }
  } catch (parseError) {
    if (parseError.message.startsWith('Server error:')) {
      throw parseError;
    }
    throw new Error('Invalid response from server. Please try again.');
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Login failed');
  }

  // Store access token
  if (data.data?.accessToken) {
    setAccessToken(data.data.accessToken);
  }

  return data.data;
}

/**
 * Log out the current user
 * @returns {Promise<void>}
 */
export async function logout() {
  const token = getAccessToken();
  
  try {
    await fetch(`${API_PREFIX}/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
  } catch (error) {
    // Continue with logout even if API call fails
    console.error('Logout API error:', error);
  } finally {
    // Always remove token locally
    removeAccessToken();
  }
}

/**
 * Refresh access token using refresh token cookie
 * @returns {Promise<{accessToken: string}>}
 */
export async function refreshToken() {
  const response = await fetch(`${API_PREFIX}/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include refresh token cookie
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Token refresh failed');
  }

  // Store new access token
  if (data.data?.accessToken) {
    setAccessToken(data.data.accessToken);
  }

  return data.data;
}

/**
 * Get current authenticated user info
 * @returns {Promise<{user: Object}>}
 */
export async function getCurrentUser() {
  // Note: Don't use interceptedFetch here to avoid circular dependency
  // This function is called during token refresh, so we handle 401s manually
  const response = await fetch(`${API_PREFIX}/me`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    // Don't treat rate limit errors as auth failures
    if (response.status === 429 || (data.code === 'RATE_LIMITED' || data.code === 'RATE_LIMIT_EXCEEDED')) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    throw new Error(data.error || 'Failed to get user info');
  }

  return data.data.user;
}

/**
 * Request password reset
 * @param {string} username - User username
 * @returns {Promise<{message: string}>}
 */
export async function forgotPassword(username) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });
  } catch (networkError) {
    throw new Error('Network error: Unable to connect to server. Please check your connection.');
  }

  let data;
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server error: ${text.substring(0, 100)}`);
    }
  } catch (parseError) {
    if (parseError.message.startsWith('Server error:')) {
      throw parseError;
    }
    throw new Error('Invalid response from server. Please try again.');
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Password reset request failed');
  }

  return data;
}

/**
 * Reset password using token
 * @param {Object} params - Reset parameters
 * @param {string} params.token - Reset token
 * @param {string} params.password - New password
 * @returns {Promise<{message: string}>}
 */
export async function resetPassword({ token, password }) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, password }),
    });
  } catch (networkError) {
    throw new Error('Network error: Unable to connect to server. Please check your connection.');
  }

  let data;
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server error: ${text.substring(0, 100)}`);
    }
  } catch (parseError) {
    if (parseError.message.startsWith('Server error:')) {
      throw parseError;
    }
    throw new Error('Invalid response from server. Please try again.');
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Password reset failed');
  }

  return data;
}


