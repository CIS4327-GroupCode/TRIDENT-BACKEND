const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const authLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 10,
	keySelector: (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

const registerLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 5,
	keySelector: (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

const twoFactorSendLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 5,
	keySelector: (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

const twoFactorVerifyLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 5,
	keySelector: (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

// Register route
router.post('/register', registerLimiter, authController.register);
// Login route
router.post('/login', authLimiter, authController.login);
// Email verification routes
router.get('/verify-email', authController.verifyEmail); // GET for email link clicks
router.post('/verify-email', authController.verifyEmail); // POST for API calls
router.post('/resend-verification-email', authLimiter, authController.resendVerificationEmail);

// Password reset routes
router.post('/request-password-reset', authLimiter, authController.requestPasswordReset);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Enable 2 Factor authentication route
router.post('/2fa/send-enable', authenticate, twoFactorSendLimiter, authController.sendEnable2FACode);
router.post('/2fa/verify-enable', authenticate, twoFactorVerifyLimiter, authController.verifyEnable2FACode);


module.exports = router;
