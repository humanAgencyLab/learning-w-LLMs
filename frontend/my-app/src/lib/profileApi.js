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
 * Update user email
 * @param {string} email - New email address
 * @returns {Promise<{email: string}>}
 */
export async function updateEmail(email) {
  const response = await fetch(`${API_PREFIX}/email`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ email }),
  });

  const data = await safeReadResponse(response);

  if (!response.ok) {
    // Check if this is an email already exists error
    const isEmailExists = response.status === 409 || 
                         (typeof data === 'object' && data.code === 'EMAIL_EXISTS');
    
    const errorMessage = extractErrorMessage(response, 'Failed to update email', data);
    const error = new Error(errorMessage);
    
    // Attach metadata to error for easier detection
    if (isEmailExists) {
      error.code = 'EMAIL_EXISTS';
      error.status = 409;
    }
    
    throw error;
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

