/**
 * Profile API client
 */

import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';

const API_PREFIX = `${API_BASE}/v1/profile`;

/**
 * Get user profile
 * @returns {Promise<{profile: Object, preferences: Object, stats: Object}>}
 */
export async function getProfile() {
  const response = await fetch(`${API_PREFIX}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to get profile', data);
    throw new Error(errorMessage);
  }

  return (typeof data === 'object' && data.data) ? data.data : data;
}

/**
 * Update user profile
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<{profile: Object}>}
 */
export async function updateProfile(profileData) {
  const response = await fetch(`${API_PREFIX}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(profileData),
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to update profile', data);
    throw new Error(errorMessage);
  }

  return (typeof data === 'object' && data.data) ? data.data : data;
}

/**
 * Update user preferences
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<{preferences: Object}>}
 */
export async function updatePreferences(preferences) {
  const response = await fetch(`${API_PREFIX}/preferences`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(preferences),
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to update preferences', data);
    throw new Error(errorMessage);
  }

  return (typeof data === 'object' && data.data) ? data.data : data;
}

/**
 * Upload avatar image
 * @param {File} file - Avatar image file
 * @returns {Promise<{avatarUrl: string}>}
 */
export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);

  const token = localStorage.getItem('accessToken');
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  // Don't set Content-Type - let browser set it with boundary for multipart/form-data

  const response = await fetch(`${API_PREFIX}/avatar`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to upload avatar', data);
    throw new Error(errorMessage);
  }

  return (typeof data === 'object' && data.data) ? data.data : data;
}

/**
 * Change user password
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<{message: string}>}
 */
export async function changePassword(currentPassword, newPassword) {
  const response = await fetch(`${API_PREFIX}/password`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to change password', data);
    throw new Error(errorMessage);
  }

  return data;
}

/**
 * Complete onboarding
 * @returns {Promise<{message: string}>}
 */
export async function completeOnboarding() {
  const response = await fetch(`${API_PREFIX}/onboarding/complete`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to complete onboarding', data);
    throw new Error(errorMessage);
  }

  return data;
}

/**
 * Generate certificate for completed course
 * @param {string} sessionId - Session ID
 * @param {string} topic - Course topic
 * @returns {Promise<{certificateId: string, downloadUrl: string}>}
 */
export async function generateCertificate(sessionId, topic) {
  const response = await fetch(`${API_PREFIX}/certificates/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ sessionId, topic }),
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to generate certificate', data);
    throw new Error(errorMessage);
  }

  return (typeof data === 'object' && data.data) ? data.data : data;
}

/**
 * Get all certificates for user
 * @returns {Promise<Array<{certificateId: string, topic: string, issuedAt: string, downloadUrl: string}>>}
 */
export async function getCertificates() {
  const response = await fetch(`${API_PREFIX}/certificates`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    const errorMessage = extractErrorMessage(response, 'Failed to get certificates', data);
    throw new Error(errorMessage);
  }

  return (typeof data === 'object' && data.data) ? data.data : data;
}

/**
 * Download certificate
 * @param {string} certificateId - Certificate ID
 * @returns {Promise<Blob>}
 */
export async function downloadCertificate(certificateId) {
  const response = await fetch(`${API_PREFIX}/certificates/${certificateId}/download`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(errorMessage || 'Failed to download certificate');
  }

  return await response.blob();
}

/**
 * Generate a test certificate for testing purposes
 * Returns a blob that can be downloaded directly
 * @returns {Promise<Blob>}
 */
export async function generateTestCertificate() {
  // Import interceptedFetch dynamically to avoid circular dependencies
  const { interceptedFetch } = await import('./apiInterceptor');
  
  const url = `${API_PREFIX}/certificates/test`;
  console.log('[Test Certificate] Calling URL:', url);
  console.log('[Test Certificate] API_PREFIX:', API_PREFIX);
  console.log('[Test Certificate] API_BASE:', API_BASE);
  
  const response = await interceptedFetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    // For error responses, try to read as JSON first
    let errorData;
    try {
      const text = await response.text();
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = text;
      }
    } catch {
      errorData = null;
    }
    const errorMessage = extractErrorMessage(response, 'Failed to generate test certificate', errorData);
    throw new Error(errorMessage);
  }

  // Return the PDF blob directly
  return await response.blob();
}

