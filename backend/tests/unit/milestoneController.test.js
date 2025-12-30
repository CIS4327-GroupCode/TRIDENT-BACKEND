/**
 * Unit Tests for Milestone Controller
 * Tests milestone creation, updates, and project milestone management
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/database/models', () => ({
  Milestone: {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn()
  },
  Project: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn()
  },
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn()
  }
}));

const { Milestone, Project, User } = require('../../src/database/models');
const milestoneController = require('../../src/controllers/milestoneController');

// Mock Project static methods
Project.findOne = jest.fn();

// Mock User static methods
User.findByPk = jest.fn();

describe('Milestone Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 1, role: 'nonprofit', org_id: 1 },
      body: {},
      params: {},
      query: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('createMilestone', () => {
    it('should create milestone successfully', async () => {
      req.params.projectId = 1;
      req.body = {
        name: 'Test Milestone',
        description: 'Test description',
        due_date: '2026-12-31',
        status: 'pending'
      };

      const mockUser = {
        id: 1,
        role: 'nonprofit',
        org_id: 1
      };

      const mockProject = {
        project_id: 1,
        org_id: 1
      };

      const mockMilestone = {
        id: 1,
        project_id: 1,
        name: 'Test Milestone',
        toSafeObject: jest.fn().mockReturnValue({
          id: 1,
          name: 'Test Milestone'
        })
      };

      User.findByPk.mockResolvedValue(mockUser);
      Project.findOne.mockResolvedValue(mockProject);
      Milestone.create.mockResolvedValue(mockMilestone);

      await milestoneController.createMilestone(req, res);

      expect(Milestone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 1,
          name: 'Test Milestone'
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 400 if milestone name is missing', async () => {
      req.params.projectId = 1;
      req.body = { description: 'Test' };

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Milestone name is required'
      });
    });

    it('should return 404 if project not found', async () => {
      req.params.projectId = 999;
      req.body = { name: 'Test' };

      User.findByPk.mockResolvedValue({ id: 1, role: 'nonprofit', org_id: 1 });
      Project.findOne.mockResolvedValue(null);

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 403 if user is not nonprofit', async () => {
      req.params.projectId = 1;
      req.body = { name: 'Test' };
      req.user = { id: 1, role: 'researcher', org_id: 1 };

      const mockProject = {
        project_id: 1,
        org_id: 1,
        title: 'Test Project'
      };

      Project.findOne.mockResolvedValue(mockProject);

      const mockUser = {
        id: 1,
        role: 'researcher'
      };

      User.findByPk.mockResolvedValue(mockUser);

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only nonprofit users can create milestones'
      });
    });

    it('should return 403 if user does not own the project', async () => {
      req.params.projectId = 1;
      req.body = { name: 'Test' };

      const mockUser = {
        id: 1,
        role: 'nonprofit',
        org_id: 1
      };

      const mockProject = {
        project_id: 1,
        org_id: 2 // Different org
      };

      User.findByPk.mockResolvedValue(mockUser);
      Project.findOne.mockResolvedValue(mockProject);

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Access denied. You can only create milestones for your organization's projects"
      });
    });

    it('should return 400 for invalid status', async () => {
      req.params.projectId = 1;
      req.body = {
        name: 'Test',
        status: 'invalid_status'
      };

      const mockUser = { id: 1, role: 'nonprofit', org_id: 1 };
      const mockProject = { project_id: 1, org_id: 1 };

      User.findByPk.mockResolvedValue(mockUser);
      Project.findOne.mockResolvedValue(mockProject);

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid status')
        })
      );
    });
  });

  describe('getMilestones', () => {
    it('should return all milestones for a project', async () => {
      req.params.projectId = 1;

      const mockProject = { project_id: 1 };
      const mockMilestones = [
        {
          id: 1,
          name: 'Milestone 1',
          toSafeObject: jest.fn().mockReturnValue({ id: 1, name: 'Milestone 1' }),
          isOverdue: jest.fn().mockReturnValue(false),
          daysUntilDue: jest.fn().mockReturnValue(10),
          getStatus: jest.fn().mockReturnValue('pending')
        },
        {
          id: 2,
          name: 'Milestone 2',
          toSafeObject: jest.fn().mockReturnValue({ id: 2, name: 'Milestone 2' }),
          isOverdue: jest.fn().mockReturnValue(false),
          daysUntilDue: jest.fn().mockReturnValue(20),
          getStatus: jest.fn().mockReturnValue('in_progress')
        }
      ];

      Project.findOne.mockResolvedValue(mockProject);
      Milestone.findAll.mockResolvedValue(mockMilestones);

      await milestoneController.getMilestones(req, res);

      expect(Milestone.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ project_id: 1 })
        })
      );
      expect(res.json).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 1,
          count: 2,
          milestones: expect.arrayContaining([])
        })
      );
    });

    it('should filter milestones by status', async () => {
      req.params.projectId = 1;
      req.query.status = 'completed';

      const mockProject = { project_id: 1 };

      Project.findOne.mockResolvedValue(mockProject);
      Milestone.findAll.mockResolvedValue([]);

      await milestoneController.getMilestones(req, res);

      expect(Milestone.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            project_id: 1,
            status: 'completed'
          })
        })
      );
    });

    it('should return 404 if project not found', async () => {
      req.params.projectId = 999;

      Project.findOne.mockResolvedValue(null);

      await milestoneController.getMilestones(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 400 for invalid status filter', async () => {
      req.params.projectId = 1;
      req.query.status = 'invalid';

      const mockProject = { project_id: 1 };
      Project.findOne.mockResolvedValue(mockProject);

      await milestoneController.getMilestones(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid status')
        })
      );
    });
  });
});
