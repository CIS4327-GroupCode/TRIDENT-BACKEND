/**
 * Unit Tests for Admin Controller
 * Tests admin dashboard statistics, user management, and admin operations
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    update: jest.fn()
  },
  Organization: {
    findByPk: jest.fn(),
    findAll: jest.fn()
  },
  ResearcherProfile: {
    findByPk: jest.fn()
  },
  Project: {
    findByPk: jest.fn()
  },
  Milestone: {
    findByPk: jest.fn()
  },
  ProjectReview: {},
  sequelize: {
    query: jest.fn()
  }
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn()
}));

const bcrypt = require('bcryptjs');
const adminController = require('../../src/controllers/adminController');
const { User, Organization, ResearcherProfile, Project, Milestone, sequelize } = require('../../src/database/models');

describe('Admin Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 1, role: 'admin' },
      body: {},
      params: {},
      query: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getDashboardStats', () => {
    it('should return dashboard statistics successfully', async () => {
      const mockStats = [{
        total_users: 100,
        nonprofit_users: 40,
        researcher_users: 50,
        admin_users: 10,
        suspended_users: 5,
        pending_approval: 15,
        total_organizations: 30,
        total_projects: 25,
        open_projects: 20,
        draft_projects: 5,
        total_milestones: 50,
        pending_milestones: 10,
        active_milestones: 25,
        completed_milestones: 15
      }];

      sequelize.query.mockResolvedValue([mockStats]);

      await adminController.getDashboardStats(req, res);

      expect(sequelize.query).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ stats: mockStats[0] });
    });

    it('should handle database errors', async () => {
      sequelize.query.mockRejectedValue(new Error('Database error'));

      await adminController.getDashboardStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch dashboard statistics' });
    });
  });

  describe('getAllUsers', () => {
    it('should return paginated list of users', async () => {
      req.query = { page: 1, limit: 20 };

      const mockUsers = [
        { id: 1, name: 'User 1', email: 'user1@test.com', role: 'researcher' },
        { id: 2, name: 'User 2', email: 'user2@test.com', role: 'nonprofit' }
      ];

      User.findAndCountAll.mockResolvedValue({
        count: 50,
        rows: mockUsers
      });

      await adminController.getAllUsers(req, res);

      expect(User.findAndCountAll).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        users: mockUsers,
        pagination: {
          total: 50,
          page: 1,
          limit: 20,
          totalPages: 3
        }
      });
    });

    it('should filter users by role', async () => {
      req.query = { role: 'researcher', page: 1, limit: 20 };

      User.findAndCountAll.mockResolvedValue({
        count: 25,
        rows: []
      });

      await adminController.getAllUsers(req, res);

      expect(User.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'researcher' })
        })
      );
    });

    it('should filter users by status', async () => {
      req.query = { status: 'pending', page: 1, limit: 20 };

      User.findAndCountAll.mockResolvedValue({
        count: 10,
        rows: []
      });

      await adminController.getAllUsers(req, res);

      expect(User.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ account_status: 'pending' })
        })
      );
    });

    it('should search users by name or email', async () => {
      req.query = { search: 'john', page: 1, limit: 20 };

      User.findAndCountAll.mockResolvedValue({
        count: 5,
        rows: []
      });

      await adminController.getAllUsers(req, res);

      const callArgs = User.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where).toHaveProperty([Symbol.for('or')]);
    });

    it('should handle database errors', async () => {
      User.findAndCountAll.mockRejectedValue(new Error('Database error'));

      await adminController.getAllUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
    });
  });

  describe('getUserDetails', () => {
    it('should return user details with associations', async () => {
      req.params.id = 1;

      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'researcher',
        organization: null,
        researcherProfile: { affiliation: 'Test University' }
      };

      User.findByPk.mockResolvedValue(mockUser);

      await adminController.getUserDetails(req, res);

      expect(User.findByPk).toHaveBeenCalledWith(1, expect.objectContaining({
        paranoid: false
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });

    it('should return 404 if user not found', async () => {
      req.params.id = 999;

      User.findByPk.mockResolvedValue(null);

      await adminController.getUserDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should handle database errors', async () => {
      req.params.id = 1;

      User.findByPk.mockRejectedValue(new Error('Database error'));

      await adminController.getUserDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch user details' });
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status to active', async () => {
      req.params.id = 1;
      req.body.status = 'active';

      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        account_status: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };

      User.findByPk.mockResolvedValue(mockUser);

      await adminController.updateUserStatus(req, res);

      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User status updated to active'
        })
      );
    });

    it('should return 400 for invalid status', async () => {
      req.params.id = 1;
      req.body.status = 'invalid';

      await adminController.updateUserStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if user not found', async () => {
      req.params.id = 999;
      req.body.status = 'active';

      User.findByPk.mockResolvedValue(null);

      await adminController.updateUserStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
