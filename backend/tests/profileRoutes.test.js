const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');

describe('Profile Routes', () => {
  let accessToken;
  let userId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
  });

  afterAll(async () => {
    // Cleanup
    await User.deleteMany({ email: /^test.*@example\.com$/ });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create user and login before each test
    await User.deleteMany({ email: /^test.*@example\.com$/ });
    
    const signupResponse = await request(app)
      .post('/v1/auth/signup')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: 'Test User'
      });
    
    accessToken = signupResponse.body.data.accessToken;
    userId = signupResponse.body.data.user._id;
  });

  describe('GET /v1/profile', () => {
    it('should return user profile', async () => {
      const response = await request(app)
        .get('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile).toBeDefined();
      expect(response.body.data.preferences).toBeDefined();
      expect(response.body.data.stats).toBeDefined();
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/v1/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('PUT /v1/profile', () => {
    it('should update user profile', async () => {
      const updateData = {
        major: 'Computer Science',
        skillLevel: 'Intermediate',
        learningType: 'Visual',
        daysPerWeek: 4,
        minutesPerSession: 45,
        currentCourses: ['Python Basics', 'Data Structures']
      };

      const response = await request(app)
        .put('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile).toBeDefined();
      expect(response.body.data.profile.major).toBe('Computer Science');
      expect(response.body.data.profile.skillLevel).toBe('Intermediate');
      expect(response.body.data.profile.learningType).toBe('Visual');
    });

    it('should reject update without token', async () => {
      const response = await request(app)
        .put('/v1/profile')
        .send({ major: 'Computer Science' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });

    it('should validate profile data', async () => {
      const response = await request(app)
        .put('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          skillLevel: 'InvalidLevel' // Invalid value
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /v1/profile/preferences', () => {
    it('should update user preferences', async () => {
      const preferences = {
        theme: 'dark',
        notifications: true,
        language: 'en'
      };

      const response = await request(app)
        .patch('/v1/profile/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(preferences)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.preferences).toBeDefined();
    });

    it('should reject update without token', async () => {
      const response = await request(app)
        .patch('/v1/profile/preferences')
        .send({ theme: 'dark' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('POST /v1/profile/avatar', () => {
    it('should upload avatar image', async () => {
      // Create a simple test image buffer (1x1 PNG)
      const testImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const response = await request(app)
        .post('/v1/profile/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('avatar', testImage, 'test.png')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.avatarUrl).toBeDefined();
    });

    it('should reject upload without token', async () => {
      const testImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const response = await request(app)
        .post('/v1/profile/avatar')
        .attach('avatar', testImage, 'test.png')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });

    it('should reject non-image files', async () => {
      const testFile = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/v1/profile/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('avatar', testFile, 'test.txt')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});











