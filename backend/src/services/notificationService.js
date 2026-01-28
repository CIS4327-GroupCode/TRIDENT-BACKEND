const Notification = require('../database/models/Notification');
const { User, UserPreferences } = require('../database/models');
const emailService = require('./emailService');

/**
 * Notification Service
 * Provides helper functions for creating and managing notifications
 * Integrates with email service to send notifications via email when enabled
 */

/**
 * Check if user has notification preferences enabled for a specific type
 * Respects both global and type-specific toggles
 * @param {Object} preferences - User preferences object
 * @param {string} notificationType - Notification type to check
 * @returns {boolean} Whether notifications are enabled
 */
const isNotificationEnabled = (preferences, notificationType) => {
  // If no preferences, default to enabled
  if (!preferences) {
    return true;
  }

  // Check if in-app notifications are globally disabled
  if (preferences.inapp_notifications === false) {
    return false;
  }

  // Map notification types to preference fields for granular control
  const typeToPreference = {
    'message_received': 'inapp_messages',
    'new_match_available': 'inapp_matches',
    'milestone_created': 'inapp_notifications',
    'milestone_updated': 'inapp_notifications',
    'milestone_completed': 'inapp_notifications',
    'milestone_deadline_approaching': 'inapp_notifications',
    'milestone_overdue': 'inapp_notifications'
  };

  const preferenceField = typeToPreference[notificationType];
  if (preferenceField && preferences[preferenceField] === false) {
    return false;
  }

  // Default to enabled if no specific preference
  return true;
};

/**
 * Log notification failure to admin
 * @param {number} userId - ID of user notification was for
 * @param {string} type - Notification type
 * @param {Error} error - Error that occurred
 */
const logNotificationFailure = async (userId, type, error) => {
  try {
    // Find admin users
    const admins = await User.findAll({
      where: { role: 'admin' }
    });

    if (admins.length === 0) {
      console.error(`Failed to log notification error: no admins found. Original error: ${error.message}`);
      return;
    }

    // Create admin notification for each admin
    const failureNotifications = admins.map(admin => ({
      user_id: admin.id,
      type: 'system_announcement',
      title: 'Notification System Error',
      message: `Failed to create notification (type: ${type}) for user ${userId}. Error: ${error.message}`,
      link: '/admin/logs',
      metadata: {
        original_user_id: userId,
        notification_type: type,
        error_message: error.message
      },
      is_read: false
    }));

    await Notification.bulkCreate(failureNotifications);
    console.error(`Notification creation failed for user ${userId}, type ${type}:`, error);
  } catch (logError) {
    console.error('Failed to log notification failure to admin:', logError);
  }
};

/**
 * Create a notification for a user
 * Respects user notification preferences before creating
 * @param {Object} data - Notification data
 * @param {number} data.userId - ID of user to notify
 * @param {string} data.type - Notification type
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.link] - Optional link to related content
 * @param {Object} [data.metadata] - Optional metadata
 * @returns {Promise<Notification|null>} Created notification or null if user has disabled
 */
const createNotification = async ({ userId, type, title, message, link, metadata }) => {
  try {
    // Validate required fields
    if (!userId || !type || !title || !message) {
      throw new Error('Missing required notification fields');
    }

    // Check user preferences
    const preferences = await UserPreferences.findOne({
      where: { user_id: userId }
    });

    if (!isNotificationEnabled(preferences, type)) {
      // User has disabled this notification type; skip creation
      return null;
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

    // Send email notification if user has email notifications enabled
    if (preferences && preferences.email_notifications) {
      try {
        const user = await User.findByPk(userId);
        if (user && user.email) {
          await emailService.sendNotificationEmail(
            user.email,
            user.name,
            { type, title, message, link }
          );
        }
      } catch (emailError) {
        // Log but don't fail notification creation if email fails
        console.error(`Failed to send email notification to user ${userId}:`, emailError.message);
      }
    }

    return notification;
  } catch (error) {
    await logNotificationFailure(userId, type, error);
    // Don't throw; notification failures shouldn't block primary action
    return null;
  }
};

/**
 * Create notifications for multiple users
 * Respects user notification preferences for each recipient
 * @param {Array<number>} userIds - Array of user IDs
 * @param {Object} data - Notification data (same as createNotification)
 * @param {string} data.type - Notification type
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.link] - Optional link to related content
 * @param {Object} [data.metadata] - Optional metadata
 * @returns {Promise<Array<Notification>>} Created notifications (only for users who have enabled)
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

    // Fetch preferences for all users
    const preferencesMap = new Map();
    const userPrefs = await UserPreferences.findAll({
      where: { user_id: userIds }
    });

    userPrefs.forEach(pref => {
      preferencesMap.set(pref.user_id, pref);
    });

    // Filter users to notify (only those who have enabled)
    const usersToNotify = userIds.filter(userId => {
      const prefs = preferencesMap.get(userId) || null;
      return isNotificationEnabled(prefs, type);
    });

    if (usersToNotify.length === 0) {
      // All users have disabled this notification type
      return [];
    }

    // Create notifications only for users who have enabled
    const notifications = usersToNotify.map(userId => ({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
      metadata: metadata || null,
      is_read: false
    }));

    const created = await Notification.bulkCreate(notifications);

    // Send email notifications for users who have email notifications enabled
    const emailPrefs = userPrefs.filter(pref => pref.email_notifications);
    if (emailPrefs.length > 0) {
      const emailUserIds = emailPrefs.map(pref => pref.user_id);
      
      try {
        const users = await User.findAll({
          where: { id: emailUserIds },
          attributes: ['id', 'email', 'name']
        });

        // Send emails in parallel (non-blocking)
        const emailPromises = users.map(user => 
          emailService.sendNotificationEmail(
            user.email,
            user.name,
            { type, title, message, link }
          ).catch(error => {
            console.error(`Failed to send email to ${user.email}:`, error.message);
          })
        );

        // Don't await - let emails send asynchronously
        Promise.all(emailPromises).catch(err => {
          console.error('Bulk email notification error:', err);
        });
      } catch (emailError) {
        console.error('Failed to fetch users for email notifications:', emailError.message);
      }
    }

    return created;
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    // Log error to admins
    const firstUserId = userIds && userIds[0];
    if (firstUserId) {
      await logNotificationFailure(firstUserId, type, error);
    }
    // Return empty array; don't throw
    return [];
  }
};

module.exports = {
  createNotification,
  createBulkNotifications,
  isNotificationEnabled
};
