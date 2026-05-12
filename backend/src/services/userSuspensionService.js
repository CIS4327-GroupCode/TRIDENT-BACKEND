const notificationService = require('./notificationService');

async function suspendUserAccount({ targetUser, reason, metadata = {} }) {
  if (!targetUser) {
    throw new Error('Target user is required');
  }

  if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
    return {
      status: 'blocked',
      reason: 'Cannot suspend admin accounts'
    };
  }

  if (targetUser.deleted_at) {
    return {
      status: 'already_suspended',
      reason: 'User account already suspended'
    };
  }

  await targetUser.destroy();

  try {
    await notificationService.createNotification({
      userId: targetUser.id,
      type: 'user_suspended',
      title: 'Account Suspended',
      message: `Your account has been suspended. Reason: ${reason || 'Not provided'}.`,
      link: '/contact',
      metadata: {
        reason: reason || null,
        ...metadata
      }
    });
  } catch (notificationError) {
    console.error('Failed to create suspension notification:', notificationError);
  }

  return {
    status: 'suspended',
    reason: reason || 'No reason provided'
  };
}

module.exports = {
  suspendUserAccount
};