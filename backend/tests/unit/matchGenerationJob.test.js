jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn(() => ({ name: 'match-job' }))
}));

jest.mock('../../src/database/models', () => ({
  Project: { findAll: jest.fn() },
  Organization: { findByPk: jest.fn() },
  ResearcherProfile: { findAll: jest.fn() },
  User: { findAll: jest.fn() },
  Match: { findOne: jest.fn(), create: jest.fn() },
  Notification: { findAll: jest.fn() }
}));

jest.mock('../../src/services/matchingService', () => ({
  calculateMatchScore: jest.fn(() => ({
    totalScore: 82,
    breakdown: { expertise: 20, methods: 20, budget: 12, availability: 10, experience: 10, domain: 10 }
  }))
}));

jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 })
}));

const schedule = require('node-schedule');
const {
  Project,
  Organization,
  ResearcherProfile,
  User,
  Match,
  Notification
} = require('../../src/database/models');
const matchingService = require('../../src/services/matchingService');
const notificationService = require('../../src/services/notificationService');
const matchGenerationJob = require('../../src/tasks/matchGenerationJob');

describe('matchGenerationJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules cron job', () => {
    const job = matchGenerationJob.scheduleMatchGeneration();
    expect(schedule.scheduleJob).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    expect(job).toBeUndefined();
  });

  it('returns empty summary when there are no open projects', async () => {
    Project.findAll.mockResolvedValue([]);

    const result = await matchGenerationJob.generateMatches();

    expect(result).toEqual({
      projectsProcessed: 0,
      matchesCreated: 0,
      matchesUpdated: 0,
      notificationsSent: 0
    });
  });

  it('returns zero matches when there are no researchers', async () => {
    Project.findAll.mockResolvedValue([{ project_id: 5, org_id: 20, title: 'P5', toJSON: () => ({ project_id: 5, org_id: 20, title: 'P5' }) }]);
    ResearcherProfile.findAll.mockResolvedValue([]);

    const result = await matchGenerationJob.generateMatches();

    expect(result.projectsProcessed).toBe(1);
    expect(result.matchesCreated).toBe(0);
    expect(result.notificationsSent).toBe(0);
  });

  it('creates/updates matches and notifications for high scores', async () => {
    Project.findAll.mockResolvedValue([
      {
        project_id: 5,
        org_id: 20,
        title: 'P5',
        toJSON: () => ({ project_id: 5, org_id: 20, title: 'P5' })
      }
    ]);

    ResearcherProfile.findAll.mockResolvedValue([
      { user_id: 10, toJSON: () => ({ user_id: 10 }) }
    ]);

    User.findAll.mockResolvedValue([{ id: 10 }]);
    Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 20, focus_areas: 'health' }) });
    Match.findOne.mockResolvedValue(null);
    Match.create.mockResolvedValue({ id: 100 });
    Notification.findAll.mockResolvedValue([]);

    const result = await matchGenerationJob.generateMatches();

    expect(Match.create).toHaveBeenCalled();
    expect(result.projectsProcessed).toBe(1);
    expect(result.matchesCreated).toBe(1);
    expect(result.notificationsSent).toBe(1);
  });

  it('updates existing match and preserves dismissed state', async () => {
    Project.findAll.mockResolvedValue([
      {
        project_id: 6,
        org_id: 20,
        title: 'P6',
        toJSON: () => ({ project_id: 6, org_id: 20, title: 'P6' })
      }
    ]);
    ResearcherProfile.findAll.mockResolvedValue([{ user_id: 10, toJSON: () => ({ user_id: 10 }) }]);
    User.findAll.mockResolvedValue([{ id: 10 }]);
    Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 20, focus_areas: 'health' }) });

    const save = jest.fn();
    Match.findOne.mockResolvedValue({ dismissed: true, save });
    Notification.findAll.mockResolvedValue([]);

    const result = await matchGenerationJob.generateMatches();

    expect(save).toHaveBeenCalled();
    expect(result.matchesUpdated).toBe(1);
  });

  it('does not notify for non-high score matches', async () => {
    matchingService.calculateMatchScore.mockReturnValueOnce({ totalScore: 40, breakdown: {} });
    Project.findAll.mockResolvedValue([{ project_id: 7, org_id: 20, title: 'P7', toJSON: () => ({ project_id: 7, org_id: 20, title: 'P7' }) }]);
    ResearcherProfile.findAll.mockResolvedValue([{ user_id: 10, toJSON: () => ({ user_id: 10 }) }]);
    User.findAll.mockResolvedValue([{ id: 10 }]);
    Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 20, focus_areas: 'health' }) });
    Match.findOne.mockResolvedValue(null);
    Match.create.mockResolvedValue({ id: 101 });

    const result = await matchGenerationJob.generateMatches();

    expect(result.notificationsSent).toBe(0);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('does not notify when recent notification exists', async () => {
    Project.findAll.mockResolvedValue([{ project_id: 8, org_id: 20, title: 'P8', toJSON: () => ({ project_id: 8, org_id: 20, title: 'P8' }) }]);
    ResearcherProfile.findAll.mockResolvedValue([{ user_id: 10, toJSON: () => ({ user_id: 10 }) }]);
    User.findAll.mockResolvedValue([{ id: 10 }]);
    Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 20, focus_areas: 'health' }) });
    Match.findOne.mockResolvedValue(null);
    Match.create.mockResolvedValue({ id: 102 });
    Notification.findAll.mockResolvedValue([{ metadata: { project_id: 8 } }]);

    const result = await matchGenerationJob.generateMatches();

    expect(result.notificationsSent).toBe(0);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('scheduled callback handles runtime errors', async () => {
    schedule.scheduleJob.mockClear();
    matchGenerationJob.scheduleMatchGeneration();
    const callback = schedule.scheduleJob.mock.calls[0][1];

    Project.findAll.mockRejectedValueOnce(new Error('scheduled-fail'));

    await callback();

    expect(Project.findAll).toHaveBeenCalled();
  });
});
