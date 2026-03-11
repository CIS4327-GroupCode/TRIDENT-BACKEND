const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticate, requireNonprofit, requireResearcher } = require('../middleware/auth');

// Mount milestone routes under /projects/:projectId/milestones
const milestoneRoutes = require('./milestoneRoutes');
router.use('/:projectId/milestones', milestoneRoutes);

/**
 * Public routes (no authentication required)
 */

// Browse and search public projects
router.get('/browse', projectController.browseProjects);

// Featured projects for home page
router.get('/browse/featured', projectController.getFeaturedProjects);

// Public platform metrics for home page
router.get('/browse/metrics', projectController.getPublicPlatformMetrics);

// Get public project details by ID
router.get('/browse/:id', projectController.getPublicProject);

// Saved project routes (researchers only)
router.get('/saved', authenticate, requireResearcher, projectController.getSavedProjects);
router.post('/:id/save', authenticate, requireResearcher, projectController.saveProject);
router.delete('/:id/save', authenticate, requireResearcher, projectController.unsaveProject);

/**
 * All project management routes require authentication and nonprofit role
 */

// Create a new project
router.post('/', authenticate, requireNonprofit, projectController.createProject);

// Get all projects for current user's organization
router.get('/', authenticate, requireNonprofit, projectController.getProjects);

// Get a specific project by ID
router.get('/:id', authenticate, requireNonprofit, projectController.getProject);

// Update a project
router.put('/:id', authenticate, requireNonprofit, projectController.updateProject);

// Submit project for review
router.post('/:id/submit-for-review', authenticate, requireNonprofit, projectController.submitForReview);

// Delete a project
router.delete('/:id', authenticate, requireNonprofit, projectController.deleteProject);

module.exports = router;
