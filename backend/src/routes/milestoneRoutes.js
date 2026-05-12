const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :projectId
const milestoneController = require('../controllers/milestoneController');
const { authenticate, requireNonprofit, requireResearcher } = require('../middleware/auth');

/**
 * All routes require authentication
 * Only nonprofit users can create/update/delete milestones
 * All project participants can view milestones
 */

// Get milestone statistics for a project
router.get('/stats', authenticate, milestoneController.getMilestoneStats);

// Get and update researcher access matrix for this project
router.get('/access/researchers', authenticate, milestoneController.getProjectResearcherAccess);
router.put(
  '/access/researchers/:researcherId',
  authenticate,
  requireNonprofit,
  milestoneController.setProjectResearcherAccess
);

// Milestone creation requests by researchers
router.post('/requests', authenticate, requireResearcher, milestoneController.createMilestoneRequest);
router.get('/requests', authenticate, milestoneController.listMilestoneRequests);
router.post(
  '/requests/:requestId/approve',
  authenticate,
  requireNonprofit,
  milestoneController.approveMilestoneRequest
);
router.post(
  '/requests/:requestId/reject',
  authenticate,
  requireNonprofit,
  milestoneController.rejectMilestoneRequest
);

// Create a new milestone
router.post('/', authenticate, requireNonprofit, milestoneController.createMilestone);

// Get all milestones for a project
router.get('/', authenticate, milestoneController.getMilestones);

// Get milestone researcher assignments
router.get('/:id/assignments', authenticate, milestoneController.getMilestoneAssignments);

// Request milestone revision by assigned researcher
router.post('/:id/request-revision', authenticate, requireResearcher, milestoneController.requestMilestoneRevision);

// View and review milestone revision requests
router.get('/:id/revisions', authenticate, milestoneController.listMilestoneRevisionRequests);
router.post(
  '/:id/revisions/:revisionId/approve',
  authenticate,
  requireNonprofit,
  milestoneController.approveMilestoneRevisionRequest
);
router.post(
  '/:id/revisions/:revisionId/reject',
  authenticate,
  requireNonprofit,
  milestoneController.rejectMilestoneRevisionRequest
);

// Replace milestone researcher assignments
router.put('/:id/assignments', authenticate, requireNonprofit, milestoneController.setMilestoneAssignments);

// Remove a specific milestone researcher assignment
router.delete(
  '/:id/assignments/:researcherId',
  authenticate,
  requireNonprofit,
  milestoneController.removeMilestoneAssignment
);

// Get a specific milestone
router.get('/:id', authenticate, milestoneController.getMilestone);

// Update a milestone
router.put('/:id', authenticate, requireNonprofit, milestoneController.updateMilestone);

// Delete a milestone
router.delete('/:id', authenticate, requireNonprofit, milestoneController.deleteMilestone);

module.exports = router;
