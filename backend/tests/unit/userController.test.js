/**
 * Unit Tests for User Controller
 * Tests user profile management and preferences
 */

// Mock dependencies BEFORE imports
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn()
  },
  UserPreferences: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Organization: {},
  ResearcherProfile: {}
}));

const bcrypt = require('bcrypt');
const userController = require('../../src/controllers/userController');
const { User, UserPreferences, Organization, ResearcherProfile } = require('../../src/database/models');

describe('User Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 1, email: 'test@example.com', role: 'researcher' },
      body: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getUserProfile', () => {
    it('should return user profile with all associations', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'researcher',
        created_at: new Date(),
        updated_at: new Date()
      };

      User.findByPk.mockResolvedValue(mockUser);

      await userController.getUserProfile(req, res);

      expect(User.findByPk).toHaveBeenCalledWith(1, expect.objectContaining({
        include: expect.arrayContaining([
          expect.objectContaining({ as: 'preferences' }),
          expect.objectContaining({ as: 'organization' }),
          expect.objectContaining({ as: 'researcherProfile' })
        ])
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });

    it('should return 404 if user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await userController.getUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should handle database errors', async () => {
      User.findByPk.mockRejectedValue(new Error('Database error'));

      await userController.getUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('updateUserProfile', () => {
    it('should update user name successfully', async () => {
      req.body = { name: 'Updated Name' };

      const mockUser = {
        id: 1,
        name: 'Old Name',
        email: 'test@example.com',
        save: jest.fn().mockResolvedValue(true)
      };

      const updatedUser = {
        id: 1,
        name: 'Updated Name',
        email: 'test@example.com'
      };

      User.findByPk
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      await userController.updateUserProfile(req, res);

      expect(mockUser.name).toBe('Updated Name');
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Profile updated successfully',
          user: updatedUser
        })
      );
    });

    it('should update user email if not already taken', async () => {
      req.body = { email: 'newemail@example.com' };

      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'old@example.com',
        save: jest.fn().mockResolvedValue(true)
      };

      User.findByPk
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser);
      User.findOne.mockResolvedValue(null); // Email not taken

      await userController.updateUserProfile(req, res);

      expect(mockUser.email).toBe('newemail@example.com');
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 409 if new email is already taken', async () => {
      req.body = { email: 'taken@example.com' };

      const mockSave = jest.fn();
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        save: mockSave
      };

      User.findByPk.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValue({ id: 2, email: 'taken@example.com' });

      await userController.updateUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email already in use' });
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 if no update fields provided', async () => {
      req.body = {};

      await userController.updateUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No update fields provided' });
    });

    it('should return 404 if user not found', async () => {
      req.body = { name: 'New Name' };
      User.findByPk.mockResolvedValue(null);

      await userController.updateUserProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('changePassword', () => {
    it('should change password with valid current password', async () => {
      req.body = {
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword456'
      };

      const mockUser = {
        id: 1,
        password: 'old_hashed_password',
        save: jest.fn().mockResolvedValue(true)
      };

      User.findByPk.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('new_hashed_password');

      await userController.changePassword(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpassword123', 'old_hashed_password');
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword456', 10);
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password changed successfully' });
    });

    it('should return 400 if required fields missing', async () => {
      req.body = { currentPassword: 'oldpassword' };

      await userController.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Current password and new password are required' 
      });
    });

    it('should return 400 if new password is too short', async () => {
      req.body = {
        currentPassword: 'oldpassword123',
        newPassword: 'short'
      };

      await userController.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'New password must be at least 8 characters long' 
      });
    });

    it('should return 401 if current password is incorrect', async () => {
      req.body = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword456'
      };

      const mockSave = jest.fn();
      const mockUser = {
        id: 1,
        password: 'correct_hashed_password',
        save: mockSave
      };

      User.findByPk.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await userController.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      req.body = {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123'
      };

      User.findByPk.mockResolvedValue(null);

      await userController.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('getPreferences', () => {
    it('should return existing preferences', async () => {
      const mockPreferences = {
        user_id: 1,
        email_notifications: true,
        email_messages: true
      };

      UserPreferences.findOne.mockResolvedValue(mockPreferences);

      await userController.getPreferences(req, res);

      expect(UserPreferences.findOne).toHaveBeenCalledWith({ where: { user_id: 1 } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ preferences: mockPreferences });
    });

    it('should create default preferences if none exist', async () => {
      const mockPreferences = {
        user_id: 1,
        email_notifications: true
      };

      UserPreferences.findOne.mockResolvedValue(null);
      UserPreferences.create.mockResolvedValue(mockPreferences);

      await userController.getPreferences(req, res);

      expect(UserPreferences.create).toHaveBeenCalledWith({ user_id: 1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ preferences: mockPreferences });
    });

    it('should handle database errors', async () => {
      UserPreferences.findOne.mockRejectedValue(new Error('Database error'));

      await userController.getPreferences(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('updatePreferences', () => {
    it('should update existing preferences', async () => {
      req.body = {
        email_notifications: false,
        email_messages: true
      };

      const mockPreferences = {
        user_id: 1,
        email_notifications: true,
        update: jest.fn().mockResolvedValue(true)
      };

      UserPreferences.findOne.mockResolvedValue(mockPreferences);

      await userController.updatePreferences(req, res);

      expect(mockPreferences.update).toHaveBeenCalledWith({
        email_notifications: false,
        email_messages: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Preferences updated successfully'
        })
      );
    });

    it('should create preferences if none exist', async () => {
      req.body = {
        email_notifications: false
      };

      const mockPreferences = {
        user_id: 1,
        email_notifications: false
      };

      UserPreferences.findOne.mockResolvedValue(null);
      UserPreferences.create.mockResolvedValue(mockPreferences);

      await userController.updatePreferences(req, res);

      expect(UserPreferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 1,
          email_notifications: false
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should ignore non-boolean values', async () => {
      req.body = {
        email_notifications: 'invalid',
        email_messages: true
      };

      const mockPreferences = {
        update: jest.fn()
      };

      UserPreferences.findOne.mockResolvedValue(mockPreferences);

      await userController.updatePreferences(req, res);

      expect(mockPreferences.update).toHaveBeenCalledWith({
        email_messages: true
      });
    });

    it('should ignore invalid field names', async () => {
      req.body = {
        invalid_field: true,
        email_messages: true
      };

      const mockPreferences = {
        update: jest.fn()
      };

      UserPreferences.findOne.mockResolvedValue(mockPreferences);

      await userController.updatePreferences(req, res);

      expect(mockPreferences.update).toHaveBeenCalledWith({
        email_messages: true
      });
    });

    it('should return 400 if no valid fields provided', async () => {
      req.body = {
        invalid_field: true,
        another_invalid: 'value'
      };

      await userController.updatePreferences(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'No valid preference fields provided' 
      });
    });
  });

  describe('deleteAccount', () => {
    it('should soft delete user account', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        destroy: jest.fn().mockResolvedValue(true)
      };

      User.findByPk.mockResolvedValue(mockUser);

      await userController.deleteAccount(req, res);

      expect(mockUser.destroy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('deleted successfully')
        })
      );
    });

    it('should return 404 if user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await userController.deleteAccount(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should handle database errors', async () => {
      const mockUser = {
        destroy: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      User.findByPk.mockResolvedValue(mockUser);

      await userController.deleteAccount(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
