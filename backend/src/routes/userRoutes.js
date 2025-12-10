const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// User profile routes
router.get('/me', userController.getUserProfile);
router.put('/me', userController.updateUserProfile);

// Password management
router.put('/me/password', userController.changePassword);

// Notification preferences
router.get('/me/preferences', userController.getPreferences);
router.put('/me/preferences', userController.updatePreferences);

// Account deletion (soft delete)
router.delete('/me', userController.deleteAccount);

module.exports = router;
