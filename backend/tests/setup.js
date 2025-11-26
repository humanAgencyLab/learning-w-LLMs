// Test setup file
require('dotenv').config();

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.GROQ_API_KEY = 'test-api-key'; // Mock API key for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234')
}));

// Mock pino logger
jest.mock('pino', () => {
  const mockLogger = {
    child: jest.fn(() => mockLogger),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  return jest.fn(() => mockLogger);
});

// Mock console methods to reduce test output noise (but allow console.log for debugging)
global.console = {
  ...console,
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
  // Keep console.log for debugging
};
