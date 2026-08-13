const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

/**
 * These assertions used to demand 200 while ALLOWING status 'degraded'. That
 * combination is what let a database-less instance look healthy to Cloud Run
 * during the 2026-08-13 outage. The contract is now: 200 iff the database is
 * connected, 503 otherwise — so the expected code is derived from the live
 * readyState rather than hard-coded.
 */
const expectedHealthCode = () => (mongoose.connection.readyState === 1 ? 200 : 503);

describe('Health Endpoints', () => {
  describe('GET /v1/health', () => {
    it('should return health status with required fields', async () => {
      const response = await request(app)
        .get('/v1/health')
        .expect(expectedHealthCode());

      expect(['healthy', 'degraded']).toContain(response.body.status);
      // status string and status code must agree
      expect(response.body.status === 'healthy').toBe(response.status === 200);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptimeSec');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('buildSha');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('nodeVersion');
      expect(response.body).toHaveProperty('memory');
      
      // Verify memory object structure
      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.memory).toHaveProperty('external');
      
      // Verify types
      expect(typeof response.body.uptimeSec).toBe('number');
      expect(typeof response.body.memory.used).toBe('number');
      expect(typeof response.body.memory.total).toBe('number');
      expect(typeof response.body.memory.external).toBe('number');
    });

    it('should return valid timestamp format', async () => {
      const response = await request(app)
        .get('/v1/health')
        .expect(expectedHealthCode());

      // Verify timestamp is valid ISO string
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
      expect(new Date(response.body.startedAt).toISOString()).toBe(response.body.startedAt);
    });

    it('should return non-negative uptime', async () => {
      const response = await request(app)
        .get('/v1/health')
        .expect(expectedHealthCode());

      expect(response.body.uptimeSec).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /v1/metrics', () => {
    it('should return Prometheus format metrics', async () => {
      const response = await request(app)
        .get('/v1/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['content-type']).toContain('version=0.0.4');

      const metrics = response.text;
      
      // Verify Prometheus format
      expect(metrics).toContain('# HELP app_uptime_seconds');
      expect(metrics).toContain('# TYPE app_uptime_seconds counter');
      expect(metrics).toContain('app_uptime_seconds');
      
      expect(metrics).toContain('# HELP app_memory_used_bytes');
      expect(metrics).toContain('# TYPE app_memory_used_bytes gauge');
      expect(metrics).toContain('app_memory_used_bytes');
      
      expect(metrics).toContain('# HELP app_memory_total_bytes');
      expect(metrics).toContain('# TYPE app_memory_total_bytes gauge');
      expect(metrics).toContain('app_memory_total_bytes');
      
      expect(metrics).toContain('# HELP app_version_info');
      expect(metrics).toContain('# TYPE app_version_info gauge');
      expect(metrics).toContain('app_version_info');
    });

    it('should contain valid metric values', async () => {
      const response = await request(app)
        .get('/v1/metrics')
        .expect(200);

      const metrics = response.text;
      
      // Extract uptime value
      const uptimeMatch = metrics.match(/app_uptime_seconds (\d+)/);
      expect(uptimeMatch).toBeTruthy();
      expect(parseInt(uptimeMatch[1])).toBeGreaterThanOrEqual(0);
      
      // Extract memory values
      const memoryUsedMatch = metrics.match(/app_memory_used_bytes (\d+)/);
      expect(memoryUsedMatch).toBeTruthy();
      expect(parseInt(memoryUsedMatch[1])).toBeGreaterThan(0);
      
      const memoryTotalMatch = metrics.match(/app_memory_total_bytes (\d+)/);
      expect(memoryTotalMatch).toBeTruthy();
      expect(parseInt(memoryTotalMatch[1])).toBeGreaterThan(0);
    });
  });

  describe('GET /v1/ready', () => {
    it('should return ready status', async () => {
      const response = await request(app)
        .get('/v1/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('timestamp');
      
      // Verify timestamp format
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('GET /v1/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/v1/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
      
      // Verify timestamp format
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('Legacy Health Endpoint', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/v1/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Route not found');
      expect(response.body).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
