const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const { authenticate, requireResearcher, requireNonprofit } = require('../middleware/auth');

/**
 * Public routes (require authentication)
 */

// Apply to a project (researcher only)
router.post(
  '/projects/:projectId/apply',
  authenticate,
  requireResearcher,
  applicationController.applyToProject
);

// Get researcher's own applications (researcher only)
router.get(
  '/',
  authenticate,
  requireResearcher,
  applicationController.getResearcherApplications
);

/**
 * Invitation routes
 */

// Invite a researcher to a project (nonprofit only)
router.post(
  '/invite',
  authenticate,
  requireNonprofit,
  applicationController.inviteResearcher
);

// Get researcher's invitations (researcher only)
router.get(
  '/invitations',
  authenticate,
  requireResearcher,
  applicationController.getResearcherInvitations
);

// Accept or decline an invitation (researcher only)
router.post(
  '/:applicationId/respond',
  authenticate,
  requireResearcher,
  applicationController.respondToInvitation
);

/**
 * Nonprofit-only routes
 */

// Get applications for a specific project (nonprofit only)
router.get(
  '/projects/:projectId',
  authenticate,
  requireNonprofit,
  applicationController.getProjectApplications
);

// Accept an application (nonprofit only)
router.post(
  '/:applicationId/accept',
  authenticate,
  requireNonprofit,
  applicationController.acceptApplication
);

// Reject an application (nonprofit only)
router.post(
  '/:applicationId/reject',
  authenticate,
  requireNonprofit,
  applicationController.rejectApplication
);

module.exports = router;
