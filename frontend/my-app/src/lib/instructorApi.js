import { API_BASE } from '../config';
import { getAuthHeaders } from './authApi';
import { safeReadResponse, extractErrorMessage } from './responseUtils';

async function parse(response) {
  const data = await safeReadResponse(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(response, 'Request failed', data));
  }
  return data;
}

export async function listInstructorCourses() {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function createCourse(body) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    })
  );
}

export async function getCourse(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function updateCourse(courseId, body) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    })
  );
}

export async function archiveCourse(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/archive`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function uploadCourseSource(courseId, file) {
  const token = localStorage.getItem('accessToken');
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/sources`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: form,
  });
  return parse(response);
}

export async function listTopics(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function createTopic(courseId, body) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    })
  );
}

export async function getTopic(courseId, topicId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function updateTopic(courseId, topicId, body) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    })
  );
}

export async function deleteTopic(courseId, topicId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function approveTopic(courseId, topicId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function publishTopic(courseId, topicId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}/publish`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function unpublishTopic(courseId, topicId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}/unpublish`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function generateTopics(courseId, topicCount) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/generate-topics`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(topicCount != null ? { topicCount } : {}),
    })
  );
}

export async function getCourseAnalytics(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/analytics`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getCourseInsights(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/insights`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getStudentProgress(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/students`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}
