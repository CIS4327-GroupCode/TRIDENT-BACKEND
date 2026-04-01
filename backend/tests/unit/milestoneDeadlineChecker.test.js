jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn(() => ({ name: 'job' }))
}));

jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  Milestone: { findAll: jest.fn() },
  Project: {},
  Application: { findAll: jest.fn() },
  User: { findAll: jest.fn() },
  Notification: { findOne: jest.fn() }
}));

const schedule = require('node-schedule');
const notificationService = require('../../src/services/notificationService');
const { Milestone, Application, User, Notification } = require('../../src/database/models');
const checker = require('../../src/tasks/milestoneDeadlineChecker');

describe('milestoneDeadlineChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notification.findOne.mockResolvedValue(null);
    notificationService.createNotification.mockResolvedValue({ id: 1 });
    User.findAll.mockResolvedValue([{ id: 10 }]);
    Application.findAll.mockResolvedValue([{ researcher_id: 20 }]);
  });

  test('checkOverdueMilestones creates overdue notifications', async () => {
    Milestone.findAll.mockResolvedValue([
      {
        id: 1,
        name: 'Past milestone',
        project: { project_id: 99, org_id: 5 }
      }
    ]);

    const result = await checker.checkOverdueMilestones();

    expect(result.milestonesChecked).toBe(1);
    expect(result.notificationsCreated).toBe(2);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'milestone_overdue',
        metadata: expect.objectContaining({ milestone_id: 1 })
      })
    );
  });

  test('checkApproachingDeadlines creates approaching notifications', async () => {
    Milestone.findAll.mockResolvedValue([
      {
        id: 2,
        name: 'Soon milestone',
        daysUntilDue: () => 2,
        project: { project_id: 44, org_id: 7 }
      }
    ]);

    const result = await checker.checkApproachingDeadlines();

    expect(result.milestonesChecked).toBe(1);
    expect(result.notificationsCreated).toBe(2);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'milestone_deadline_approaching' })
    );
  });

  test('dedup prevents duplicate notifications for the same day', async () => {
    Milestone.findAll.mockResolvedValue([
      {
        id: 5,
        name: 'Past milestone',
        project: { project_id: 10, org_id: 2 }
      }
    ]);
    Notification.findOne.mockResolvedValue({ id: 555 });

    const result = await checker.checkOverdueMilestones();

    expect(result.notificationsCreated).toBe(0);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('scheduleDeadlineChecks registers 8 AM cron expression', () => {
    const job = checker.scheduleDeadlineChecks();

    expect(schedule.scheduleJob).toHaveBeenCalledWith('0 8 * * *', expect.any(Function));
    expect(job).toEqual({ name: 'job' });
  });
});
