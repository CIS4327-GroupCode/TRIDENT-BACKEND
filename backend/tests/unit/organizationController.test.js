/**
 * Unit Tests for Organization Controller
 * Tests organization profile management for nonprofit users
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/database/models', () => ({
  Organization: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  User: {
    update: jest.fn()
  }
}));

const organizationController = require('../../src/controllers/organizationController');
const { Organization, User } = require('../../src/database/models');

describe('Organization Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 1, role: 'nonprofit' },
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getOrganization', () => {
    it('should return organization for authenticated user', async () => {
      const mockOrg = {
        id: 1,
        user_id: 1,
        name: 'Test Nonprofit',
        EIN: '12-3456789',
        mission: 'Test mission'
      };

      Organization.findOne.mockResolvedValue(mockOrg);

      await organizationController.getOrganization(req, res);

      expect(Organization.findOne).toHaveBeenCalledWith({
        where: { user_id: 1 }
      });
      expect(res.json).toHaveBeenCalledWith(mockOrg);
    });

    it('should return empty object if no organization exists', async () => {
      Organization.findOne.mockResolvedValue(null);

      await organizationController.getOrganization(req, res);

      expect(res.json).toHaveBeenCalledWith({});
    });

    it('should handle database errors', async () => {
      Organization.findOne.mockRejectedValue(new Error('Database error'));

      await organizationController.getOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    });
  });

  describe('updateOrganization', () => {
    it('should create new organization if none exists', async () => {
      req.body = {
        name: 'New Nonprofit',
        EIN: '98-7654321',
        mission: 'Help people',
        focus_tags: ['education', 'health']
      };

      const mockNewOrg = {
        id: 2,
        user_id: 1,
        ...req.body
      };

      Organization.findOne.mockResolvedValue(null);
      Organization.create.mockResolvedValue(mockNewOrg);
      User.update.mockResolvedValue([1]);

      await organizationController.updateOrganization(req, res);

      expect(Organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Nonprofit',
          EIN: '98-7654321',
          user_id: 1
        })
      );
      expect(User.update).toHaveBeenCalledWith(
        { org_id: 2 },
        { where: { id: 1 } }
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should update existing organization', async () => {
      req.body = {
        name: 'Updated Nonprofit',
        mission: 'Updated mission'
      };

      const mockOrg = {
        id: 1,
        user_id: 1,
        name: 'Old Name',
        update: jest.fn().mockResolvedValue(true)
      };

      Organization.findOne.mockResolvedValue(mockOrg);

      await organizationController.updateOrganization(req, res);

      expect(mockOrg.update).toHaveBeenCalledWith({
        name: 'Updated Nonprofit',
        mission: 'Updated mission'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should only allow nonprofit users to update organization', async () => {
      req.user.role = 'researcher';

      await organizationController.updateOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only nonprofit users can update organization settings'
      });
    });

    it('should return 400 if no valid update fields provided', async () => {
      req.body = { invalid_field: 'test' };

      await organizationController.updateOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No valid update fields provided'
      });
    });

    it('should filter out disallowed fields', async () => {
      req.body = {
        name: 'Test',
        id: 999, // Should be filtered out
        user_id: 999 // Should be filtered out
      };

      const mockOrg = {
        id: 1,
        update: jest.fn().mockResolvedValue(true)
      };

      Organization.findOne.mockResolvedValue(mockOrg);

      await organizationController.updateOrganization(req, res);

      expect(mockOrg.update).toHaveBeenCalledWith({ name: 'Test' });
      expect(mockOrg.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 999 })
      );
    });

    it('should handle database errors', async () => {
      req.body = { name: 'Test' };

      Organization.findOne.mockRejectedValue(new Error('Database error'));

      await organizationController.updateOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
