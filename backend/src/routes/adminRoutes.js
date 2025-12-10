const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserDetails);
router.put('/users/:id/status', adminController.updateUserStatus);
router.post('/users/:id/approve', adminController.approveUser);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/unsuspend', adminController.unsuspendUser);
router.delete('/users/:id/permanent', adminController.permanentlyDeleteUser);

// Project Management
router.get('/projects', adminController.getAllProjects);
router.get('/projects/pending', adminController.getPendingProjects);
router.get('/projects/:id', adminController.getProjectById);
router.put('/projects/:id/status', adminController.updateProjectStatus);
router.delete('/projects/:id', adminController.deleteProject);

// Project Moderation (UC10)
router.post('/projects/:id/approve', adminController.approveProject);
router.post('/projects/:id/reject', adminController.rejectProject);
router.post('/projects/:id/request-changes', adminController.requestProjectChanges);

// Milestone Management
router.get('/milestones', adminController.getAllMilestones);
router.delete('/milestones/:id', adminController.deleteMilestone);

// Organization Management
router.get('/organizations', adminController.getAllOrganizations);
router.delete('/organizations/:id', adminController.deleteOrganization);

module.exports = router;
