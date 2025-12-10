const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :projectId
const milestoneController = require('../controllers/milestoneController');
const { authenticate, requireNonprofit } = require('../middleware/auth');

/**
 * All routes require authentication
 * Only nonprofit users can create/update/delete milestones
 * All project participants can view milestones
 */

// Get milestone statistics for a project
router.get('/stats', authenticate, milestoneController.getMilestoneStats);

// Create a new milestone
router.post('/', authenticate, requireNonprofit, milestoneController.createMilestone);

// Get all milestones for a project
router.get('/', authenticate, milestoneController.getMilestones);

// Get a specific milestone
router.get('/:id', authenticate, milestoneController.getMilestone);

// Update a milestone
router.put('/:id', authenticate, requireNonprofit, milestoneController.updateMilestone);

// Delete a milestone
router.delete('/:id', authenticate, requireNonprofit, milestoneController.deleteMilestone);

module.exports = router;
