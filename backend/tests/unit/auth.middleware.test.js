/**
 * Unit Tests for Authentication Middleware
 * Tests JWT verification and role-based access control
 */

// Mock dependencies BEFORE imports
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn()
  }
}));

const jwt = require('jsonwebtoken');
const { authenticate, requireAdmin, requireNonprofit, requireResearcher } = require('../../src/middleware/auth');
const { User } = require('../../src/database/models');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      headers: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();

    process.env.JWT_SECRET = 'test-secret';
  });

  describe('authenticate', () => {
    it('should authenticate user with valid token', async () => {
      req.headers.authorization = 'Bearer valid-token';

      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'researcher',
        account_status: 'active',
        deleted_at: null
      };

      jwt.verify.mockReturnValue({ userId: 1 });
      User.findByPk.mockResolvedValue(mockUser);

      await authenticate(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(User.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 if no authorization header', async () => {
      req.headers.authorization = undefined;

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header missing Bearer prefix', async () => {
      req.headers.authorization = 'invalid-token';

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid', async () => {
      req.headers.authorization = 'Bearer invalid-token';

      jwt.verify.mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is expired', async () => {
      req.headers.authorization = 'Bearer expired-token';

      jwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user not found', async () => {
      req.headers.authorization = 'Bearer valid-token';

      jwt.verify.mockReturnValue({ userId: 999 });
      User.findByPk.mockResolvedValue(null);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token - user not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user is soft-deleted', async () => {
      req.headers.authorization = 'Bearer valid-token';

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        deleted_at: new Date()
      };

      jwt.verify.mockReturnValue({ userId: 1 });
      User.findByPk.mockResolvedValue(mockUser);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account has been suspended' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if account is suspended', async () => {
      req.headers.authorization = 'Bearer valid-token';

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        account_status: 'suspended',
        deleted_at: null
      };

      jwt.verify.mockReturnValue({ userId: 1 });
      User.findByPk.mockResolvedValue(mockUser);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account has been suspended' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if account is pending', async () => {
      req.headers.authorization = 'Bearer valid-token';

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        account_status: 'pending',
        deleted_at: null
      };

      jwt.verify.mockReturnValue({ userId: 1 });
      User.findByPk.mockResolvedValue(mockUser);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account pending approval' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors gracefully', async () => {
      req.headers.authorization = 'Bearer valid-token';

      jwt.verify.mockReturnValue({ userId: 1 });
      User.findByPk.mockRejectedValue(new Error('Database error'));

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow access for admin users', () => {
      req.user = { id: 1, role: 'admin' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-admin users', () => {
      req.user = { id: 1, role: 'researcher' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access for nonprofit users', () => {
      req.user = { id: 1, role: 'nonprofit' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireNonprofit', () => {
    it('should allow access for nonprofit users', () => {
      req.user = { id: 1, role: 'nonprofit' };

      requireNonprofit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-nonprofit users', () => {
      req.user = { id: 1, role: 'researcher' };

      requireNonprofit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nonprofit access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access for admin users', () => {
      req.user = { id: 1, role: 'admin' };

      requireNonprofit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nonprofit access required' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireResearcher', () => {
    it('should allow access for researcher users', () => {
      req.user = { id: 1, role: 'researcher' };

      requireResearcher(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-researcher users', () => {
      req.user = { id: 1, role: 'nonprofit' };

      requireResearcher(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Researcher access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access for admin users', () => {
      req.user = { id: 1, role: 'admin' };

      requireResearcher(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Researcher access required' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
