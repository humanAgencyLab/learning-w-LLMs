'use strict';

/**
 * Loopback HTTP client for simulated students
 * (SIMULATION_FEATURE_PLAN.md Section 3, "The run must go through the real
 * HTTP student path").
 *
 * This is the load-bearing design decision of the feature: the chat logic lives
 * inside a 2,000+ line route handler, not a callable service, and the tutor's
 * behaviour depends on route-level state (milestone advancement, retry counts,
 * outstanding checks, per-request globalInstructions loading, the constraint
 * gate). Re-implementing any of it in-process would test a copy, not the tutor.
 *
 * Shape and retry policy follow backend/simulation/apiClient.js, which already
 * solved this for the CLI cohort harness. Deliberately a separate module rather
 * than a refactor of that file: the harness is a dev CLI with its own dotenv /
 * localhost:3000 / file-logging assumptions, and refactoring it mid-study
 * window would risk a tool the researcher depends on. Divergence risk is
 * bounded because both speak only the public API.
 */
const SIM_TIMEOUT_MS = Number(process.env.SIM_TIMEOUT_MS || 90_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => Math.round(base * (0.75 + Math.random() * 0.5));

/** The server's own base URL. Simulation traffic never leaves the instance. */
function loopbackBaseUrl() {
  if (process.env.SIM_LOOPBACK_BASE_URL) return process.env.SIM_LOOPBACK_BASE_URL;
  const port = process.env.PORT || 5001;
  return `http://127.0.0.1:${port}/v1`;
}

class SimStudentClient {
  constructor({ label = 'sim', baseUrl = null } = {}) {
    this.label = label;
    this.baseUrl = baseUrl || loopbackBaseUrl();
    this.accessToken = null;
    this.credentials = null;
  }

  /**
   * Uses node's core http/https rather than fetch. Loopback traffic must not
   * depend on undici's proxy handling: in a proxied environment global fetch
   * rejects loopback URLs outright ("bad port") even though the server is
   * reachable, and a simulation that cannot talk to its own server is useless.
   * Core http also gives an explicit socket timeout.
   */
  _fetchOnce(method, pathname, { body, auth = true } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${pathname}`);
      const transport = url.protocol === 'https:' ? require('https') : require('http');
      const payload = body !== undefined ? JSON.stringify(body) : null;
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            ...(auth && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { text += c; });
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(text); } catch { /* non-JSON body */ }
            resolve({
              status: res.statusCode,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              json,
              text,
            });
          });
        }
      );
      req.setTimeout(SIM_TIMEOUT_MS, () => req.destroy(new Error(`request timed out after ${SIM_TIMEOUT_MS}ms`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** Retries 429/503/5xx with backoff; refreshes auth once on 401. */
  async request(method, path, opts = {}) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await this._fetchOnce(method, path, opts);
        if (res.status === 401 && this.credentials && attempt < 3) {
          await this.login(this.credentials);
          continue;
        }
        if (res.status === 429 || res.status === 503 || (res.status >= 500 && attempt < 3)) {
          await sleep(jitter(1200 * attempt));
          continue;
        }
        if (!res.ok) {
          const msg = res.json?.error || res.text?.slice(0, 160) || `HTTP ${res.status}`;
          const err = new Error(`${method} ${path} -> ${res.status}: ${msg}`);
          err.status = res.status;
          err.code = res.json?.code;
          throw err;
        }
        return res.json?.data !== undefined ? res.json.data : res.json;
      } catch (e) {
        lastErr = e;
        // Non-retryable client errors surface immediately.
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
        if (attempt === 3) break;
        await sleep(jitter(1000 * attempt));
      }
    }
    throw lastErr || new Error(`${method} ${path} failed`);
  }

  async signup({ username, password, name }) {
    const data = await this.request('POST', '/auth/signup', { body: { username, password, name }, auth: false });
    this.accessToken = data.accessToken;
    this.credentials = { username, password };
    return data.user;
  }

  async login({ username, password }) {
    const data = await this.request('POST', '/auth/login', { body: { username, password }, auth: false });
    this.accessToken = data.accessToken;
    this.credentials = { username, password };
    return data.user;
  }

  joinCourse({ accessCode, priorKnowledge }) {
    return this.request('POST', '/courses/join', { body: { accessCode, priorKnowledge } });
  }

  startTopic(courseId, topicId) {
    return this.request('POST', `/courses/${courseId}/topics/${topicId}/start`, { body: {} });
  }

  /**
   * Non-streaming on purpose. A real student's browser uses the streaming
   * variant; content comes from the same prompt and transport, but error
   * behaviour differs (streaming has no retry). Recorded on the run document as
   * `transport` so analysis can condition on it rather than assume parity
   * (SIMULATION_FEATURE_PLAN.md risk 1, second instance).
   */
  chat({ sessionId, userMessage, mode = 'studying' }) {
    return this.request('POST', '/chat', { body: { sessionId, userMessage, mode, stream: false } });
  }

  startQuiz({ sessionId, moduleId }) {
    return this.request('POST', '/quiz/start', { body: { sessionId, moduleId } });
  }

  submitQuiz({ sessionId, moduleId, answers }) {
    return this.request('POST', '/quiz/submit', { body: { sessionId, moduleId, answers } });
  }
}

module.exports = { SimStudentClient, loopbackBaseUrl, sleep, jitter };
