const schedule = require('node-schedule');
const { Op } = require('sequelize');
const { Attachment } = require('../database/models');
const { getStorageAdapter } = require('../services/storage');

async function purgeExpiredAttachments() {
  const now = new Date();
  const expired = await Attachment.findAll({
    where: {
      status: 'deleted',
      retention_expires_at: {
        [Op.ne]: null,
        [Op.lte]: now
      }
    },
    limit: 200,
    order: [['retention_expires_at', 'ASC']]
  });

  if (expired.length === 0) {
    return { scanned: 0, purged: 0 };
  }

  const storageAdapter = getStorageAdapter();
  let purged = 0;

  for (const attachment of expired) {
    try {
      if (attachment.storage_key) {
        await storageAdapter.delete(attachment.storage_key);
      }
      await attachment.destroy();
      purged += 1;
    } catch (error) {
      console.error(`[attachmentRetentionCleanup] Failed to purge attachment ${attachment.id}:`, error.message);
    }
  }

  return {
    scanned: expired.length,
    purged
  };
}

function scheduleAttachmentRetentionCleanup() {
  const cron = process.env.ATTACHMENT_RETENTION_CLEANUP_CRON || '30 2 * * *';

  schedule.scheduleJob(cron, async () => {
    try {
      const result = await purgeExpiredAttachments();
      console.log('[attachmentRetentionCleanup] Completed:', result);
    } catch (error) {
      console.error('[attachmentRetentionCleanup] Failed:', error.message);
    }
  });

  console.log(`[attachmentRetentionCleanup] Scheduled with cron: ${cron}`);
}

module.exports = {
  purgeExpiredAttachments,
  scheduleAttachmentRetentionCleanup
};
