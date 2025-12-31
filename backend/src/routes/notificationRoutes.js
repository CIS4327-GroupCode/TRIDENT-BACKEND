const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications with pagination and filtering
 * @access  Private
 * @params  ?limit=20&offset=0&unread=false&type=project_created
 */
router.get('/', notificationController.getNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count for badge
 * @access  Private
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/read-all', notificationController.markAllAsRead);

/**
 * @route   DELETE /api/notifications/read
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete('/read', notificationController.deleteAllRead);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark specific notification as read
 * @access  Private
 */
router.put('/:id/read', notificationController.markAsRead);

/**
 * @route   PUT /api/notifications/:id/unread
 * @desc    Mark specific notification as unread
 * @access  Private
 */
router.put('/:id/unread', notificationController.markAsUnread);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete specific notification
 * @access  Private
 */
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
