/**
 * Unit Tests for Authentication Controller
 * Tests login, register, and JWT generation
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/models/authModel', () => ({
  findUserByEmail: jest.fn(),
  getUserByEmail: jest.fn(),
  createUser: jest.fn()
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');
const authModel = require('../../src/models/authModel');

describe('Authentication Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock request and response
    req = {
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Default JWT secret
    process.env.JWT_SECRET = 'test-secret';
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'researcher'
      };

      authModel.findUserByEmail.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed_password');
      authModel.createUser.mockResolvedValue({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'researcher',
        created_at: new Date()
      });
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.register(req, res);

      expect(authModel.findUserByEmail).toHaveBeenCalledWith('john@example.com');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(authModel.createUser).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.any(Object),
          token: 'mock-jwt-token'
        })
      );
    });

    it('should return 400 if required fields are missing', async () => {
      req.body = { name: 'John Doe' }; // Missing email and password

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'name, email and password are required' 
      });
    });

    it('should return 409 if email already exists', async () => {
      req.body = {
        name: 'John Doe',
        email: 'existing@example.com',
        password: 'password123'
      };

      authModel.findUserByEmail.mockResolvedValue(true);

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'email already in use' });
    });

    it('should return 400 for invalid role', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'invalid_role'
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'invalid role. Must be one of: researcher, nonprofit, admin' 
      });
    });

    it('should require organizationData for nonprofit role', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'nonprofit'
        // Missing organizationData
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'organizationData is required for nonprofit role'
        })
      );
    });

    it('should validate rate range for researcher', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'researcher',
        researcherData: {
          rate_min: 100,
          rate_max: 50 // Invalid: max < min
        }
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'rate_min must be less than rate_max' 
      });
    });

    it('should normalize email to lowercase', async () => {
      req.body = {
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
        password: 'password123'
      };

      authModel.findUserByEmail.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed_password');
      authModel.createUser.mockResolvedValue({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'researcher'
      });
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.register(req, res);

      expect(authModel.findUserByEmail).toHaveBeenCalledWith('john@example.com');
    });

    it('should handle database errors gracefully', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      authModel.findUserByEmail.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed_password');
      authModel.createUser.mockRejectedValue(new Error('Database error'));

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'internal error' });
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      req.body = {
        email: 'john@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'researcher',
        password_hash: 'hashed_password',
        created_at: new Date()
      };

      authModel.getUserByEmail.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.login(req, res);

      expect(authModel.getUserByEmail).toHaveBeenCalledWith('john@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: 'john@example.com' }),
          token: 'mock-jwt-token'
        })
      );
    });

    it('should return 400 if email or password is missing', async () => {
      req.body = { email: 'john@example.com' }; // Missing password

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'email and password are required' 
      });
    });

    it('should return 401 if email not found', async () => {
      req.body = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      authModel.getUserByEmail.mockResolvedValue(null);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid email' });
    });

    it('should return 401 if password is incorrect', async () => {
      req.body = {
        email: 'john@example.com',
        password: 'wrongpassword'
      };

      const mockUser = {
        id: 1,
        email: 'john@example.com',
        password_hash: 'hashed_password'
      };

      authModel.getUserByEmail.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid password' });
    });

    it('should not return password_hash in response', async () => {
      req.body = {
        email: 'john@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'researcher',
        password_hash: 'hashed_password',
        created_at: new Date()
      };

      authModel.getUserByEmail.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.login(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.user.password_hash).toBeUndefined();
    });

    it('should normalize email to lowercase', async () => {
      req.body = {
        email: 'JOHN@EXAMPLE.COM',
        password: 'password123'
      };

      authModel.getUserByEmail.mockResolvedValue({
        id: 1,
        email: 'john@example.com',
        password_hash: 'hash'
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      await authController.login(req, res);

      expect(authModel.getUserByEmail).toHaveBeenCalledWith('john@example.com');
    });

    it('should handle database errors gracefully', async () => {
      req.body = {
        email: 'john@example.com',
        password: 'password123'
      };

      authModel.getUserByEmail.mockRejectedValue(new Error('Database error'));

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'internal error' });
    });

    it('should generate JWT with correct payload', async () => {
      req.body = {
        email: 'john@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'researcher',
        password_hash: 'hashed_password'
      };

      authModel.getUserByEmail.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.login(req, res);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          role: 'researcher',
          email: 'john@example.com'
        }),
        'test-secret',
        { expiresIn: '7d' }
      );
    });
  });
});
