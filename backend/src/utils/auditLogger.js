const { AuditLog } = require('../database/models');

const AUDIT_ACTIONS = {
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  EMAIL_CHANGE: 'EMAIL_CHANGE',
  PREFERENCES_UPDATE: 'PREFERENCES_UPDATE',
  ACCOUNT_DELETE: 'ACCOUNT_DELETE',
  ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  RESEARCHER_PROFILE_UPDATE: 'RESEARCHER_PROFILE_UPDATE',
  ACADEMIC_HISTORY_CREATE: 'ACADEMIC_HISTORY_CREATE',
  ACADEMIC_HISTORY_UPDATE: 'ACADEMIC_HISTORY_UPDATE',
  ACADEMIC_HISTORY_DELETE: 'ACADEMIC_HISTORY_DELETE',
  CERTIFICATION_CREATE: 'CERTIFICATION_CREATE',
  CERTIFICATION_UPDATE: 'CERTIFICATION_UPDATE',
  CERTIFICATION_DELETE: 'CERTIFICATION_DELETE',
  AGREEMENT_CREATED: 'AGREEMENT_CREATED',
  AGREEMENT_UPDATED: 'AGREEMENT_UPDATED',
  AGREEMENT_PARTY_SIGNED: 'AGREEMENT_PARTY_SIGNED',
  AGREEMENT_SIGNED: 'AGREEMENT_SIGNED',
  AGREEMENT_ACTIVATED: 'AGREEMENT_ACTIVATED',
  AGREEMENT_TERMINATED: 'AGREEMENT_TERMINATED'
};

async function logAudit({ actorId, action, entityType, entityId, metadata = {} }) {
  try {
    await AuditLog.create({
      actor_id: actorId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata,
      timestamp: new Date(),
    });
  } catch (error) {
    if (String(error.message || '').includes('column "metadata"')) {
      try {
        await AuditLog.sequelize.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, timestamp)
           VALUES (:actor_id, :action, :entity_type, :entity_id, :timestamp)`,
          {
            replacements: {
              actor_id: actorId || null,
              action,
              entity_type: entityType,
              entity_id: entityId || null,
              timestamp: new Date(),
            },
          }
        );
        return;
      } catch (fallbackError) {
        console.error('Audit logging fallback failed:', fallbackError.message);
        return;
      }
    }

    console.error('Audit logging failed:', error.message);
  }
}

module.exports = {
  AUDIT_ACTIONS,
  logAudit,
};
