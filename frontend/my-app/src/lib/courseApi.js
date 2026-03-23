import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';

/**
 * Join a course by access code (student).
 */
export async function joinCourse({ accessCode, priorKnowledge }) {
  const response = await fetch(`${API_BASE}/v1/courses/join`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ accessCode, priorKnowledge }),
  });
  const data = await safeReadResponse(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(response, 'Failed to join course', data));
  }
  return data;
}

export async function listMyCourses() {
  const response = await fetch(`${API_BASE}/v1/courses/mine`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await safeReadResponse(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(response, 'Failed to list courses', data));
  }
  return data;
}

export async function listPublishedTopics(courseId) {
  const response = await fetch(`${API_BASE}/v1/courses/${courseId}/topics`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await safeReadResponse(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(response, 'Failed to list topics', data));
  }
  return data;
}

/**
 * Start a published topic; returns { sessionId, phase, activeModuleId }.
 */
export async function startCourseTopic(courseId, topicId) {
  const response = await fetch(`${API_BASE}/v1/courses/${courseId}/topics/${topicId}/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const data = await safeReadResponse(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(response, 'Failed to start topic', data));
  }
  return data;
}
