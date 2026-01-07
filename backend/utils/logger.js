const pino = require('pino');

// Create a logger instance
// Only use pino-pretty in development (it's a dev dependency)
const isDevelopment = process.env.NODE_ENV !== 'production';

const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info'
};

// Only add transport (pino-pretty) in development
if (isDevelopment) {
  try {
    loggerConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    };
  } catch (error) {
    // pino-pretty not available, use default logger
    console.warn('pino-pretty not available, using default logger');
  }
}

const logger = pino(loggerConfig);

module.exports = logger;

