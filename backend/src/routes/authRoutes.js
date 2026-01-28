const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Register route
router.post('/register', authController.register);
// Login route
router.post('/login', authController.login);
// Email verification routes
router.get('/verify-email', authController.verifyEmail); // GET for email link clicks
router.post('/verify-email', authController.verifyEmail); // POST for API calls
router.post('/resend-verification-email', authController.resendVerificationEmail);

// Password reset routes
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);


module.exports = router;