/**
 * Unit Tests for User Controller
 */

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn()
  },
  EmailVerification: {
    upsertForUser: jest.fn()
  },
  UserPreferences: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Organization: {},
  ResearcherProfile: {}
}));

jest.mock('../../src/services/emailService', () => ({
  sendVerificationEmail: jest.fn(),
  sendNotificationEmail: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-verification-token')
}));

jest.mock('../../src/utils/auditLogger', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: {
    PROFILE_UPDATE: 'PROFILE_UPDATE',
    PASSWORD_CHANGE: 'PASSWORD_CHANGE',
    EMAIL_CHANGE: 'EMAIL_CHANGE',
    PREFERENCES_UPDATE: 'PREFERENCES_UPDATE',
    ACCOUNT_DELETE: 'ACCOUNT_DELETE'
  }
}));

const bcrypt = require('bcryptjs');
const emailService = require('../../src/services/emailService');
const userController = require('../../src/controllers/userController');
const { User, EmailVerification, UserPreferences } = require('../../src/database/models');

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

  describe('updateUserProfile', () => {
    it('updates and trims name', async () => {
      req.body = { name: '  Updated Name  ' };
      const mockUser = { id: 1, name: 'Old Name', email: 'test@example.com', save: jest.fn().mockResolvedValue(true) };
      const updatedUser = { id: 1, name: 'Updated Name', email: 'test@example.com' };

      User.findByPk.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(updatedUser);
      await userController.updateUserProfile(req, res);

      expect(mockUser.name).toBe('Updated Name');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('triggers re-verification when email changes', async () => {
      req.body = { email: 'newemail@example.com' };
      const mockUser = { id: 1, name: 'Test User', email: 'old@example.com', save: jest.fn().mockResolvedValue(true) };

      User.findByPk.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(mockUser);
      User.findOne.mockResolvedValue(null);

      await userController.updateUserProfile(req, res);

      expect(EmailVerification.upsertForUser).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('newemail@example.com', 'Test User', expect.any(String));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailVerificationSent: true }));
    });
  });

  describe('changePassword', () => {
    it('changes password using password_hash and requires relogin', async () => {
      req.body = { currentPassword: 'OldPass123!', newPassword: 'NewPass123!' };
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'old_hashed_password',
        save: jest.fn().mockResolvedValue(true)
      };

      User.findByPk.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('new_hashed_password');

      await userController.changePassword(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('OldPass123!', 'old_hashed_password');
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 10);
      expect(mockUser.password_hash).toBe('new_hashed_password');
      expect(emailService.sendNotificationEmail).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Password changed successfully', requireReLogin: true });
    });

    it('rejects weak passwords', async () => {
      req.body = { currentPassword: 'OldPass123!', newPassword: 'weakpassword' };

      await userController.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('Password must be at least 8 characters') });
    });
  });

  describe('updatePreferences', () => {
    it('updates preferences successfully', async () => {
      req.body = { email_notifications: false, email_messages: true };
      const mockPreferences = { update: jest.fn().mockResolvedValue(true) };
      UserPreferences.findOne.mockResolvedValue(mockPreferences);

      await userController.updatePreferences(req, res);

      expect(mockPreferences.update).toHaveBeenCalledWith({ email_notifications: false, email_messages: true });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
