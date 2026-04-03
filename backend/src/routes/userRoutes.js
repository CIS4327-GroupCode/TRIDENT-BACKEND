const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const ratingController = require('../controllers/ratingController');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { User } = require('../database/models');
const { Op } = require('sequelize');

const passwordChangeLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 5,
	keySelector: (req) => `${req.ip}:${req.user?.id || 'anonymous'}`,
});

function getUserSearchableColumns() {
	try {
		const attributes = User.getAttributes ? User.getAttributes() : User.rawAttributes || {};
		return Object.keys(attributes);
	} catch (err) {
		return [];
	}
}

function getSafeUserDisplayName(user) {
	if (!user) return 'Unknown User';

	const firstName = typeof user.first_name === 'string' ? user.first_name.trim() : '';
	const lastName = typeof user.last_name === 'string' ? user.last_name.trim() : '';
	const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

	if (typeof user.name === 'string' && user.name.trim()) return user.name.trim();
	if (fullName) return fullName;
	if (typeof user.email === 'string' && user.email.trim()) return user.email.trim();

	return `User #${user.id}`;
}

// Public routes (no authentication required)
router.get('/browse/researchers', userController.browseResearchers);
router.get('/:userId/ratings', ratingController.getUserRatings);
router.get('/:userId/ratings/given', ratingController.getRatingsGivenByUser);
router.get('/:userId/ratings/summary', ratingController.getUserRatingSummary);

router.get('/search/chat-users', authenticate, async (req, res) => {
	try {
		const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';

		if (!rawQuery) {
			return res.json({
				success: true,
				users: [],
			});
		}

		const availableColumns = getUserSearchableColumns();
		const searchableConditions = [];

		if (availableColumns.includes('name')) {
			searchableConditions.push({
				name: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (availableColumns.includes('email')) {
			searchableConditions.push({
				email: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (availableColumns.includes('first_name')) {
			searchableConditions.push({
				first_name: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (availableColumns.includes('last_name')) {
			searchableConditions.push({
				last_name: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (searchableConditions.length === 0) {
			return res.json({
				success: true,
				users: [],
			});
		}

		const selectedAttributes = ['id'];

		for (const column of ['name', 'email', 'first_name', 'last_name', 'role']) {
			if (availableColumns.includes(column)) {
				selectedAttributes.push(column);
			}
		}

		const users = await User.findAll({
			where: {
				id: { [Op.ne]: req.user.id },
				[Op.or]: searchableConditions,
			},
			attributes: selectedAttributes,
			limit: 10,
		});

		return res.json({
			success: true,
			users: users.map((user) => ({
				id: user.id,
				name: getSafeUserDisplayName(user),
				email: user.email || '',
				role: user.role || null,
			})),
		});
	} catch (error) {
		console.error('CHAT USER SEARCH ERROR:', error);
		return res.status(500).json({
			success: false,
			error: 'INTERNAL_SERVER_ERROR',
		});
	}
});

router.get('/search/chat-users', authenticate, async (req, res) => {
	try {
		const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';

		if (!rawQuery) {
			return res.json({
				success: true,
				users: [],
			});
		}

		const availableColumns = getUserSearchableColumns();
		const searchableConditions = [];

		if (availableColumns.includes('name')) {
			searchableConditions.push({
				name: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (availableColumns.includes('email')) {
			searchableConditions.push({
				email: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (availableColumns.includes('first_name')) {
			searchableConditions.push({
				first_name: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (availableColumns.includes('last_name')) {
			searchableConditions.push({
				last_name: { [Op.iLike]: `%${rawQuery}%` },
			});
		}

		if (searchableConditions.length === 0) {
			return res.json({
				success: true,
				users: [],
			});
		}

		const selectedAttributes = ['id'];

		for (const column of ['name', 'email', 'first_name', 'last_name', 'role']) {
			if (availableColumns.includes(column)) {
				selectedAttributes.push(column);
			}
		}

		const users = await User.findAll({
			where: {
				id: { [Op.ne]: req.user.id },
				[Op.or]: searchableConditions,
			},
			attributes: selectedAttributes,
			limit: 10,
		});

		return res.json({
			success: true,
			users: users.map((user) => ({
				id: user.id,
				name: getSafeUserDisplayName(user),
				email: user.email || '',
				role: user.role || null,
			})),
		});
	} catch (error) {
		console.error('CHAT USER SEARCH ERROR:', error);
		return res.status(500).json({
			success: false,
			error: 'INTERNAL_SERVER_ERROR',
		});
	}
});

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