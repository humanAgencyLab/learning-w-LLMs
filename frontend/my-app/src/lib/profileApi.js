/**
 * Profile API client
 */

import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';

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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get profile');
  }

  return data.data;
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to update profile');
  }

  return data.data;
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to update preferences');
  }

  return data.data;
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to upload avatar');
  }

  return data.data;
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to complete onboarding');
  }

  return data;
}

