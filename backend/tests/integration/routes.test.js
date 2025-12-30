/**
 * Integration Tests for API Routes
 * Tests end-to-end API request/response flows with real database
 * Test data is committed, then cleaned up after each test using unique identifiers
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sequelize = require('../../src/database');
const { User, Organization, Project, ResearcherProfile } = require('../../src/database/models');

// Import the actual app
const app = require('../../src/index');

describe('API Routes Integration', () => {
  let testUser;
  let authToken;
  let testTimestamp;

  beforeAll(async () => {
    // Ensure database connection
    try {
      await sequelize.authenticate();
      console.log('✓ Test database connected');
    } catch (error) {
      console.error('✗ Failed to connect to test database:', error.message);
      throw error;
    }
  });

  beforeEach(async () => {
    // Create unique timestamp for this test run
    testTimestamp = Date.now();
    
    // Create a test user with unique email
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    testUser = await User.create({
      name: `Test User ${testTimestamp}`,
      email: `test_${testTimestamp}@example.com`,
      password_hash: hashedPassword,
      role: 'nonprofit',
      account_status: 'active'
    });

    // Generate auth token that matches the user
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    // Clean up test data using the timestamp identifier
    try {
      // Delete associated organizations
      await Organization.destroy({
        where: { user_id: testUser.id }
      });

      // Delete the test user
      await User.destroy({
        where: { id: testUser.id }
      });
    } catch (error) {
      console.error('Cleanup error:', error.message);
      // Don't fail the test if cleanup fails
    }
  });

  afterAll(async () => {
    // Close database connection
    try {
      await sequelize.close();
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  });

  describe('Authentication Routes', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user', async () => {
        const uniqueEmail = `newuser_${testTimestamp}@example.com`;
        
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            name: 'New User',
            email: uniqueEmail,
            password: 'password123',
            role: 'researcher'
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('token');
        expect(response.body.user).toHaveProperty('email', uniqueEmail);
        expect(response.body.user).toHaveProperty('role', 'researcher');

        // Clean up the newly created user
        try {
          await User.destroy({ where: { email: uniqueEmail } });
        } catch (e) {
          // Ignore cleanup errors in test
        }
      });

      it('should return 409 if email already exists', async () => {
        // User already created in beforeEach with testUser.email
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            name: 'Duplicate User',
            email: testUser.email,
            password: 'password123',
            role: 'researcher'
          });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login user with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'testpassword123'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body.user).toHaveProperty('email', testUser.email);
      });

      it('should return 401 for invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'wrongpassword'
          });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });
    });
  });

  describe('Organization Routes', () => {
    describe('GET /api/organizations/me', () => {
      it('should return authenticated user organization', async () => {
        // Create organization for testUser
        const org = await Organization.create({
          user_id: testUser.id,
          name: `Test Organization ${testTimestamp}`,
          mission: 'Test mission',
          website: 'https://test.org'
        });

        const response = await request(app)
          .get('/api/organizations/me')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('name');
        expect(response.body).toHaveProperty('user_id');

        // Clean up
        try {
          await Organization.destroy({ where: { id: org.id } });
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    });
  });

  describe('Project Routes', () => {
    describe('GET /api/projects/browse', () => {
      it('should return paginated list of projects', async () => {
        const response = await request(app)
          .get('/api/projects/browse')
          .query({ page: 1, limit: 20 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('projects');
        expect(response.body).toHaveProperty('pagination');
        expect(Array.isArray(response.body.projects)).toBe(true);
      });

      it('should filter projects by search term', async () => {
        const response = await request(app)
          .get('/api/projects/browse')
          .query({ search: 'education', page: 1, limit: 20 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('projects');
        expect(Array.isArray(response.body.projects)).toBe(true);
      });
    });
  });
});
