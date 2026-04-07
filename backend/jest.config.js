/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Keep default testMatch; repo already uses backend/tests/**.test.js
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  globalTeardown: '<rootDir>/tests/jest.teardown.js',
};

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!jest.config.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000
};
