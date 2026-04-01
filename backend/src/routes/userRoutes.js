const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const ratingController = require('../controllers/ratingController');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const passwordChangeLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 5,
	keySelector: (req) => `${req.ip}:${req.user?.id || 'anonymous'}`,
});

// Public routes (no authentication required)
router.get('/browse/researchers', userController.browseResearchers);
router.get('/:userId/ratings', ratingController.getUserRatings);
router.get('/:userId/ratings/summary', ratingController.getUserRatingSummary);

// All routes below require authentication
router.use(authenticate);

// User profile routes
router.get('/me', userController.getUserProfile);
router.put('/me', userController.updateUserProfile);

// Password management
router.put('/me/password', passwordChangeLimiter, userController.changePassword);

// Notification preferences
router.get('/me/preferences', userController.getPreferences);
router.put('/me/preferences', userController.updatePreferences);

// Account deletion (soft delete)
router.delete('/me', userController.deleteAccount);

module.exports = router;
