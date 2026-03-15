jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn(),
  createBulkNotifications: jest.fn()
}));

jest.mock('../../src/database/models', () => ({
  Milestone: {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn()
  },
  Project: {
    findOne: jest.fn()
  },
  User: {
    findByPk: jest.fn()
  },
  Application: {
    findAll: jest.fn()
  }
}));

const milestoneController = require('../../src/controllers/milestoneController');
const notificationService = require('../../src/services/notificationService');
const { Milestone, Project, User, Application } = require('../../src/database/models');

describe('milestoneController', () => {
  let req;
  let res;

  const baseUser = { id: 7, role: 'nonprofit', org_id: 12 };
  const baseProject = { project_id: 5, org_id: 12 };

  const buildMilestone = (overrides = {}) => ({
    id: 11,
    name: 'Old Name',
    status: 'pending',
    depends_on: null,
    update: jest.fn(),
    destroy: jest.fn(),
    daysUntilDue: jest.fn().mockReturnValue(2),
    isOverdue: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockReturnValue('pending'),
    toSafeObject: jest.fn().mockReturnValue({ id: 11, name: 'Old Name' }),
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Milestone.create.mockReset();
    Milestone.findAll.mockReset();
    Milestone.findOne.mockReset();
    Project.findOne.mockReset();
    User.findByPk.mockReset();
    Application.findAll.mockReset();

    req = {
      user: { id: 7 },
      params: { projectId: 5, id: 11 },
      body: {},
      query: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    Project.findOne.mockResolvedValue(baseProject);
    User.findByPk.mockResolvedValue(baseUser);
    Application.findAll.mockResolvedValue([]);
    notificationService.createNotification.mockResolvedValue({ id: 100 });
    notificationService.createBulkNotifications.mockResolvedValue([]);
  });

  describe('createMilestone', () => {
    test('creates milestone and uses milestone.id in metadata', async () => {
      req.body = { name: 'Alpha', status: 'pending' };
      Milestone.create.mockResolvedValue({
        id: 99,
        name: 'Alpha',
        toSafeObject: () => ({ id: 99, name: 'Alpha' })
      });

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ milestone_id: 99 }) })
      );
    });

    test('returns 400 for empty name', async () => {
      req.body = { name: '   ' };
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 404 when project missing', async () => {
      req.body = { name: 'Alpha' };
      Project.findOne.mockResolvedValueOnce(null);
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('returns 403 for non-nonprofit user', async () => {
      req.body = { name: 'Alpha' };
      User.findByPk.mockResolvedValueOnce({ id: 7, role: 'researcher', org_id: 12 });
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 403 for org mismatch', async () => {
      req.body = { name: 'Alpha' };
      Project.findOne.mockResolvedValueOnce({ project_id: 5, org_id: 999 });
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 400 for past due date', async () => {
      req.body = { name: 'Alpha', due_date: '2020-01-01' };
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 for invalid status', async () => {
      req.body = { name: 'Alpha', status: 'bad' };
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects invalid depends_on reference', async () => {
      req.body = { name: 'Alpha', depends_on: 222 };
      Milestone.findOne.mockResolvedValueOnce(null);
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects create transition when dependency incomplete', async () => {
      req.body = { name: 'Alpha', status: 'in_progress', depends_on: 10 };
      Milestone.findOne
        .mockResolvedValueOnce({ id: 10, status: 'pending' })
        .mockResolvedValueOnce({ id: 10, status: 'pending' });
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects invalid dependency id format', async () => {
      req.body = { name: 'Alpha', depends_on: 'not-a-number' };
      await milestoneController.createMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'depends_on must be a valid milestone ID' });
    });

    test('creates researcher bulk notifications when collaborators exist', async () => {
      req.body = { name: 'Alpha' };
      Milestone.create.mockResolvedValue({
        id: 99,
        name: 'Alpha',
        toSafeObject: () => ({ id: 99, name: 'Alpha' })
      });
      Application.findAll.mockResolvedValueOnce([{ researcher_id: 22 }]);

      await milestoneController.createMilestone(req, res);

      expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
        [22],
        expect.objectContaining({ type: 'milestone_created' })
      );
    });

    test('continues create when notification creation fails', async () => {
      req.body = { name: 'Alpha' };
      Milestone.create.mockResolvedValue({
        id: 99,
        name: 'Alpha',
        toSafeObject: () => ({ id: 99, name: 'Alpha' })
      });
      notificationService.createNotification.mockRejectedValueOnce(new Error('notif fail'));

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('returns 500 when milestone creation throws', async () => {
      req.body = { name: 'Alpha' };
      Milestone.create.mockRejectedValueOnce(new Error('db fail'));

      await milestoneController.createMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create milestone' });
    });
  });

  describe('getMilestones and getMilestone', () => {
    test('returns enriched milestone list', async () => {
      Milestone.findAll.mockResolvedValue([
        {
          toSafeObject: () => ({ id: 1, name: 'A' }),
          isOverdue: () => false,
          daysUntilDue: () => 2,
          getStatus: () => 'pending'
        }
      ]);

      await milestoneController.getMilestones(req, res);

      expect(Milestone.findAll).toHaveBeenCalledWith(expect.objectContaining({
        include: [expect.objectContaining({ as: 'dependency' })]
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    });

    test('returns 400 for invalid status filter', async () => {
      req.query = { status: 'bad' };
      await milestoneController.getMilestones(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 404 for missing project in list', async () => {
      Project.findOne.mockResolvedValueOnce(null);
      await milestoneController.getMilestones(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('applies overdue filter when overdue=true', async () => {
      req.query = { overdue: 'true' };
      Milestone.findAll.mockResolvedValue([]);

      await milestoneController.getMilestones(req, res);

      expect(Milestone.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: expect.any(Object),
            due_date: expect.any(Object)
          })
        })
      );
    });

    test('returns single milestone with computed fields', async () => {
      Milestone.findOne.mockResolvedValueOnce({
        toSafeObject: () => ({ id: 10, name: 'Milestone 10' }),
        isOverdue: () => true,
        daysUntilDue: () => -1,
        getStatus: () => 'overdue'
      });

      await milestoneController.getMilestone(req, res);

      expect(res.json).toHaveBeenCalledWith({
        milestone: expect.objectContaining({ id: 10, computed_status: 'overdue' })
      });
    });

    test('returns 404 for missing milestone', async () => {
      Milestone.findOne.mockResolvedValueOnce(null);
      await milestoneController.getMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('returns 500 when getMilestones throws', async () => {
      Milestone.findAll.mockRejectedValueOnce(new Error('read fail'));
      await milestoneController.getMilestones(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch milestones' });
    });

    test('returns 500 when getMilestone throws', async () => {
      Milestone.findOne.mockRejectedValueOnce(new Error('read fail'));
      await milestoneController.getMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch milestone' });
    });
  });

  describe('updateMilestone', () => {
    test('sets completed_at on completion', async () => {
      req.body = { status: 'completed' };
      const milestone = buildMilestone();
      Milestone.findOne
        .mockResolvedValueOnce(milestone)
        .mockResolvedValueOnce({ id: 1, status: 'completed' });

      await milestoneController.updateMilestone(req, res);

      expect(milestone.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed',
        completed_at: expect.any(Date)
      }));
    });

    test('clears completed_at when reverting from completed', async () => {
      req.body = { status: 'pending' };
      const milestone = buildMilestone({ status: 'completed' });
      Milestone.findOne.mockResolvedValueOnce(milestone);

      await milestoneController.updateMilestone(req, res);

      expect(milestone.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'pending',
        completed_at: null
      }));
    });

    test('returns 404 for missing milestone', async () => {
      req.body = { name: 'X' };
      Milestone.findOne.mockResolvedValueOnce(null);
      await milestoneController.updateMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('returns 400 for invalid status', async () => {
      req.body = { status: 'bad' };
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      await milestoneController.updateMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 for empty name', async () => {
      req.body = { name: '' };
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      await milestoneController.updateMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects self dependency', async () => {
      req.body = { depends_on: 11 };
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      await milestoneController.updateMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects transition when dependency incomplete', async () => {
      req.body = { status: 'completed' };
      Milestone.findOne
        .mockResolvedValueOnce(buildMilestone({ depends_on: 2 }))
        .mockResolvedValueOnce({ id: 2, status: 'in_progress' });

      await milestoneController.updateMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('updates dependency when valid', async () => {
      req.body = { depends_on: 3 };
      const milestone = buildMilestone();
      Milestone.findOne
        .mockResolvedValueOnce(milestone)
        .mockResolvedValueOnce({ id: 3, status: 'completed' });

      await milestoneController.updateMilestone(req, res);

      expect(milestone.update).toHaveBeenCalledWith(expect.objectContaining({ depends_on: 3 }));
    });

    test('returns 403 for non-nonprofit update user', async () => {
      req.body = { name: 'X' };
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      User.findByPk.mockResolvedValueOnce({ id: 7, role: 'researcher', org_id: 12 });

      await milestoneController.updateMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 403 for org mismatch on update', async () => {
      req.body = { name: 'X' };
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      Project.findOne.mockResolvedValueOnce({ project_id: 5, org_id: 999 });

      await milestoneController.updateMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('creates completion notifications for researchers too', async () => {
      req.body = { status: 'completed' };
      const milestone = buildMilestone({ status: 'pending' });
      Milestone.findOne
        .mockResolvedValueOnce(milestone)
        .mockResolvedValueOnce({ id: 1, status: 'completed' });
      Application.findAll.mockResolvedValueOnce([{ researcher_id: 55 }]);

      await milestoneController.updateMilestone(req, res);

      expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
        [55],
        expect.objectContaining({ type: 'milestone_completed' })
      );
    });

    test('creates update and deadline notifications when due date changes', async () => {
      req.body = { name: 'Renamed', due_date: '2027-01-01' };
      const milestone = buildMilestone({ daysUntilDue: jest.fn().mockReturnValue(2) });
      Milestone.findOne.mockResolvedValueOnce(milestone);
      Application.findAll.mockResolvedValueOnce([{ researcher_id: 55 }]);

      await milestoneController.updateMilestone(req, res);

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'milestone_updated' })
      );
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'milestone_deadline_approaching' })
      );
      expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
        [55],
        expect.objectContaining({ type: 'milestone_deadline_approaching' })
      );
    });

    test('returns 500 when update operation throws', async () => {
      req.body = { name: 'boom' };
      const milestone = buildMilestone({ update: jest.fn().mockRejectedValueOnce(new Error('update fail')) });
      Milestone.findOne.mockResolvedValueOnce(milestone);

      await milestoneController.updateMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update milestone' });
    });
  });

  describe('deleteMilestone', () => {
    test('deletes milestone successfully', async () => {
      const milestone = buildMilestone();
      Milestone.findOne.mockResolvedValueOnce(milestone);
      await milestoneController.deleteMilestone(req, res);
      expect(milestone.destroy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deleted_id: 11 }));
    });

    test('returns 404 when delete target is missing', async () => {
      Milestone.findOne.mockResolvedValueOnce(null);
      await milestoneController.deleteMilestone(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('returns 403 for non-nonprofit delete user', async () => {
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      User.findByPk.mockResolvedValueOnce({ id: 7, role: 'researcher', org_id: 12 });

      await milestoneController.deleteMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 500 when delete operation throws', async () => {
      const milestone = buildMilestone({ destroy: jest.fn().mockRejectedValueOnce(new Error('destroy fail')) });
      Milestone.findOne.mockResolvedValueOnce(milestone);

      await milestoneController.deleteMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete milestone' });
    });
  });

  describe('getMilestoneStats', () => {
    test('returns aggregate stats', async () => {
      Milestone.findAll.mockResolvedValue([
        { status: 'pending', isOverdue: () => false },
        { status: 'completed', isOverdue: () => false },
        { status: 'in_progress', isOverdue: () => true }
      ]);

      await milestoneController.getMilestoneStats(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        stats: expect.objectContaining({ total: 3, completed: 1, overdue: 1, completion_rate: 33 })
      }));
    });

    test('returns 404 when project missing for stats', async () => {
      Project.findOne.mockResolvedValueOnce(null);
      await milestoneController.getMilestoneStats(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('returns 500 when stats query throws', async () => {
      Milestone.findAll.mockRejectedValueOnce(new Error('stats fail'));
      await milestoneController.getMilestoneStats(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch milestone statistics' });
    });
  });
});
