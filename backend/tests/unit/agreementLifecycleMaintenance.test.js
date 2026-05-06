jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  Contract: {
    findAll: jest.fn(),
    findByPk: jest.fn()
  },
  sequelize: {
    transaction: jest.fn(),
    literal: jest.fn((value) => value)
  }
}));

jest.mock('../../src/utils/agreementObservability', () => ({
  recordAnomaly: jest.fn()
}));

const { Contract, sequelize } = require('../../src/database/models');
const { recordAnomaly } = require('../../src/utils/agreementObservability');
const schedule = require('node-schedule');
const {
  expireEligibleAgreements,
  scanAgreementAnomalies,
  runAgreementLifecycleMaintenance,
  scheduleAgreementLifecycleMaintenance
} = require('../../src/tasks/agreementLifecycleMaintenance');

const transactionMock = {
  LOCK: {
    UPDATE: 'UPDATE'
  }
};

function makeContract(overrides = {}) {
  return {
    id: 10,
    status: 'active',
    expires_at: new Date(Date.now() - 1000),
    is_current_version: true,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('agreementLifecycleMaintenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (callback) => callback(transactionMock));
  });

  it('expireEligibleAgreements supports dry-run mode without mutating rows', async () => {
    Contract.findAll.mockResolvedValue([makeContract(), makeContract({ id: 11 })]);

    const result = await expireEligibleAgreements({ dryRun: true });

    expect(result).toEqual({
      scanned: 2,
      expired: 0,
      dryRun: true
    });
    expect(Contract.findByPk).not.toHaveBeenCalled();
  });

  it('expireEligibleAgreements expires lock-validated agreements', async () => {
    Contract.findAll.mockResolvedValue([makeContract({ id: 21 })]);
    Contract.findByPk.mockResolvedValue(makeContract({ id: 21 }));

    const result = await expireEligibleAgreements({ dryRun: false });

    expect(result).toEqual(expect.objectContaining({
      scanned: 1,
      expired: 1,
      failed: 0,
      dryRun: false
    }));
    expect(Contract.findByPk).toHaveBeenCalledWith(21, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
  });

  it('scanAgreementAnomalies records detected anomalies in observability stream', async () => {
    Contract.findAll
      .mockResolvedValueOnce([{ application_id: 3, template_type: 'NDA' }])
      .mockResolvedValueOnce([{ id: 44, updated_at: new Date('2026-05-01T00:00:00.000Z') }])
      .mockResolvedValueOnce([{ id: 77 }]);

    const result = await scanAgreementAnomalies({ staleSignatureHours: 24, sampleLimit: 50 });

    expect(result).toEqual(expect.objectContaining({
      duplicateCurrentVersionPairs: 1,
      stalePendingSignatures: 1,
      executedMissingArtifacts: 1
    }));
    expect(recordAnomaly).toHaveBeenCalledTimes(3);
  });

  it('runAgreementLifecycleMaintenance combines expiry and anomaly scans', async () => {
    Contract.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runAgreementLifecycleMaintenance({ dryRun: false });

    expect(result).toEqual(expect.objectContaining({
      expire: expect.objectContaining({ scanned: 0 }),
      anomalies: expect.objectContaining({
        duplicateCurrentVersionPairs: 0,
        stalePendingSignatures: 0,
        executedMissingArtifacts: 0
      })
    }));
  });

  it('scheduleAgreementLifecycleMaintenance registers a cron job', () => {
    const previousCron = process.env.AGREEMENT_LIFECYCLE_CRON;
    process.env.AGREEMENT_LIFECYCLE_CRON = '0 */6 * * *';

    scheduleAgreementLifecycleMaintenance();

    expect(schedule.scheduleJob).toHaveBeenCalledTimes(1);
    expect(schedule.scheduleJob).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function));

    process.env.AGREEMENT_LIFECYCLE_CRON = previousCron;
  });
});
