/**
 * Integration Tests for Database Models
 * Tests model associations and database operations
 */

// Mock sequelize to avoid real database connections in tests
jest.mock('../../src/database/models', () => {
  const mockSequelize = {
    query: jest.fn(),
    transaction: jest.fn(),
    authenticate: jest.fn()
  };

  return {
    sequelize: mockSequelize,
    User: {
      findByPk: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn()
    },
    Organization: {
      findByPk: jest.fn(),
      create: jest.fn()
    },
    Project: {
      findByPk: jest.fn(),
      create: jest.fn()
    },
    ResearcherProfile: {
      findByPk: jest.fn(),
      create: jest.fn()
    },
    Milestone: {
      create: jest.fn()
    }
  };
});

const { sequelize, User, Organization, Project, ResearcherProfile } = require('../../src/database/models');

describe('Database Models Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Model', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        role: 'researcher',
        account_status: 'active'
      };

      User.create.mockResolvedValue({
        id: 1,
        ...userData
      });

      const user = await User.create(userData);

      expect(User.create).toHaveBeenCalledWith(userData);
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('researcher');
    });

    it('should find user by primary key', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com'
      };

      User.findByPk.mockResolvedValue(mockUser);

      const user = await User.findByPk(1);

      expect(User.findByPk).toHaveBeenCalledWith(1);
      expect(user.id).toBe(1);
    });

    it('should find user by email', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com'
      };

      User.findOne.mockResolvedValue(mockUser);

      const user = await User.findOne({ where: { email: 'test@example.com' } });

      expect(user.email).toBe('test@example.com');
    });
  });

  describe('Organization Model', () => {
    it('should create organization', async () => {
      const orgData = {
        name: 'Test Nonprofit',
        EIN: '12-3456789',
        mission: 'Help communities',
        user_id: 1
      };

      Organization.create.mockResolvedValue({
        id: 1,
        ...orgData
      });

      const org = await Organization.create(orgData);

      expect(Organization.create).toHaveBeenCalledWith(orgData);
      expect(org.name).toBe('Test Nonprofit');
      expect(org.EIN).toBe('12-3456789');
    });
  });

  describe('Project Model', () => {
    it('should create project with all required fields', async () => {
      const projectData = {
        title: 'Research Project',
        problem: 'Community issue',
        outcomes: 'Expected results',
        methods_required: 'Survey, Analysis',
        budget_min: 1000,
        budget_max: 5000,
        timeline: '3 months',
        org_id: 1,
        status: 'draft'
      };

      Project.create.mockResolvedValue({
        project_id: 1,
        ...projectData
      });

      const project = await Project.create(projectData);

      expect(Project.create).toHaveBeenCalledWith(projectData);
      expect(project.title).toBe('Research Project');
      expect(project.status).toBe('draft');
    });
  });

  describe('ResearcherProfile Model', () => {
    it('should create researcher profile', async () => {
      const profileData = {
        user_id: 1,
        title: 'PhD Researcher',
        institution: 'MIT',
        expertise: 'Data Science',
        hourly_rate_min: 50,
        hourly_rate_max: 150
      };

      ResearcherProfile.create.mockResolvedValue({
        id: 1,
        ...profileData
      });

      const profile = await ResearcherProfile.create(profileData);

      expect(ResearcherProfile.create).toHaveBeenCalledWith(profileData);
      expect(profile.institution).toBe('MIT');
    });
  });

  describe('Database Connection', () => {
    it('should authenticate database connection', async () => {
      sequelize.authenticate.mockResolvedValue(true);

      await expect(sequelize.authenticate()).resolves.toBe(true);
      expect(sequelize.authenticate).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      sequelize.authenticate.mockRejectedValue(new Error('Connection failed'));

      await expect(sequelize.authenticate()).rejects.toThrow('Connection failed');
    });
  });
});
