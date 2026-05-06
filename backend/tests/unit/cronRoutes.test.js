jest.mock('../../src/tasks/notificationCleanup', () => ({
  runCleanup: jest.fn(),
}));

jest.mock('../../src/tasks/milestoneDeadlineChecker', () => ({
  checkOverdueMilestones: jest.fn(),
  checkApproachingDeadlines: jest.fn(),
}));

jest.mock('../../src/tasks/matchGenerationJob', () => ({
  generateMatches: jest.fn(),
}));

jest.mock('../../src/tasks/agreementLifecycleMaintenance', () => ({
  runAgreementLifecycleMaintenance: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const cronRoutes = require('../../src/routes/cronRoutes');
const notificationCleanup = require('../../src/tasks/notificationCleanup');
const milestoneDeadlineChecker = require('../../src/tasks/milestoneDeadlineChecker');
const matchGenerationJob = require('../../src/tasks/matchGenerationJob');
const agreementLifecycleMaintenance = require('../../src/tasks/agreementLifecycleMaintenance');

const app = express();
app.use(express.json());
app.use('/api/cron', cronRoutes);

describe('cronRoutes', () => {
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    process.env.CRON_SECRET = previousCronSecret;
  });

  it('rejects requests without the configured cron secret', async () => {
    const response = await request(app)
      .get('/api/cron/notification-cleanup')
      .expect(401);

    expect(response.body).toEqual({ error: 'Unauthorized cron request' });
    expect(notificationCleanup.runCleanup).not.toHaveBeenCalled();
  });

  it('runs notification cleanup when authorized', async () => {
    notificationCleanup.runCleanup.mockResolvedValue({ archivedCount: 3, deletedCount: 4 });

    const response = await request(app)
      .get('/api/cron/notification-cleanup')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(200);

    expect(notificationCleanup.runCleanup).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        job: 'notification-cleanup',
        result: { archivedCount: 3, deletedCount: 4 },
      })
    );
  });

  it('runs both milestone deadline checks when authorized', async () => {
    milestoneDeadlineChecker.checkOverdueMilestones.mockResolvedValue({ milestonesChecked: 2, notificationsCreated: 3 });
    milestoneDeadlineChecker.checkApproachingDeadlines.mockResolvedValue({ milestonesChecked: 4, notificationsCreated: 5 });

    const response = await request(app)
      .get('/api/cron/milestone-deadlines')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(200);

    expect(milestoneDeadlineChecker.checkOverdueMilestones).toHaveBeenCalledTimes(1);
    expect(milestoneDeadlineChecker.checkApproachingDeadlines).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        job: 'milestone-deadline-checks',
        result: {
          overdue: { milestonesChecked: 2, notificationsCreated: 3 },
          approaching: { milestonesChecked: 4, notificationsCreated: 5 },
        },
      })
    );
  });

  it('runs match generation when authorized', async () => {
    matchGenerationJob.generateMatches.mockResolvedValue({
      projectsProcessed: 1,
      matchesCreated: 2,
      matchesUpdated: 3,
      notificationsSent: 1,
    });

    const response = await request(app)
      .get('/api/cron/match-generation')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(200);

    expect(matchGenerationJob.generateMatches).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        job: 'match-generation',
        result: {
          projectsProcessed: 1,
          matchesCreated: 2,
          matchesUpdated: 3,
          notificationsSent: 1,
        },
      })
    );
  });

  it('runs agreement lifecycle maintenance when authorized', async () => {
    agreementLifecycleMaintenance.runAgreementLifecycleMaintenance.mockResolvedValue({
      expire: { scanned: 3, expired: 2, failed: 0, dryRun: false },
      anomalies: { duplicateCurrentVersionPairs: 0, stalePendingSignatures: 1, executedMissingArtifacts: 0 }
    });

    const response = await request(app)
      .get('/api/cron/agreement-lifecycle')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(200);

    expect(agreementLifecycleMaintenance.runAgreementLifecycleMaintenance).toHaveBeenCalledWith({ dryRun: false });
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        job: 'agreement-lifecycle-maintenance',
        result: expect.objectContaining({
          expire: expect.objectContaining({ expired: 2 }),
          anomalies: expect.objectContaining({ stalePendingSignatures: 1 })
        })
      })
    );
  });

  it('passes dryRun=true to agreement lifecycle maintenance', async () => {
    agreementLifecycleMaintenance.runAgreementLifecycleMaintenance.mockResolvedValue({
      expire: { scanned: 5, expired: 0, failed: 0, dryRun: true },
      anomalies: { duplicateCurrentVersionPairs: 1, stalePendingSignatures: 0, executedMissingArtifacts: 0 }
    });

    const response = await request(app)
      .get('/api/cron/agreement-lifecycle?dryRun=true')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(200);

    expect(agreementLifecycleMaintenance.runAgreementLifecycleMaintenance).toHaveBeenCalledWith({ dryRun: true });
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        job: 'agreement-lifecycle-maintenance',
        result: expect.objectContaining({
          expire: expect.objectContaining({ dryRun: true, expired: 0 }),
          anomalies: expect.objectContaining({ duplicateCurrentVersionPairs: 1 })
        })
      })
    );
  });
});