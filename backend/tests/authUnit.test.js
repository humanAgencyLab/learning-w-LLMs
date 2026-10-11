const { assertAuthTarget, verifyAuthConnection } = require('./authIsolation');
const safe = { AUTH_TEST_URI: 'mongodb://127.0.0.1:39001/auth_phase1_' + 'a'.repeat(24), AUTH_TEST_DBPATH: '/private/tmp/auth-phase1-unit/db' };
test.each([{}, { ...safe, AUTH_TEST_URI: 'mongodb://localhost:27017/ai_edu_app' },
  { ...safe, AUTH_TEST_URI: 'mongodb://production.invalid:39001/auth_phase1_' + 'a'.repeat(24) },
  { ...safe, AUTH_TEST_URI: safe.AUTH_TEST_URI + '?replicaSet=remote' },
  { ...safe, AUTH_TEST_DBPATH: '/Users/example/data/db' },
])('reject unsafe targets before any connection', env => { expect(() => assertAuthTarget(env)).toThrow(); });
test('verify actual process directory, bind address, port and database', async () => {
  const target = assertAuthTarget(safe);
  const connection = { name: target.database, host: '127.0.0.1', port: target.port,
    db: { admin: () => ({ command: async () => ({ parsed: { storage: { dbPath: '/other' }, net: { bindIp: '127.0.0.1', port: target.port } } }) }) } };
  await expect(verifyAuthConnection(connection, target)).rejects.toThrow();
});
const secret = 'auth-unit-only-secret-at-least-32-bytes';
beforeEach(() => { jest.resetModules(); process.env.JWT_SECRET = secret; delete process.env.JWT_ACCESS_EXPIRES_IN; delete process.env.JWT_REFRESH_EXPIRES_IN; });
test.each([undefined, '', 'short', 'your-secret-key-change-in-production', 'your_jwt_secret_here'.repeat(3)])('reject insecure JWT configuration', value => {
  if (value === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = value;
  expect(() => require('../utils/jwt')).toThrow('JWT_SECRET');
});
test('durations and cookie lifetime are validated and derived', () => {
  process.env.JWT_REFRESH_EXPIRES_IN = '2d';
  expect(require('../utils/jwt').REFRESH_COOKIE_MAX_AGE).toBe(172800000);
  jest.resetModules(); process.env.JWT_ACCESS_EXPIRES_IN = 'invalid';
  expect(() => require('../utils/jwt')).toThrow('JWT_ACCESS_EXPIRES_IN');
});
