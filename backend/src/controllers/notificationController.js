const Notification = require('../database/models/Notification');
const { Op } = require('sequelize');

/**
 * Get user notifications with pagination and filtering
 * @route GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      limit = 20, 
      offset = 0, 
      unread = false,
      type 
    } = req.query;

    // Validate and parse pagination parameters
    const parsedLimit = Math.min(Math.max(parseInt(limit), 1), 100);
    const parsedOffset = Math.max(parseInt(offset), 0);

    // Build query conditions
    const where = { user_id: userId };
    
    if (unread === 'true') {
      where.is_read = false;
    }
    
    if (type) {
      where.type = type;
    }

    // Fetch notifications with count
    const { count, rows } = await Notification.findAndCountAll({
      where,
      limit: parsedLimit,
      offset: parsedOffset,
      order: [['created_at', 'DESC']],
      attributes: [
        'id',
        'user_id',
        'type',
        'title',
        'message',
        'link',
        'is_read',
        'metadata',
        'created_at',
        'updated_at'
      ]
    });

    // Get unread count
    const unreadCount = await Notification.count({
      where: { user_id: userId, is_read: false }
    });

    res.json({
      notifications: rows,
      total: count,
      unreadCount,
      page: Math.floor(parsedOffset / parsedLimit) + 1,
      totalPages: Math.ceil(count / parsedLimit),
      limit: parsedLimit
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notifications',
      message: error.message 
    });
  }
};

/**
 * Get unread notification count
 * @route GET /api/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const unreadCount = await Notification.count({
      where: { user_id: userId, is_read: false }
    });
    
    res.json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ 
      error: 'Failed to fetch unread count',
      message: error.message 
    });
  }
};

/**
 * Mark notification as read
 * @route PUT /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    notification.is_read = true;
    await notification.save();

    res.json({ 
      message: 'Notification marked as read',
      notification: notification.toSafeObject()
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      error: 'Failed to mark notification as read',
      message: error.message 
    });
  }
};

/**
 * Mark notification as unread
 * @route PUT /api/notifications/:id/unread
 */
exports.markAsUnread = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    notification.is_read = false;
    await notification.save();

    res.json({ 
      message: 'Notification marked as unread',
      notification: notification.toSafeObject()
    });
  } catch (error) {
    console.error('Error marking notification as unread:', error);
    res.status(500).json({ 
      error: 'Failed to mark notification as unread',
      message: error.message 
    });
  }
};

/**
 * Mark all notifications as read
 * @route PUT /api/notifications/read-all
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const [updatedCount] = await Notification.update(
      { is_read: true },
      { where: { user_id: userId, is_read: false } }
    );

    res.json({ 
      message: 'All notifications marked as read',
      updatedCount 
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ 
      error: 'Failed to mark all as read',
      message: error.message 
    });
  }
};

/**
 * Delete notification
 * @route DELETE /api/notifications/:id
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    await notification.destroy();

    res.json({ 
      message: 'Notification deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ 
      error: 'Failed to delete notification',
      message: error.message 
    });
  }
};

/**
 * Delete all read notifications
 * @route DELETE /api/notifications/read
 */
exports.deleteAllRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const deletedCount = await Notification.destroy({
      where: { user_id: userId, is_read: true }
    });

    res.json({ 
      message: 'Read notifications deleted successfully',
      deletedCount 
    });
  } catch (error) {
    console.error('Error deleting read notifications:', error);
    res.status(500).json({ 
      error: 'Failed to delete read notifications',
      message: error.message 
    });
  }
};
