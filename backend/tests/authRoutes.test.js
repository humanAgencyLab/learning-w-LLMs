const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Session = require('../models/Session');

describe('Authentication Routes', () => {
  let testUser;
  let accessToken;
  let refreshTokenCookie;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
  });

  afterAll(async () => {
    // Cleanup
    await User.deleteMany({ username: /^testuser/i });
    await Session.deleteMany({});
    // Don't close the shared mongoose connection here; other Jest suites may still be running.
  });

  beforeEach(async () => {
    // Clean up test users before each test
    await User.deleteMany({ username: /^testuser/i });
  });

  describe('POST /v1/auth/signup', () => {
    it('should create a new user successfully', async () => {
      const response = await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'TestPassword123!',
          name: 'Test User',
          username: 'testuser1'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.username).toBe('testuser1');
      expect(response.body.data.user.name).toBe('Test User');
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should reject signup with weak password', async () => {
      const response = await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'weak',
          name: 'Test User',
          username: 'testuser2'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject signup with duplicate username', async () => {
      // Create first user
      await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'TestPassword123!',
          name: 'Test User',
          username: 'testuser_dup'
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'TestPassword123!',
          name: 'Test User 2',
          username: 'testuser_dup'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('USERNAME_EXISTS');
    });

    it('should reject signup with missing fields', async () => {
      const response = await request(app)
        .post('/v1/auth/signup')
        .send({
          // Missing password and name
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'TestPassword123!',
          name: 'Test User',
          username: 'testuser_login'
        });
    });

    it('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          username: 'testuser_login',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      
      // Check for refresh token cookie
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some(cookie => cookie.includes('refreshToken'))).toBe(true);
      
      accessToken = response.body.data.accessToken;
    });

    it('should reject login with incorrect password', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          username: 'testuser_login',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent username', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          username: 'no_such_user_123',
          password: 'TestPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          // Missing password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /v1/auth/me', () => {
    beforeEach(async () => {
      // Create user and login
      const signupResponse = await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'TestPassword123!',
          name: 'Test User',
          username: 'testuser_me'
        });
      
      accessToken = signupResponse.body.data.accessToken;
    });

    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.username).toBe('testuser_me');
      expect(response.body.data.user.name).toBe('Test User');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /v1/auth/logout', () => {
    beforeEach(async () => {
      // Create user and login
      const signupResponse = await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'TestPassword123!',
          name: 'Test User',
          username: 'testuser_logout'
        });
      
      accessToken = signupResponse.body.data.accessToken;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/v1/auth/logout')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('POST /v1/auth/refresh', () => {
    beforeEach(async () => {
      // Create user and login to get refresh token cookie
      await request(app)
        .post('/v1/auth/signup')
        .send({ password: 'TestPassword123!', name: 'Test User', username: 'testuser_refresh' })
        .expect(201);

      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          username: 'testuser_refresh',
          password: 'TestPassword123!'
        });
      
      refreshTokenCookie = loginResponse.headers['set-cookie']
        .find(cookie => cookie.includes('refreshToken'));
    });

    it('should refresh access token with valid refresh token cookie', async () => {
      const response = await request(app)
        .post('/v1/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should reject refresh without cookie', async () => {
      const response = await request(app)
        .post('/v1/auth/refresh')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('REFRESH_TOKEN_REQUIRED');
    });
  });
});











