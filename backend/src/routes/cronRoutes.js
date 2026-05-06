const express = require('express');
const cronController = require('../controllers/cronController');
const { validateCronRequest } = require('../middleware/cronAuth');

const router = express.Router();

router.use(validateCronRequest);

router.get('/notification-cleanup', cronController.runNotificationCleanup);
router.get('/milestone-deadlines', cronController.runMilestoneDeadlineChecks);
router.get('/match-generation', cronController.runMatchGeneration);

module.exports = router;