const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const logger = require('../utils/logger');

// Application start time
const startedAt = new Date();
const buildSha = process.env.BUILD_SHA || 'unknown';
const version = process.env.VERSION || '1.0.0';

/**
 * Health check endpoint
 */
router.get('/v1/health', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const dbConnected = mongoose.connection.readyState === 1;

  const healthData = {
    status: dbConnected ? 'healthy' : 'degraded',
    dbConnected,
    timestamp: new Date().toISOString(),
    uptimeSec,
    startedAt: startedAt.toISOString(),
    version,
    buildSha,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
      external: Math.round(process.memoryUsage().external / 1024 / 1020) // MB
    }
  };

  logger.info({
    requestId: req.requestId,
    endpoint: '/v1/health',
    uptimeSec,
    memoryUsed: healthData.memory.used
  }, 'Health check requested');

  res.json(healthData);
});

/**
 * Metrics endpoint (Prometheus format)
 */
router.get('/v1/metrics', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  
  // Basic application metrics
  const metrics = [
    `# HELP app_uptime_seconds Application uptime in seconds`,
    `# TYPE app_uptime_seconds counter`,
    `app_uptime_seconds ${uptimeSec}`,
    '',
    `# HELP app_memory_used_bytes Application memory usage in bytes`,
    `# TYPE app_memory_used_bytes gauge`,
    `app_memory_used_bytes ${process.memoryUsage().heapUsed}`,
    '',
    `# HELP app_memory_total_bytes Application total memory in bytes`,
    `# TYPE app_memory_total_bytes gauge`,
    `app_memory_total_bytes ${process.memoryUsage().heapTotal}`,
    '',
    `# HELP app_version_info Application version information`,
    `# TYPE app_version_info gauge`,
    `app_version_info{version="${version}",build_sha="${buildSha}",environment="${process.env.NODE_ENV || 'development'}"} 1`,
    ''
  ];

  // Note: In a production environment, you would collect these metrics
  // from a metrics store (like Prometheus) rather than generating them on-demand
  
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.join('\n'));
});

/**
 * Readiness probe endpoint
 */
router.get('/v1/ready', (req, res) => {
  // Check if the application is ready to serve requests
  const isReady = true; // Add your readiness checks here
  
  if (isReady) {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe endpoint
 */
router.get('/v1/live', (req, res) => {
  // Check if the application is alive
  const isAlive = true; // Add your liveness checks here
  
  if (isAlive) {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(503).json({
      status: 'not alive',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

