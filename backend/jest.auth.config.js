module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/authSecurity*.test.js', '<rootDir>/tests/authRoutes.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/authSecurity.setup.js'],
  testTimeout: 15000,
  maxWorkers: 1,
};
