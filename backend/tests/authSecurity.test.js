const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const tokens = require('../utils/jwt');
const logger = require('../utils/logger');
const app = express();
app.use(express.json());
app.use('/v1/auth', require('../routes/authRoutes'));
app.use('/v1/profile', require('../routes/profileRoutes'));
let count = 0;
async function signup() {
  const response = await request(app).post('/v1/auth/signup').send({
    username: `auth_security_${++count}`, name: 'Test', password: 'Password123',
  }).expect(201);
  return { user: response.body.data.user, access: response.body.data.accessToken, cookie: response.headers['set-cookie'][0].split(';')[0] };
}
const me = access => request(app).get('/v1/auth/me').set('Authorization', `Bearer ${access}`);
const refresh = cookie => request(app).post('/v1/auth/refresh').set('Cookie', cookie);
const logout = account => request(app).post('/v1/auth/logout').set('Authorization', `Bearer ${account.access}`).set('Cookie', account.cookie);
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const claims = (user, authVersion = 0) => ({ userId: user._id, username: user.username, authVersion });
const sign = (payload, options = {}) => jwt.sign(payload, process.env.JWT_SECRET, {
  algorithm: 'HS256', issuer: 'learning-w-llms', audience: 'learning-w-llms-client', expiresIn: '15m', ...options,
});
afterEach(() => jest.restoreAllMocks());

test('signup/login/me preserve envelopes and hide internal fields', async () => {
  const account = await signup();
  expect(account.user.passwordHash).toBeUndefined();
  expect(account.user.authVersion).toBeUndefined();
  expect(account.user.passwordResetTokenHash).toBeUndefined();
  const login = await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'Password123' }).expect(200);
  expect(login.body).toEqual({ success: true, data: { user: expect.any(Object), accessToken: expect.any(String) } });
  await me(login.body.data.accessToken).expect(200);
  expect(jwt.decode(login.body.data.accessToken).exp - jwt.decode(login.body.data.accessToken).iat).toBe(900);
  expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
});

test('forgot-password is uniform, creates no token, and does not log secrets', async () => {
  const account = await signup();
  const log = jest.spyOn(logger, 'info').mockClear();
  const existing = await request(app).post('/v1/auth/forgot-password').send({ username: account.user.username }).expect(200);
  const unknown = await request(app).post('/v1/auth/forgot-password').send({ username: 'unknown_account' }).expect(200);
  expect(existing.body).toEqual(unknown.body);
  expect(existing.body.data).toBeUndefined();
  expect(existing.body.message).toContain('unavailable');
  const user = await User.findById(account.user._id).select('+passwordResetToken +passwordResetTokenHash');
  expect(user.passwordResetToken).toBeNull();
  expect(user.passwordResetTokenHash).toBeNull();
  expect(log).not.toHaveBeenCalled();
  await request(app).post('/v1/auth/forgot-password').send({ username: { $ne: null } }).expect(400);
});

test('legacy users missing stored authVersion work with new tokens', async () => {
  const account = await signup();
  await User.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(account.user._id) }, { $unset: { authVersion: '' } });
  await me(account.access).expect(200);
  await logout(account).expect(200);
  await me(account.access).expect(401);
});

test('logout invalidates access and refresh; repeated old logout preserves later login', async () => {
  const account = await signup();
  const response = await logout(account).expect(200);
  expect(response.body).toEqual({ success: true, message: 'Logged out successfully' });
  expect(response.headers['set-cookie'][0]).toContain('Path=/');
  await me(account.access).expect(401);
  await refresh(account.cookie).expect(401);
  const login = await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'Password123' }).expect(200);
  await logout(account).expect(200);
  await me(login.body.data.accessToken).expect(200);
});

test('stale refresh cookie does not prevent logout of a newer access credential', async () => {
  const account = await signup();
  await logout(account).expect(200);
  const login = await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'Password123' }).expect(200);
  await logout({ ...account, access: login.body.data.accessToken }).expect(200);
  await me(login.body.data.accessToken).expect(401);
});

test('logout works with expired access and valid refresh, no credentials, or invalid credentials', async () => {
  const account = await signup();
  const expired = sign({ ...claims(account.user), type: 'access' }, { expiresIn: -1 });
  await logout({ ...account, access: expired }).expect(200);
  await me(account.access).expect(401);
  await request(app).post('/v1/auth/logout').expect(200);
  await request(app).post('/v1/auth/logout').set('Cookie', 'refreshToken=invalid').expect(200);
});

test('cookie logout rejects hostile origins and conflicting valid users', async () => {
  const first = await signup(); const second = await signup();
  await logout(first).set('Origin', 'https://attacker.invalid').expect(403);
  await me(first.access).expect(200);
  await logout({ ...first, access: second.access }).expect(400);
  await me(first.access).expect(200);
});

test('database revocation failure clears cookie and reports failure', async () => {
  const account = await signup();
  jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('database unavailable'));
  const response = await logout(account).expect(500);
  expect(response.body.code).toBe('SERVER_ERROR');
  expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
});

test('refresh paused after reading version cannot issue usable credentials after logout', async () => {
  const account = await signup();
  const snapshot = await User.findById(account.user._id).select('+authVersion');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let reached;
  const read = new Promise(resolve => { reached = resolve; });
  jest.spyOn(User, 'findById').mockImplementationOnce(() => ({ select: async () => { reached(); await gate; return snapshot; } }));
  const pending = refresh(account.cookie).then(response => response);
  await read;
  await logout(account).expect(200);
  release();
  const response = await pending;
  expect(response.status).toBe(200);
  await me(response.body.data.accessToken).expect(401);
  await refresh(account.cookie).expect(401);
});

test('multiple refreshes racing logout cannot restore a session', async () => {
  const account = await signup();
  const responses = await Promise.all([refresh(account.cookie), refresh(account.cookie), logout(account)]);
  for (const response of responses.slice(0, 2)) {
    if (response.status === 200) await me(response.body.data.accessToken).expect(401);
    else expect(response.status).toBe(401);
  }
});

test.each([
  ['missing version', { type: 'access' }, {}],
  ['wrong type', { type: 'refresh', authVersion: 0 }, {}],
  ['wrong issuer', { type: 'access', authVersion: 0 }, { issuer: 'other' }],
  ['wrong audience', { type: 'access', authVersion: 0 }, { audience: 'other' }],
  ['wrong algorithm', { type: 'access', authVersion: 0 }, { algorithm: 'HS384' }],
  ['expired', { type: 'access', authVersion: 0 }, { expiresIn: -1 }],
])('%s token rejected', async (_, extra, options) => {
  const account = await signup();
  await me(sign({ userId: account.user._id, ...extra }, options)).expect(401);
});

test('refresh rejects unversioned tokens and supports Bearer refresh', async () => {
  const account = await signup();
  const raw = sign({ userId: account.user._id, type: 'refresh' });
  await refresh(`refreshToken=${raw}`).expect(401);
  await request(app).post('/v1/auth/refresh').set('Authorization', `Bearer ${tokens.generateRefreshToken(claims(account.user))}`).expect(200);
});

test('password change verifies password and invalidates old credentials', async () => {
  const account = await signup();
  await request(app).patch('/v1/profile/password').set('Authorization', `Bearer ${account.access}`).send({ currentPassword: 'wrong', newPassword: 'NewPassword123' }).expect(401);
  await me(account.access).expect(200);
  await request(app).patch('/v1/profile/password').set('Authorization', `Bearer ${account.access}`).send({ currentPassword: 'Password123', newPassword: 'NewPassword123' }).expect(200);
  await me(account.access).expect(401);
  await refresh(account.cookie).expect(401);
  await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'NewPassword123' }).expect(200);
});

test('hashed reset is single use, atomic, and invalidates credentials', async () => {
  const account = await signup(); const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: account.user._id }, { $set: { passwordResetTokenHash: digest(token), passwordResetExpires: new Date(Date.now() + 60000) } });
  const reset = () => request(app).post('/v1/auth/reset-password').send({ token, password: 'NewPassword123' });
  const results = await Promise.all([reset(), reset()]);
  expect(results.map(result => result.status).sort()).toEqual([200, 400]);
  await reset().expect(400);
  await me(account.access).expect(401);
  await refresh(account.cookie).expect(401);
  await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'NewPassword123' }).expect(200);
});

test('raw legacy, expired, malformed and unknown reset tokens rejected', async () => {
  const account = await signup(); const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: account.user._id }, { $set: { passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 60000) } });
  await request(app).post('/v1/auth/reset-password').send({ token, password: 'NewPassword123' }).expect(400);
  await User.updateOne({ _id: account.user._id }, { $set: { passwordResetTokenHash: digest(token), passwordResetExpires: new Date(Date.now() - 1000) } });
  await request(app).post('/v1/auth/reset-password').send({ token, password: 'NewPassword123' }).expect(400);
  await request(app).post('/v1/auth/reset-password').send({ token: { $ne: null }, password: 'NewPassword123' }).expect(400);
  await request(app).post('/v1/auth/reset-password').send({ token: 'f'.repeat(64), password: 'NewPassword123' }).expect(400);
});

test('legacy login bookkeeping racing logout cannot reset authVersion or issue stale credentials', async () => {
  const account = await signup();
  await User.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(account.user._id) }, { $unset: { authVersion: '' } });
  const update = User.updateOne.bind(User);
  let release; let reached;
  const gate = new Promise(resolve => { release = resolve; });
  const paused = new Promise(resolve => { reached = resolve; });
  const spy = jest.spyOn(User, 'updateOne').mockImplementation((filter, changes, ...options) => {
    if (changes.$set?.lastLoginAt) {
      reached();
      return gate.then(() => update(filter, changes, ...options));
    }
    return update(filter, changes, ...options);
  });
  const login = request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'Password123' }).then(result => result);
  try {
    await paused;
    await logout(account).expect(200);
  } finally { release(); }
  const result = await login;
  expect(result.status).toBe(401);
  expect(result.body).toEqual({ success: false, error: 'Invalid username or password', code: 'INVALID_CREDENTIALS' });
  expect(result.headers['set-cookie']).toBeUndefined();
  const user = await User.findById(account.user._id).select('+authVersion');
  expect(user.authVersion).toBe(1);
  expect(user.lastLoginAt).toBeNull();
  const [filter, changes] = spy.mock.calls.find(([, changes]) => changes.$set?.lastLoginAt);
  expect(filter.$or).toEqual([{ authVersion: 0 }, { authVersion: { $exists: false } }]);
  expect(Object.keys(changes.$set).sort()).toEqual(['lastLoginAt', 'updatedAt']);
  await me(account.access).expect(401);
  await refresh(account.cookie).expect(401);
});

test('legacy login bookkeeping leaves missing version absent and updates timestamps', async () => {
  const account = await signup();
  const id = new (require('mongoose').Types.ObjectId)(account.user._id);
  await User.collection.updateOne({ _id: id }, { $unset: { authVersion: '' } });
  const login = await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'Password123' }).expect(200);
  const raw = await User.collection.findOne({ _id: id });
  expect(raw.authVersion).toBeUndefined();
  expect(raw.lastLoginAt).toBeInstanceOf(Date);
  expect(jwt.decode(login.body.data.accessToken).authVersion).toBe(0);
  await me(login.body.data.accessToken).expect(200);
});


test('opt-in logout receipt confirms authenticated version revocation, including an idempotent retry', async () => {
  const account = await signup();
  const first = await logout(account).send({ confirmRevocation: true }).expect(200);
  expect(first.body).toEqual({ success: true, message: 'Logged out successfully', data: { revocationConfirmed: true } });
  await me(account.access).expect(401);
  const login = await request(app).post('/v1/auth/login').send({ username: account.user.username, password: 'Password123' }).expect(200);
  const retry = await request(app).post('/v1/auth/logout').set('Authorization', `Bearer ${account.access}`).send({ confirmRevocation: true }).expect(200);
  expect(retry.body.data.revocationConfirmed).toBe(true);
  await me(login.body.data.accessToken).expect(200);
});

test('anonymous, invalid, or expired Bearer logout 200 never confirms retry revocation', async () => {
  const account = await signup();
  const expired = sign({ ...claims(account.user), type: 'access' }, { expiresIn: -1 });
  for (const access of [null, 'invalid', expired]) {
    let call = request(app).post('/v1/auth/logout').send({ confirmRevocation: true });
    if (access) call = call.set('Authorization', `Bearer ${access}`);
    const result = await call.expect(200);
    expect(result.body.data.revocationConfirmed).toBe(false);
  }
  await me(account.access).expect(200);
});
