const crypto = require('crypto');

const { UploadSecurityIncident } = require('../database/models');
const { scanAttachment } = require('./scanService');
const { suspendUserAccount } = require('./userSuspensionService');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLogger');

const MALICIOUS_UPLOAD_SUSPENSION_REASON = 'uploaded malicious file';

function buildContentHash(buffer) {
  if (!buffer) {
    return null;
  }

  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function shouldAutoSuspend(user) {
  return Boolean(user && ['researcher', 'nonprofit'].includes(user.role));
}

async function createIncident({ user, surface, route, file, contentHash, scanStatus, reason, actionTaken, autoSuspensionState, metadata = {} }) {
  return UploadSecurityIncident.create({
    user_id: user?.id || null,
    surface,
    route: route || null,
    file_name: file.originalname,
    mimetype: file.mimetype,
    size: file.size || file.buffer?.length || 0,
    content_hash: contentHash,
    scan_status: scanStatus,
    reason: reason || null,
    action_taken: actionTaken,
    auto_suspension_state: autoSuspensionState,
    metadata
  });
}

async function logIncidentAudit({ actorId, action, incident, metadata }) {
  await logAudit({
    actorId,
    action,
    entityType: 'UploadSecurityIncident',
    entityId: incident.id,
    metadata
  });
}

async function evaluateUploadSecurity({ user, file, surface, route, metadata = {} }) {
  const contentHash = buildContentHash(file?.buffer);

  try {
    const scanResult = await scanAttachment({
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer
    });

    if (scanResult.clean) {
      return {
        accepted: true,
        contentHash,
        scanResult
      };
    }

    let suspension = { status: 'not_attempted' };

    if (shouldAutoSuspend(user)) {
      suspension = await suspendUserAccount({
        targetUser: user,
        reason: MALICIOUS_UPLOAD_SUSPENSION_REASON,
        metadata: {
          surface,
          route,
          file_name: file.originalname
        }
      });
    }

    const incident = await createIncident({
      user,
      surface,
      route,
      file,
      contentHash,
      scanStatus: scanResult.scanStatus || 'infected',
      reason: scanResult.reason || 'Suspicious file detected',
      actionTaken: suspension.status === 'suspended' || suspension.status === 'already_suspended'
        ? 'rejected_and_suspended'
        : 'rejected',
      autoSuspensionState: suspension.status,
      metadata: {
        ...metadata,
        suspension_reason: suspension.reason || null
      }
    });

    await logIncidentAudit({
      actorId: user?.id || null,
      action: AUDIT_ACTIONS.UPLOAD_SECURITY_REJECTED,
      incident,
      metadata: {
        surface,
        route,
        scan_status: scanResult.scanStatus || 'infected',
        reason: scanResult.reason || null,
        auto_suspension_state: suspension.status
      }
    });

    if (suspension.status === 'suspended' || suspension.status === 'already_suspended') {
      await logIncidentAudit({
        actorId: user?.id || null,
        action: AUDIT_ACTIONS.UPLOAD_SECURITY_USER_SUSPENDED,
        incident,
        metadata: {
          surface,
          route,
          user_id: user?.id || null,
          suspension_status: suspension.status,
          suspension_reason: MALICIOUS_UPLOAD_SUSPENSION_REASON
        }
      });
    }

    return {
      accepted: false,
      incident,
      contentHash,
      scanResult,
      statusCode: 422,
      errorCode: 'MALICIOUS_UPLOAD_REJECTED',
      message: 'Upload rejected by upload security policy',
      reason: scanResult.reason || 'Suspicious file detected',
      accountSuspended: suspension.status === 'suspended' || suspension.status === 'already_suspended',
      suspensionStatus: suspension.status
    };
  } catch (error) {
    const incident = await createIncident({
      user,
      surface,
      route,
      file,
      contentHash,
      scanStatus: 'error',
      reason: error.message || 'Scan service failure',
      actionTaken: 'rejected_scan_error',
      autoSuspensionState: 'not_attempted',
      metadata
    });

    await logIncidentAudit({
      actorId: user?.id || null,
      action: AUDIT_ACTIONS.UPLOAD_SECURITY_SCAN_FAILED,
      incident,
      metadata: {
        surface,
        route,
        reason: error.message || 'Scan service failure'
      }
    });

    return {
      accepted: false,
      incident,
      contentHash,
      statusCode: 503,
      errorCode: 'UPLOAD_SCAN_FAILED',
      message: 'Upload rejected because file scanning is unavailable',
      reason: 'The file could not be verified safely. Please try again later.',
      accountSuspended: false,
      suspensionStatus: 'not_attempted'
    };
  }
}

module.exports = {
  evaluateUploadSecurity,
  MALICIOUS_UPLOAD_SUSPENSION_REASON
};