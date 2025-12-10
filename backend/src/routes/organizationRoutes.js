const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const { authenticate, requireNonprofit } = require('../middleware/auth');

// All routes require authentication and nonprofit role
router.use(authenticate);
router.use(requireNonprofit);

// Organization settings routes
router.get('/me', organizationController.getOrganization);
router.put('/me', organizationController.updateOrganization);

module.exports = router;
