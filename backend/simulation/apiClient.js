'use strict';

const { API_BASE_URL, SIM_TIMEOUT_MS } = require('./config');
const { make } = require('./logger');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(baseMs) {
  return baseMs + Math.floor(Math.random() * baseMs);
}

/**
 * Minimal HTTP client for the public student API. Holds one access token
 * and one refresh cookie per instance so each synthetic student has its
 * own session. Does NOT import from backend/services or backend/models.
 */
class StudentApiClient {
  constructor({ label = 'anon' } = {}) {
    this.base = API_BASE_URL.replace(/\/+$/, '');
    this.accessToken = null;
    this.refreshCookie = null;
    this.log = make(`api:${label}`);
  }

  async _fetchOnce(method, path, { body, headers = {}, auth = true } = {}) {
    const url = `${this.base}${path}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SIM_TIMEOUT_MS);
    try {
      const h = { 'Content-Type': 'application/json', ...headers };
      if (auth && this.accessToken) h.Authorization = `Bearer ${this.accessToken}`;
      if (this.refreshCookie) h.Cookie = this.refreshCookie;

      const res = await fetch(url, {
        method,
        headers: h,
        body: body != null ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });

      const setCookie = res.headers.get('set-cookie');
      if (setCookie && /refreshToken=/.test(setCookie)) {
        const match = setCookie.match(/refreshToken=[^;]+/);
        if (match) this.refreshCookie = match[0];
      }

      const text = await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async request(method, path, opts = {}) {
    const maxAttempts = opts.maxAttempts ?? 4;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await this._fetchOnce(method, path, opts);
        if (res.ok) return res.data;

        if (res.status === 401 && opts.auth !== false && attempt === 1) {
          const refreshed = await this._tryRefresh();
          if (refreshed) continue;
        }
        if (res.status === 429 || res.status === 503) {
          const retryMs = jitter(1500 * attempt);
          this.log.warn(`${method} ${path} → ${res.status}, retry in ${retryMs}ms (${attempt}/${maxAttempts})`);
          await sleep(retryMs);
          continue;
        }

        const err = new Error(
          `HTTP ${res.status} on ${method} ${path}: ${
            typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 200) : String(res.data).slice(0, 200)
          }`,
        );
        err.status = res.status;
        err.body = res.data;
        throw err;
      } catch (e) {
        lastErr = e;
        if (e.status && e.status < 500 && e.status !== 429) throw e;
        if (attempt < maxAttempts) {
          const backoff = jitter(800 * attempt);
          this.log.warn(`${method} ${path} transient error "${e.message}", retry in ${backoff}ms`);
          await sleep(backoff);
        }
      }
    }
    throw lastErr || new Error(`request exhausted retries: ${method} ${path}`);
  }

  async _tryRefresh() {
    if (!this.refreshCookie) return false;
    try {
      const res = await this._fetchOnce('POST', '/auth/refresh', { auth: false });
      if (res.ok && res.data?.data?.accessToken) {
        this.accessToken = res.data.data.accessToken;
        return true;
      }
    } catch {}
    return false;
  }

  // ---- auth ----
  async signup(payload) {
    const res = await this.request('POST', '/auth/signup', { body: payload, auth: false });
    if (res?.data?.accessToken) this.accessToken = res.data.accessToken;
    return res?.data;
  }

  async login({ username, password }) {
    const res = await this.request('POST', '/auth/login', { body: { username, password }, auth: false });
    if (res?.data?.accessToken) this.accessToken = res.data.accessToken;
    return res?.data;
  }

  // ---- profile ----
  async updateProfile(patch) {
    const res = await this.request('PUT', '/profile', { body: patch });
    return res?.data;
  }

  // ---- courses / enrollment ----
  async joinCourse({ accessCode, priorKnowledge }) {
    const res = await this.request('POST', '/courses/join', { body: { accessCode, priorKnowledge } });
    return res?.data;
  }

  async listMyCourses() {
    const res = await this.request('GET', '/courses/mine');
    return res?.data;
  }

  async listTopics(courseId) {
    const res = await this.request('GET', `/courses/${courseId}/topics`);
    return res?.data;
  }

  async startTopic(courseId, topicId) {
    const res = await this.request('POST', `/courses/${courseId}/topics/${topicId}/start`, { body: {} });
    return res?.data;
  }

  // ---- assessment / plan ----
  async triggerAssessment({ sessionId, userMessage }) {
    const res = await this.request('POST', '/assessment', { body: { sessionId, mode: 'studying', userMessage } });
    return res?.data;
  }

  async approveAssessment(sessionId) {
    const res = await this.request('POST', '/assessment/approve', { body: { sessionId } });
    return res?.data;
  }

  // ---- chat turn ----
  async chat({ sessionId, userMessage, mode = 'studying' }) {
    const res = await this.request('POST', '/chat', { body: { sessionId, userMessage, mode } });
    return res?.data;
  }

  // ---- quiz ----
  async startQuiz({ sessionId, moduleId }) {
    const res = await this.request('POST', '/quiz/start', { body: { sessionId, moduleId } });
    return res;
  }

  async submitQuiz({ sessionId, moduleId, answers }) {
    const res = await this.request('POST', '/quiz/submit', { body: { sessionId, moduleId, answers } });
    return res?.data;
  }
}

module.exports = { StudentApiClient, sleep, jitter };
