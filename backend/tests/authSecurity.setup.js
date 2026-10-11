const mongoose = require('mongoose');
const { assertAuthTarget, verifyAuthConnection } = require('./authIsolation');
const target = assertAuthTarget(process.env);
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = target.uri;
process.env.MONGODB_TEST_URI = target.uri;
process.env.JWT_SECRET = 'auth-regression-only-secret-32-bytes-minimum';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.GROQ_API_KEY = 'auth-test-only';
// Never read the application .env in this dedicated test configuration.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('uuid', () => ({ v4: () => 'auth-test-request' }));
beforeAll(async () => {
  await mongoose.connect(target.uri, { serverSelectionTimeoutMS: 5000, autoIndex: false, autoCreate: false });
  await verifyAuthConnection(mongoose.connection, target);
  // Disable implicit startup writes; indexes are created only after identity verification.
  const User = require('../models/User');
  await User.createCollection();
  await User.createIndexes();
});
afterAll(async () => {
  // No broad collection cleanup or dropDatabase: the runner owns the entire directory.
  await mongoose.disconnect();
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../utils/fileUpload', () => ({ uploadAvatar: (req, res, next) => next() }));
jest.mock('../services/certificateService', () => ({}));
