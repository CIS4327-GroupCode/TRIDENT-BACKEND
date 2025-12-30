/**
 * Unit Tests for Project Controller
 * Tests project browsing, creation, and management
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/database/models', () => ({
  Project: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn()
  },
  Organization: {
    findByPk: jest.fn()
  },
  ProjectReview: {},
  User: {
    findByPk: jest.fn()
  }
}));

const projectController = require('../../src/controllers/projectController');
const { Project, Organization, User } = require('../../src/database/models');

describe('Project Controller', () => {
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

  describe('browseProjects', () => {
    it('should return paginated list of open projects', async () => {
      req.query = { page: 1, limit: 20 };

      const mockProjects = [
        {
          project_id: 1,
          title: 'Project 1',
          status: 'open',
          organization: { name: 'Org 1' }
        },
        {
          project_id: 2,
          title: 'Project 2',
          status: 'open',
          organization: { name: 'Org 2' }
        }
      ];

      Project.findAndCountAll.mockResolvedValue({
        count: 50,
        rows: mockProjects
      });

      await projectController.browseProjects(req, res);

      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'open' })
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        projects: mockProjects,
        pagination: {
          total: 50,
          page: 1,
          limit: 20,
          totalPages: 3
        }
      });
    });

    it('should filter projects by search term', async () => {
      req.query = { search: 'education', page: 1, limit: 20 };

      Project.findAndCountAll.mockResolvedValue({
        count: 10,
        rows: []
      });

      await projectController.browseProjects(req, res);

      const callArgs = Project.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where).toHaveProperty([Symbol.for('or')]);
    });

    it('should filter projects by methods required', async () => {
      req.query = { methods: 'survey', page: 1, limit: 20 };

      Project.findAndCountAll.mockResolvedValue({
        count: 5,
        rows: []
      });

      await projectController.browseProjects(req, res);

      const callArgs = Project.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.methods_required).toBeDefined();
    });

    it('should filter projects by budget range', async () => {
      req.query = { budget_min: 1000, budget_max: 5000, page: 1, limit: 20 };

      Project.findAndCountAll.mockResolvedValue({
        count: 15,
        rows: []
      });

      await projectController.browseProjects(req, res);

      const callArgs = Project.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.budget_min).toBeDefined();
    });

    it('should filter projects by data sensitivity', async () => {
      req.query = { data_sensitivity: 'high', page: 1, limit: 20 };

      Project.findAndCountAll.mockResolvedValue({
        count: 8,
        rows: []
      });

      await projectController.browseProjects(req, res);

      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ data_sensitivity: 'high' })
        })
      );
    });

    it('should handle database errors', async () => {
      req.query = { page: 1, limit: 20 };

      Project.findAndCountAll.mockRejectedValue(new Error('Database error'));

      await projectController.browseProjects(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('getPublicProject', () => {
    it('should return public project details', async () => {
      req.params.id = 1;

      const mockProject = {
        project_id: 1,
        title: 'Test Project',
        status: 'open',
        organization: {
          name: 'Test Org',
          mission: 'Test mission'
        }
      };

      Project.findOne.mockResolvedValue(mockProject);

      await projectController.getPublicProject(req, res);

      expect(Project.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            project_id: 1,
            status: 'open'
          })
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ project: mockProject });
    });

    it('should return 404 if project not found', async () => {
      req.params.id = 999;

      Project.findOne.mockResolvedValue(null);

      await projectController.getPublicProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Project not found or not available'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = 1;

      Project.findOne.mockRejectedValue(new Error('Database error'));

      await projectController.getPublicProject(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('createProject', () => {
    it('should create project for nonprofit user', async () => {
      req.body = {
        title: 'New Project',
        problem: 'Test problem',
        outcomes: 'Expected outcomes',
        methods_required: 'Survey, Analysis',
        budget_min: 1000,
        budget_max: 5000,
        timeline: '3 months',
        data_sensitivity: 'low'
      };

      const mockUser = {
        id: 1,
        role: 'nonprofit',
        org_id: 1
      };

      const mockOrg = {
        id: 1,
        name: 'Test Org'
      };

      const mockProject = {
        project_id: 1,
        ...req.body,
        org_id: 1,
        status: 'draft'
      };

      User.findByPk.mockResolvedValue(mockUser);
      Organization.findByPk.mockResolvedValue(mockOrg);
      Project.create.mockResolvedValue(mockProject);

      await projectController.createProject(req, res);

      expect(Project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Project',
          org_id: 1
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 403 if user is not nonprofit', async () => {
      req.user.role = 'researcher';

      const mockUser = {
        id: 1,
        role: 'researcher'
      };

      User.findByPk.mockResolvedValue(mockUser);

      await projectController.createProject(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only nonprofit users can create projects'
      });
    });

    it('should return 404 if user has no organization', async () => {
      const mockUser = {
        id: 1,
        role: 'nonprofit',
        org_id: null
      };

      User.findByPk.mockResolvedValue(mockUser);

      await projectController.createProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Organization not found. Please complete your organization profile first.'
      });
    });

    it('should validate required fields', async () => {
      req.body = {}; // Missing required fields
      
      const mockUser = {
        id: 1,
        role: 'nonprofit',
        org_id: 1
      };

      const mockOrganization = {
        id: 1,
        name: 'Test Org'
      };

      User.findByPk.mockResolvedValue(mockUser);
      Organization.findByPk.mockResolvedValue(mockOrganization);

      await projectController.createProject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
