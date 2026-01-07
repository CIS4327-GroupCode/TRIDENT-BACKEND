/**
 * Notification Cleanup Task
 * Archives notifications older than 15 days, hard deletes archived notifications older than 30 days
 */

const { Notification } = require('../database/models');
const { Op } = require('sequelize');

/**
 * Archive old notifications (mark as archived after 15 days)
 * Called periodically or on-demand
 */
exports.archiveOldNotifications = async () => {
  try {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    const [affectedCount] = await Notification.update(
      { archived: true },
      {
        where: {
          created_at: { [Op.lt]: fifteenDaysAgo },
          archived: false // Only archive if not already archived
        }
      }
    );

    console.log(`[Notification Cleanup] Archived ${affectedCount} old notifications`);
    return affectedCount;
  } catch (error) {
    console.error('[Notification Cleanup] Error archiving notifications:', error);
    throw error;
  }
};

/**
 * Hard delete archived notifications older than 30 days
 * Called periodically or on-demand
 */
exports.deleteArchivedNotifications = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deletedCount = await Notification.destroy({
      where: {
        created_at: { [Op.lt]: thirtyDaysAgo },
        archived: true
      }
    });

    console.log(`[Notification Cleanup] Hard deleted ${deletedCount} archived notifications`);
    return deletedCount;
  } catch (error) {
    console.error('[Notification Cleanup] Error deleting notifications:', error);
    throw error;
  }
};

/**
 * Run complete cleanup routine (archive old, delete very old archived)
 */
exports.runCleanup = async () => {
  try {
    console.log('[Notification Cleanup] Starting cleanup routine...');
    
    const archivedCount = await exports.archiveOldNotifications();
    const deletedCount = await exports.deleteArchivedNotifications();

    console.log(
      `[Notification Cleanup] Cleanup complete. Archived: ${archivedCount}, Deleted: ${deletedCount}`
    );

    return { archivedCount, deletedCount };
  } catch (error) {
    console.error('[Notification Cleanup] Cleanup failed:', error);
    throw error;
  }
};

/**
 * Schedule cleanup to run daily at 2 AM
 * Call this in your server startup (index.js or similar)
 */
exports.scheduleCleanup = () => {
  const schedule = require('node-schedule');

  // Run at 2 AM every day
  const job = schedule.scheduleJob('0 2 * * *', async () => {
    console.log('[Notification Cleanup] Scheduled cleanup starting...');
    try {
      await exports.runCleanup();
    } catch (error) {
      console.error('[Notification Cleanup] Scheduled cleanup failed:', error);
    }
  });

  console.log('[Notification Cleanup] Daily cleanup scheduled for 2 AM');
  return job;
};
