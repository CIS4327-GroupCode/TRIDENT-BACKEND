const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const ratingController = require('../controllers/ratingController');
const agreementController = require('../controllers/agreementController');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Admin Creation (super_admin only)
router.post('/users/create-admin', requireSuperAdmin, adminController.createAdmin);

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

// Attachment Governance (UC13)
router.get('/attachments', adminController.getAllAttachments);
router.get('/attachments/stats', adminController.getAttachmentStats);
router.delete('/attachments/:id', adminController.forceDeleteAttachment);

// Rating Moderation (UC5)
router.get('/ratings', ratingController.getAdminRatings);
router.get('/ratings/stats', ratingController.getAdminRatingStats);
router.put('/ratings/:ratingId/moderate', ratingController.moderateRating);

// Agreement Governance (UC11)
router.get('/agreements', agreementController.adminListAgreements);
router.get('/agreements/stats', agreementController.adminAgreementStats);

// SLA Alerts (UC12)
router.get('/alerts', adminController.getAdminAlerts);

// Data Export (UC12)
router.get('/export/:entity', adminController.exportAdminData);

module.exports = router;
