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

export async function getInstructorChatHistory({ courseId = null } = {}) {
  const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  return parse(
    await fetch(`${API_BASE}/v1/instructor/chat${qs}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function sendInstructorChatMessage({
  message,
  courseId = null,
  studentId = null,
  includeSynthetic = true,
}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ message, courseId, studentId, includeSynthetic }),
    })
  );
}

export async function clearInstructorChatHistory({ courseId = null } = {}) {
  const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  return parse(
    await fetch(`${API_BASE}/v1/instructor/chat${qs}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}
