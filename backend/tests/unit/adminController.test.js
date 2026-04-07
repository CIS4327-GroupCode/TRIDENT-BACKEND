/**
 * Unit Tests for Admin Controller
 * Tests admin dashboard statistics, user management, and admin operations
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    update: jest.fn()
  },
  Organization: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn()
  },
  ResearcherProfile: {
    findByPk: jest.fn()
  },
  Project: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn()
  },
  Milestone: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn()
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

  describe('getAdminAlerts', () => {
    it('should return overdue, approaching, and atRisk arrays with summary', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      Milestone.findAll
        .mockResolvedValueOnce([
          {
            id: 1,
            name: 'Overdue Milestone',
            status: 'pending',
            due_date: pastDate.toISOString().slice(0, 10),
            project: {
              project_id: 10,
              title: 'Test Project',
              status: 'in_progress',
              organization: { id: 1, name: 'Test Org' }
            }
          }
        ])
        .mockResolvedValueOnce([
          {
            id: 2,
            name: 'Approaching Milestone',
            status: 'in_progress',
            due_date: futureDate.toISOString().slice(0, 10),
            project: {
              project_id: 11,
              title: 'Another Project',
              status: 'in_progress',
              organization: { id: 2, name: 'Another Org' }
            }
          }
        ]);

      Project.findAll.mockResolvedValue([]);

      await adminController.getAdminAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toHaveProperty('overdue');
      expect(responseData).toHaveProperty('approaching');
      expect(responseData).toHaveProperty('atRisk');
      expect(responseData).toHaveProperty('summary');
      expect(responseData.summary.overdueCount).toBe(1);
      expect(responseData.summary.approachingCount).toBe(1);
      expect(responseData.summary.atRiskCount).toBe(0);
      expect(responseData.overdue[0].days_overdue).toBeGreaterThan(0);
    });

    it('should handle database errors gracefully', async () => {
      Milestone.findAll.mockRejectedValue(new Error('DB error'));

      await adminController.getAdminAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch alerts' });
    });
  });

  describe('exportAdminData', () => {
    beforeEach(() => {
      res.setHeader = jest.fn();
      res.send = jest.fn();
    });

    it('should return CSV for users export', async () => {
      req.params.entity = 'users';
      req.query = {};

      User.findAll.mockResolvedValue([
        {
          id: 1,
          name: 'Test User',
          email: 'test@test.com',
          role: 'researcher',
          account_status: 'active',
          created_at: new Date('2024-01-01'),
          organization: { name: 'Test Org' }
        }
      ]);

      await adminController.exportAdminData(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('users-export-')
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalled();
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('ID,Name,Email,Role,Status,Organization,Created');
      expect(csv).toContain('Test User');
    });

    it('should return CSV for projects export', async () => {
      req.params.entity = 'projects';
      req.query = {};

      Project.findAll.mockResolvedValue([
        {
          project_id: 1,
          title: 'Project A',
          status: 'open',
          budget_min: 1000,
          budget_max: 5000,
          timeline: '3 months',
          organization: { name: 'Org A' }
        }
      ]);

      await adminController.exportAdminData(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('ID,Title,Organization,Status');
      expect(csv).toContain('Project A');
    });

    it('should reject invalid entity names', async () => {
      req.params.entity = 'passwords';
      req.query = {};

      await adminController.exportAdminData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid entity') })
      );
    });

    it('should handle CSV escaping for values with commas', async () => {
      req.params.entity = 'users';
      req.query = {};

      User.findAll.mockResolvedValue([
        {
          id: 1,
          name: 'Last, First',
          email: 'test@test.com',
          role: 'researcher',
          account_status: 'active',
          created_at: new Date('2024-01-01'),
          organization: null
        }
      ]);

      await adminController.exportAdminData(req, res);

      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('"Last, First"');
    });

    it('should handle database errors', async () => {
      req.params.entity = 'users';
      req.query = {};

      User.findAll.mockRejectedValue(new Error('DB error'));

      await adminController.exportAdminData(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to export data' });
    });
  });
});
