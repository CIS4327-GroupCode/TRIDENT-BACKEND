const Notification = require('../database/models/Notification');

/**
 * Notification Service
 * Provides helper functions for creating and managing notifications
 */

/**
 * Create a notification for a user
 * @param {Object} data - Notification data
 * @param {number} data.userId - ID of user to notify
 * @param {string} data.type - Notification type
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.link] - Optional link to related content
 * @param {Object} [data.metadata] - Optional metadata
 * @returns {Promise<Notification>} Created notification
 */
const createNotification = async ({ userId, type, title, message, link, metadata }) => {
  try {
    // Validate required fields
    if (!userId || !type || !title || !message) {
      throw new Error('Missing required notification fields');
    }

    const notification = await Notification.create({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
      metadata: metadata || null,
      is_read: false
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Create notifications for multiple users
 * @param {Array<number>} userIds - Array of user IDs
 * @param {Object} data - Notification data (same as createNotification)
 * @param {string} data.type - Notification type
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.link] - Optional link to related content
 * @param {Object} [data.metadata] - Optional metadata
 * @returns {Promise<Array<Notification>>} Created notifications
 */
const createBulkNotifications = async (userIds, { type, title, message, link, metadata }) => {
  try {
    // Validate required fields
    if (!userIds || userIds.length === 0) {
      throw new Error('No user IDs provided');
    }
    if (!type || !title || !message) {
      throw new Error('Missing required notification fields');
    }

    const notifications = userIds.map(userId => ({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
      metadata: metadata || null,
      is_read: false
    }));

    const created = await Notification.bulkCreate(notifications);
    return created;
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    throw error;
  }
};

/**
 * Check if user has notification preferences enabled for a specific type
 * @param {Object} preferences - User preferences object
 * @param {string} notificationType - Notification type to check
 * @returns {boolean} Whether notifications are enabled
 */
const isNotificationEnabled = (preferences, notificationType) => {
  // If no preferences, default to enabled
  if (!preferences || !preferences.notification_settings) {
    return true;
  }

  const settings = preferences.notification_settings;

  // Check if in-app notifications are globally disabled
  if (settings.in_app_enabled === false) {
    return false;
  }

  // Check if this specific type is disabled
  if (settings.types && settings.types[notificationType] === false) {
    return false;
  }

  return true;
};

module.exports = {
  createNotification,
  createBulkNotifications,
  isNotificationEnabled
};
