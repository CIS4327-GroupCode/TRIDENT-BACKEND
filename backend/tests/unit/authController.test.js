jest.mock('../../src/models/authModel', () => ({
  findUserByEmail: jest.fn(),
  getUserByEmail: jest.fn(),
  createUser: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  EmailVerification: {
    create: jest.fn(),
    findByUserId: jest.fn(),
    findByToken: jest.fn()
  },
  PasswordReset: {
    findByToken: jest.fn(),
    upsertForUser: jest.fn()
  },
  User: {
    findByPk: jest.fn(),
    update: jest.fn()
  }
}));

jest.mock('../../src/database/models/TwoFactorCode', () => ({
  create: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../src/services/emailService', () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendTwoFactorCodeEmail: jest.fn()
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');
const authModel = require('../../src/models/authModel');
const { EmailVerification, PasswordReset, User } = require('../../src/database/models');
const TwoFactorCode = require('../../src/database/models/TwoFactorCode');
const emailService = require('../../src/services/emailService');

describe('Authentication Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';

    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('register', () => {
    it('registers a user and creates email verification', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Strong1!',
        role: 'researcher'
      };

      authModel.findUserByEmail.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed_password');
      authModel.createUser.mockResolvedValue({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'researcher',
        org_id: null
      });
      jwt.sign.mockReturnValue('verify-token');
      EmailVerification.create.mockResolvedValue({});
      emailService.sendVerificationEmail.mockResolvedValue({});

      await authController.register(req, res);

      expect(authModel.findUserByEmail).toHaveBeenCalledWith('john@example.com');
      expect(bcrypt.hash).toHaveBeenCalledWith('Strong1!', 10);
      expect(authModel.createUser).toHaveBeenCalled();
      expect(EmailVerification.create).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('john@example.com', 'John Doe', 'verify-token');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Account created successfully'),
        user: expect.objectContaining({ id: 1, email: 'john@example.com' })
      }));
    });

    it('returns 400 when password does not meet policy', async () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'weakpass',
        role: 'researcher'
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      });
    });

    it('requires organizationData for nonprofit users', async () => {
      req.body = {
        name: 'Org User',
        email: 'org@example.com',
        password: 'Strong1!',
        role: 'nonprofit'
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'organizationData is required for nonprofit role'
      }));
    });
  });

  describe('login', () => {
    it('returns generic invalid credentials when email is not found', async () => {
      req.body = { email: 'missing@example.com', password: 'Strong1!' };
      authModel.getUserByEmail.mockResolvedValue(null);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns generic invalid credentials when password is wrong', async () => {
      req.body = { email: 'john@example.com', password: 'Wrong1!' };
      authModel.getUserByEmail.mockResolvedValue({
        id: 1,
        email: 'john@example.com',
        password_hash: 'hash'
      });
      bcrypt.compare.mockResolvedValue(false);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('blocks login when email is not verified', async () => {
      req.body = { email: 'john@example.com', password: 'Strong1!' };
      authModel.getUserByEmail.mockResolvedValue({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        role: 'nonprofit',
        org_id: 88,
        password_hash: 'hash'
      });
      bcrypt.compare.mockResolvedValue(true);
      EmailVerification.findByUserId.mockResolvedValue({
        isExpired: () => false
      });

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'EMAIL_NOT_VERIFIED'
      }));
    });

    it('logs in verified users and returns org_id in user payload', async () => {
      req.body = { email: 'john@example.com', password: 'Strong1!' };
      authModel.getUserByEmail.mockResolvedValue({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        role: 'nonprofit',
        org_id: 77,
        created_at: new Date('2026-01-01'),
        password_hash: 'hash'
      });
      bcrypt.compare.mockResolvedValue(true);
      EmailVerification.findByUserId.mockResolvedValue(null);
      jwt.sign.mockReturnValue('jwt-token');

      await authController.login(req, res);

      expect(jwt.sign).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'jwt-token',
        user: expect.objectContaining({
          id: 1,
          role: 'nonprofit',
          org_id: 77
        })
      }));
    });
  });

  describe('requestPasswordReset', () => {
    it('responds generically when user email does not exist', async () => {
      req.body = { email: 'none@example.com' };
      authModel.getUserByEmail.mockResolvedValue(null);

      await authController.requestPasswordReset(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'If that email is registered, a password reset link has been sent.'
      });
    });

    it('creates reset token and sends email when user exists', async () => {
      req.body = { email: 'john@example.com' };
      authModel.getUserByEmail.mockResolvedValue({ id: 1, email: 'john@example.com', name: 'John' });
      jwt.sign.mockReturnValue('reset-token');
      PasswordReset.upsertForUser.mockResolvedValue({});
      emailService.sendPasswordResetEmail.mockResolvedValue({});

      await authController.requestPasswordReset(req, res);

      expect(PasswordReset.upsertForUser).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith('john@example.com', 'John', 'reset-token');
      expect(res.json).toHaveBeenCalledWith({
        message: 'If that email is registered, a password reset link has been sent.'
      });
    });
  });

  describe('verifyEmail', () => {
    it('returns 400 when verification token is missing', async () => {
      req.query = {};
      req.body = {};

      await authController.verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Verification token is required' });
    });

    it('verifies email successfully when token is valid', async () => {
      req.query = { token: 'verify-token' };
      jwt.verify.mockReturnValue({ purpose: 'email-verification' });
      const destroy = jest.fn().mockResolvedValue(undefined);
      EmailVerification.findByToken.mockResolvedValue({ isExpired: () => false, destroy });

      await authController.verifyEmail(req, res);

      expect(destroy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('resendVerificationEmail', () => {
    it('returns generic message when user is not found', async () => {
      req.body = { email: 'none@example.com' };
      authModel.getUserByEmail.mockResolvedValue(null);

      await authController.resendVerificationEmail(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'If that email is registered and unverified, a verification link has been sent.'
      });
    });

    it('returns already verified when no pending verification record exists', async () => {
      req.body = { email: 'john@example.com' };
      authModel.getUserByEmail.mockResolvedValue({ id: 1, email: 'john@example.com', name: 'John' });
      EmailVerification.findByUserId.mockResolvedValue(null);

      await authController.resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ALREADY_VERIFIED' }));
    });
  });

  describe('2FA enable flow', () => {
    it('returns 400 when enabling 2FA for already-enabled account', async () => {
      req.user = { id: 1 };
      User.findByPk.mockResolvedValue({ id: 1, email: 'john@example.com', name: 'John', mfa_enabled: true });

      await authController.sendEnable2FACode(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '2FA is already enabled' });
    });

    it('returns 400 when verify code is missing', async () => {
      req.user = { id: 1 };
      req.body = {};

      await authController.verifyEnable2FACode(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Code is required' });
    });

    it('rejects invalid 2FA code and increments attempts', async () => {
      req.user = { id: 1 };
      req.body = { code: '123456' };

      const save = jest.fn().mockResolvedValue(undefined);
      TwoFactorCode.findOne.mockResolvedValue({
        expires_at: new Date(Date.now() + 10000),
        attempts: 0,
        code_hash: 'hash',
        save
      });
      bcrypt.compare.mockResolvedValue(false);

      await authController.verifyEnable2FACode(req, res);

      expect(save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid code.' });
    });
  });

  describe('resetPassword', () => {
    it('enforces strong password policy on reset', async () => {
      req.body = { token: 'reset-token', password: 'weakpass' };

      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      });
    });

    it('resets password successfully with strong password', async () => {
      req.body = { token: 'reset-token', password: 'Strong1!' };
      jwt.verify.mockReturnValue({ userId: 1, purpose: 'password-reset' });

      const destroy = jest.fn().mockResolvedValue(undefined);
      PasswordReset.findByToken.mockResolvedValue({
        isExpired: () => false,
        destroy
      });

      const save = jest.fn().mockResolvedValue(undefined);
      User.findByPk.mockResolvedValue({ id: 1, save });
      bcrypt.hash.mockResolvedValue('new-hash');

      await authController.resetPassword(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('Strong1!', 10);
      expect(save).toHaveBeenCalled();
      expect(destroy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
