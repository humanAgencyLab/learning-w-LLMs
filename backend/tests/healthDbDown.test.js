/**
 * /v1/health must report the database honestly IN ITS STATUS CODE.
 *
 * On 2026-08-13 an instance lost its Mongo connection. server.js had no
 * reconnect path, so every login returned 500 for ~15 minutes across all 14
 * participant accounts — and Cloud Run never replaced the instance, because
 * health returned 200. The body said dbConnected:false the whole time; nothing
 * machine-readable was reading it.
 *
 * The status code is the contract the platform acts on, so that is what these
 * tests pin.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

// readyState is a getter on the connection; override it per-test to simulate
// each state without needing a real server to go down.
const setReadyState = (value) => {
  Object.defineProperty(mongoose.connection, 'readyState', {
    value, configurable: true, writable: true,
  });
};

describe('/v1/health reflects database state in its status code', () => {
  let original;

  beforeAll(() => {
    original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(mongoose.connection), 'readyState'
    );
  });

  afterAll(() => {
    if (original) Object.defineProperty(mongoose.connection, 'readyState', original);
  });

  it('returns 200 when the database is connected', async () => {
    setReadyState(1); // connected
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.dbConnected).toBe(true);
    expect(res.body.status).toBe('healthy');
  });

  // 0 = disconnected, 2 = connecting, 3 = disconnecting. None can serve a query.
  it.each([[0, 'disconnected'], [2, 'connecting'], [3, 'disconnecting']])(
    'returns 503 when readyState is %i (%s)',
    async (state) => {
      setReadyState(state);
      const res = await request(app).get('/v1/health');
      expect(res.status).toBe(503);
      expect(res.body.dbConnected).toBe(false);
      expect(res.body.status).toBe('degraded');
    }
  );

  it('still returns a full diagnostic body on 503, not a bare error', async () => {
    // The moderator reads this body to tell a dead instance from a cold one.
    setReadyState(0);
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(503);
    for (const k of ['status', 'dbConnected', 'timestamp', 'uptimeSec', 'startedAt', 'nodeVersion', 'memory']) {
      expect(res.body).toHaveProperty(k);
    }
  });

  it('recovers to 200 without a restart once the connection returns', async () => {
    setReadyState(0);
    expect((await request(app).get('/v1/health')).status).toBe(503);
    setReadyState(1);
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.dbConnected).toBe(true);
  });
});

describe('server.js recovers a dropped connection', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  it('listens for disconnection rather than connecting once and hoping', () => {
    expect(src).toMatch(/connection\.on\('disconnected'/);
    expect(src).toMatch(/connection\.on\('error'/);
    expect(src).toMatch(/scheduleReconnect/);
  });

  it('retries with backoff instead of hammering, and never gives up', () => {
    const fn = src.slice(src.indexOf('const scheduleReconnect'), src.indexOf('mongoose.connection.on(\'disconnected\''));
    expect(fn).toMatch(/Math\.min\(30000/);      // capped delay
    expect(fn).toMatch(/2 \*\* Math\.min/);       // exponential
    expect(fn).not.toMatch(/maxAttempts|giveUp/); // a session may be live
  });

  it('schedules a reconnect when the FIRST connect fails, not just on a later drop', () => {
    // The original bug: an instance that never connected stayed broken forever.
    const tail = src.slice(src.indexOf('.catch((error)'));
    expect(tail).toMatch(/scheduleReconnect\('initial connect failed'\)/);
  });

  it('keeps command buffering on so a blip queues rather than throws', () => {
    expect(src).toMatch(/mongoose\.set\('bufferCommands', true\)/);
    expect(src).toMatch(/serverSelectionTimeoutMS/);
  });

  it('does not exit the process on a database failure', () => {
    // The HTTP server must stay up so the platform can read the 503.
    const tail = src.slice(src.indexOf('.catch((error)'), src.indexOf('// Check for Groq API key'));
    expect(tail).not.toMatch(/process\.exit/);
  });
});
