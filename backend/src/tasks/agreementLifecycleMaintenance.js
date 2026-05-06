const schedule = require('node-schedule');
const { Op } = require('sequelize');
const { Contract, sequelize } = require('../database/models');
const { recordAnomaly } = require('../utils/agreementObservability');

const NON_TERMINAL_STATUSES = [
  'draft',
  'internal_review',
  'counterparty_review',
  'changes_requested',
  'approved_for_signature',
  'pending_signature',
  'executed',
  'effective',
  'active'
];

async function expireEligibleAgreements({ dryRun = false, limit = 200 } = {}) {
  const now = new Date();

  const candidates = await Contract.findAll({
    where: {
      status: { [Op.in]: NON_TERMINAL_STATUSES },
      expires_at: {
        [Op.ne]: null,
        [Op.lte]: now
      }
    },
    order: [['expires_at', 'ASC']],
    limit
  });

  if (dryRun) {
    return {
      scanned: candidates.length,
      expired: 0,
      dryRun: true
    };
  }

  let expired = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const locked = await Contract.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!locked) {
          return false;
        }

        if (!NON_TERMINAL_STATUSES.includes(locked.status)) {
          return false;
        }

        if (!locked.expires_at || locked.expires_at > now) {
          return false;
        }

        locked.status = 'expired';
        locked.is_current_version = false;
        await locked.save({ transaction });
        return true;
      });

      if (result) {
        expired += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`[agreementLifecycleMaintenance] Failed to expire agreement ${candidate.id}:`, error.message);
    }
  }

  return {
    scanned: candidates.length,
    expired,
    failed,
    dryRun: false
  };
}

async function scanAgreementAnomalies({ staleSignatureHours = 72, sampleLimit = 100 } = {}) {
  const now = Date.now();
  const staleCutoff = new Date(now - staleSignatureHours * 60 * 60 * 1000);

  const [duplicateCurrentRows, stalePendingRows, executedMissingArtifactRows] = await Promise.all([
    Contract.findAll({
      attributes: ['application_id', 'template_type'],
      where: {
        is_current_version: true,
        status: { [Op.in]: NON_TERMINAL_STATUSES }
      },
      group: ['application_id', 'template_type'],
      having: sequelize.literal('COUNT(*) > 1'),
      limit: sampleLimit
    }),
    Contract.findAll({
      attributes: ['id', 'updated_at', 'nonprofit_signed_at', 'researcher_signed_at'],
      where: {
        status: 'pending_signature',
        updated_at: { [Op.lte]: staleCutoff }
      },
      order: [['updated_at', 'ASC']],
      limit: sampleLimit
    }),
    Contract.findAll({
      attributes: ['id', 'status', 'storage_key', 'checksum'],
      where: {
        status: 'executed',
        [Op.or]: [{ storage_key: null }, { checksum: null }]
      },
      limit: sampleLimit
    })
  ]);

  for (const row of duplicateCurrentRows) {
    recordAnomaly('duplicate_current_version_by_application_template', {
      application_id: row.application_id,
      template_type: row.template_type
    });
  }

  for (const row of stalePendingRows) {
    recordAnomaly('stale_pending_signature', {
      agreement_id: row.id,
      updated_at: row.updated_at
    });
  }

  for (const row of executedMissingArtifactRows) {
    recordAnomaly('executed_missing_artifact_or_checksum', {
      agreement_id: row.id
    });
  }

  return {
    staleSignatureHours,
    sampleLimit,
    duplicateCurrentVersionPairs: duplicateCurrentRows.length,
    stalePendingSignatures: stalePendingRows.length,
    executedMissingArtifacts: executedMissingArtifactRows.length
  };
}

async function runAgreementLifecycleMaintenance(options = {}) {
  const expireResult = await expireEligibleAgreements(options);
  const anomalyResult = await scanAgreementAnomalies({
    staleSignatureHours: Number.parseInt(process.env.AGREEMENT_PENDING_SIGNATURE_STALE_HOURS || '72', 10),
    sampleLimit: Number.parseInt(process.env.AGREEMENT_ANOMALY_SAMPLE_LIMIT || '100', 10)
  });

  return {
    expire: expireResult,
    anomalies: anomalyResult
  };
}

function scheduleAgreementLifecycleMaintenance() {
  const cron = process.env.AGREEMENT_LIFECYCLE_CRON || '15 3 * * *';

  schedule.scheduleJob(cron, async () => {
    try {
      const result = await runAgreementLifecycleMaintenance({ dryRun: false });
      console.log('[agreementLifecycleMaintenance] Completed:', result);
    } catch (error) {
      console.error('[agreementLifecycleMaintenance] Failed:', error.message);
    }
  });

  console.log(`[agreementLifecycleMaintenance] Scheduled with cron: ${cron}`);
}

module.exports = {
  expireEligibleAgreements,
  scanAgreementAnomalies,
  runAgreementLifecycleMaintenance,
  scheduleAgreementLifecycleMaintenance
};
