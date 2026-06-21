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

export async function deleteCourse(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

const MAX_COURSE_FILES = 10;
const MAX_COURSE_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Batch upload: files + parallel roles ['syllabus'|'reference'] (default: first syllabus, rest reference). */
export async function uploadCourseSources(courseId, files, roles) {
  if (!files?.length) throw new Error('Select at least one file');
  if (files.length > MAX_COURSE_FILES) {
    throw new Error(`At most ${MAX_COURSE_FILES} files per upload`);
  }
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  if (total > MAX_COURSE_UPLOAD_BYTES) {
    throw new Error('Total size must be 15MB or less');
  }
  const token = localStorage.getItem('accessToken');
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const r = roles && roles.length === files.length ? roles : null;
  form.append('roles', JSON.stringify(r || []));
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

/** Single-file upload (first file = syllabus unless roles provided). */
export async function uploadCourseSource(courseId, file, role = 'syllabus') {
  return uploadCourseSources(courseId, [file], [role]);
}

export async function deleteCourseSource(courseId, sourceId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/sources/${sourceId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function updateCourseSourceRole(courseId, sourceId, role) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/sources/${sourceId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ role }),
    })
  );
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

export async function generateTopicPlan(courseId, message, topicCount) {
  const payload = {};
  if (message) payload.message = message;
  if (topicCount != null && topicCount !== '') payload.topicCount = Number(topicCount);
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topic-plan/generate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })
  );
}

export async function modifyTopicPlan(courseId, message, topicCount) {
  const payload = { message };
  if (topicCount != null && topicCount !== '') payload.topicCount = Number(topicCount);
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topic-plan/modify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })
  );
}

export async function getTopicPlanChat(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topic-plan/chat`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function aiModifyTopic(courseId, topicId, message) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/topics/${topicId}/ai-modify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ message }),
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

export async function getCoursePerformanceSummary(courseId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/analytics/performance`, {
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

export async function getStudentDetail(courseId, studentId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/students/${studentId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

// Risk Insights v2 — per-student risk trend (5 weekly snapshots over 28 days).
export async function getRiskTrend(courseId, studentId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/students/${studentId}/risk-trend`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

// Risk Insights v2 — set the Class Context override.
// classContext: 'doing_well_in_class' | 'confirmed_at_risk' | null
export async function updateClassContext(courseId, studentId, classContext) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/students/${studentId}/class-context`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ classContext }),
    })
  );
}

export async function getInstructorSession(courseId, sessionId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/sessions/${sessionId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getInstructorSessionMessages(courseId, sessionId, { fromEnd = 0, limit = 20 } = {}) {
  const params = new URLSearchParams();
  params.set('fromEnd', String(fromEnd));
  params.set('limit', String(limit));
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/sessions/${sessionId}/messages?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getInstructorSessionQuizzes(courseId, sessionId) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/sessions/${sessionId}/quizzes`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getStudentNotes(courseId, studentId, { courseTopicId = null } = {}) {
  const params = new URLSearchParams();
  if (courseTopicId) params.set('courseTopicId', String(courseTopicId));
  const qs = params.toString();
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/students/${studentId}/notes${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function upsertStudentNotes(courseId, studentId, { courseTopicId = null, tags = [], note = '' } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/students/${studentId}/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ courseTopicId, tags, note }),
    })
  );
}

function buildSyntheticQS(includeSynthetic) {
  return includeSynthetic ? `?includeSynthetic=1` : '';
}

export async function getCourseTree(courseId, { includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/tree${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getMilestoneStats(courseId, { includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/milestones${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getAtRiskStudents(courseId, { includeSynthetic = false, passRateThreshold } = {}) {
  const params = new URLSearchParams();
  if (includeSynthetic) params.set('includeSynthetic', '1');
  if (passRateThreshold != null) params.set('passRateThreshold', String(passRateThreshold));
  const qs = params.toString();
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/at-risk${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getTopicStudentHeatmap(courseId, { includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/heatmap${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

// Risk Insights v2 — re-scored distribution for the topic / snapshot filters.
// opts: { includeSynthetic, topicId, upToTopic }
export async function getRiskDistribution(courseId, { includeSynthetic = false, topicId = null, upToTopic = null } = {}) {
  const params = new URLSearchParams();
  if (includeSynthetic) params.set('includeSynthetic', '1');
  if (topicId) params.set('topicId', String(topicId));
  if (topicId == null && upToTopic != null) params.set('upToTopic', String(upToTopic));
  const qs = params.toString();
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/risk-distribution${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

export async function getInstructorOverview({ includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/overview${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

/** Dashboard hero — 2–3 sentence agent-generated briefing + the raw overview. */
export async function getBriefing({ includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/briefing${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

/** Course page — one-sentence "hot signal" about the course's most pressing issue. */
export async function getHotSignal(courseId, { includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/hot-signal${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}

/** Insights page — 3–5 narrative cards, each keyed to an existing chart. */
export async function getInsightCards(courseId, { includeSynthetic = false } = {}) {
  return parse(
    await fetch(`${API_BASE}/v1/instructor/courses/${courseId}/insight-cards${buildSyntheticQS(includeSynthetic)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
  );
}
