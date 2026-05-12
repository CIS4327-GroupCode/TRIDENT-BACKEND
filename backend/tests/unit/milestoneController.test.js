jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn(),
  createBulkNotifications: jest.fn()
}));

jest.mock('../../src/utils/auditLogger', () => ({
  AUDIT_ACTIONS: {
    MILESTONE_REVISION_REQUESTED: 'MILESTONE_REVISION_REQUESTED',
    MILESTONE_REVISION_APPROVED: 'MILESTONE_REVISION_APPROVED',
    MILESTONE_REVISION_REJECTED: 'MILESTONE_REVISION_REJECTED',
    MILESTONE_REQUEST_CREATED: 'MILESTONE_REQUEST_CREATED',
    MILESTONE_REQUEST_APPROVED: 'MILESTONE_REQUEST_APPROVED',
    MILESTONE_REQUEST_REJECTED: 'MILESTONE_REQUEST_REJECTED',
    PROJECT_RESEARCHER_ACCESS_UPDATED: 'PROJECT_RESEARCHER_ACCESS_UPDATED'
  },
  logAudit: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/services/milestoneAccessService', () => ({
  canResearcherAccessMilestone: jest.fn().mockResolvedValue(true),
  getResearcherMilestoneAccess: jest.fn().mockResolvedValue({ wholeProject: false, milestoneIds: [] }),
  hasWholeProjectAccess: jest.fn().mockResolvedValue(false),
  hasAcceptedProjectParticipation: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/database/models', () => ({
  Milestone: {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn()
  },
  MilestoneResearcher: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
    count: jest.fn(),
    findOrCreate: jest.fn()
  },
  MilestoneRevisionRequest: {
    findOne: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn()
  },
  MilestoneRequest: {
    findOne: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn()
  },
  ProjectResearcherAccess: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findOrCreate: jest.fn()
  },
  Project: {
    findOne: jest.fn()
  },
  User: {
    findByPk: jest.fn(),
    findAll: jest.fn()
  },
  Application: {
    findAll: jest.fn(),
    findOne: jest.fn()
  },
  sequelize: {
    transaction: jest.fn()
  }
}));

const milestoneController = require('../../src/controllers/milestoneController');
const notificationService = require('../../src/services/notificationService');
const milestoneAccessService = require('../../src/services/milestoneAccessService');
const {
  Milestone,
  MilestoneResearcher,
  MilestoneRevisionRequest,
  MilestoneRequest,
  ProjectResearcherAccess,
  Project,
  User,
  Application,
  sequelize
} = require('../../src/database/models');

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
    MilestoneResearcher.findAll.mockReset();
    MilestoneResearcher.findOne.mockReset();
    MilestoneResearcher.destroy.mockReset();
    MilestoneResearcher.bulkCreate.mockReset();
    MilestoneResearcher.count.mockReset();
    MilestoneResearcher.findOrCreate.mockReset();
    MilestoneRevisionRequest.findOne.mockReset();
    MilestoneRevisionRequest.create.mockReset();
    MilestoneRevisionRequest.findAll.mockReset();
    MilestoneRevisionRequest.count.mockReset();
    MilestoneRequest.findOne.mockReset();
    MilestoneRequest.create.mockReset();
    MilestoneRequest.findAll.mockReset();
    ProjectResearcherAccess.findAll.mockReset();
    ProjectResearcherAccess.findOne.mockReset();
    ProjectResearcherAccess.findOrCreate.mockReset();
    Project.findOne.mockReset();
    User.findByPk.mockReset();
    User.findAll.mockReset();
    Application.findAll.mockReset();
    Application.findOne.mockReset();
    sequelize.transaction.mockReset();
    milestoneAccessService.canResearcherAccessMilestone.mockReset();
    milestoneAccessService.getResearcherMilestoneAccess.mockReset();
    milestoneAccessService.hasWholeProjectAccess.mockReset();
    milestoneAccessService.hasAcceptedProjectParticipation.mockReset();

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
    User.findAll.mockResolvedValue([]);
    Application.findAll.mockResolvedValue([]);
    Application.findOne.mockResolvedValue(null);
    MilestoneResearcher.findAll.mockResolvedValue([]);
    MilestoneResearcher.findOne.mockResolvedValue(null);
    MilestoneResearcher.destroy.mockResolvedValue(1);
    MilestoneResearcher.bulkCreate.mockResolvedValue([]);
    MilestoneResearcher.count.mockResolvedValue(0);
    MilestoneResearcher.findOrCreate.mockResolvedValue([{}, true]);
    MilestoneRevisionRequest.findOne.mockResolvedValue(null);
    MilestoneRevisionRequest.create.mockResolvedValue({
      id: 1,
      requested_by: 7,
      toSafeObject: () => ({ id: 1, requested_by: 7, status: 'pending' })
    });
    MilestoneRevisionRequest.findAll.mockResolvedValue([]);
    MilestoneRevisionRequest.count.mockResolvedValue(0);
    MilestoneRequest.findOne.mockResolvedValue(null);
    MilestoneRequest.create.mockResolvedValue({
      id: 1,
      requested_by: 7,
      name: 'New Milestone',
      status: 'pending',
      toSafeObject: () => ({ id: 1, requested_by: 7, status: 'pending' })
    });
    MilestoneRequest.findAll.mockResolvedValue([]);
    ProjectResearcherAccess.findAll.mockResolvedValue([]);
    ProjectResearcherAccess.findOne.mockResolvedValue(null);
    ProjectResearcherAccess.findOrCreate.mockResolvedValue([{ whole_project: false, save: jest.fn() }, true]);
    sequelize.transaction.mockImplementation(async (callback) => callback({}));
    milestoneAccessService.canResearcherAccessMilestone.mockResolvedValue(true);
    milestoneAccessService.getResearcherMilestoneAccess.mockResolvedValue({ wholeProject: false, milestoneIds: [] });
    milestoneAccessService.hasWholeProjectAccess.mockResolvedValue(false);
    milestoneAccessService.hasAcceptedProjectParticipation.mockResolvedValue(true);
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

  describe('assignment endpoints', () => {
    test('setMilestoneAssignments replaces assignments for valid accepted researchers', async () => {
      req.body = { researcher_ids: [22] };

      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      User.findAll.mockResolvedValueOnce([{ id: 22 }]);
      Application.findAll.mockResolvedValueOnce([{ researcher_id: 22 }]);
      MilestoneResearcher.findAll
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            toSafeObject: () => ({ researcher_id: 22, researcher: { id: 22, name: 'R', email: 'r@test.com' } })
          }
        ]);

      await milestoneController.setMilestoneAssignments(req, res);

      expect(MilestoneResearcher.bulkCreate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            researcher_id: 22,
            assigned_by: 7
          })
        ],
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    });

    test('setMilestoneAssignments rejects unaccepted researchers', async () => {
      req.body = { researcher_ids: [22] };

      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      User.findAll.mockResolvedValueOnce([{ id: 22 }]);
      Application.findAll.mockResolvedValueOnce([]);

      await milestoneController.setMilestoneAssignments(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Researchers must have an accepted project application before assignment'
        })
      );
    });

    test('getMilestoneAssignments returns own assignment for researcher', async () => {
      req.user = { id: 22, role: 'researcher' };

      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      Application.findOne.mockResolvedValueOnce({ id: 9 });
      MilestoneResearcher.findOne.mockResolvedValueOnce({
        toSafeObject: () => ({ researcher_id: 22 })
      });

      await milestoneController.getMilestoneAssignments(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    });

    test('removeMilestoneAssignment returns 404 when assignment is missing', async () => {
      req.params = { projectId: 5, id: 11, researcherId: 99 };
      Milestone.findOne.mockResolvedValueOnce(buildMilestone());
      MilestoneResearcher.destroy.mockResolvedValueOnce(0);

      await milestoneController.removeMilestoneAssignment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('request and revision workflows', () => {
    test('createMilestoneRequest rejects when researcher is not accepted on project', async () => {
      req.user = { id: 22, role: 'researcher' };
      req.body = {
        name: 'Proposed Milestone',
        justification: 'Need additional validation checkpoint'
      };
      milestoneAccessService.hasAcceptedProjectParticipation.mockResolvedValueOnce(false);

      await milestoneController.createMilestoneRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Only accepted project researchers can request milestones' })
      );
    });

    test('approveMilestoneRequest creates milestone and links requester assignment', async () => {
      req.params = { projectId: 5, requestId: 30 };
      req.body = { feedback: 'Approved with scope' };

      const requestRecord = {
        id: 30,
        project_id: 5,
        requested_by: 22,
        name: 'New Milestone Request',
        description: 'Proposed description',
        due_date: '2027-01-10',
        status: 'pending',
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: () => ({ id: 30, status: 'approved' })
      };
      const createdMilestone = {
        id: 101,
        name: 'New Milestone Request',
        status: 'pending',
        toSafeObject: () => ({ id: 101, status: 'pending' })
      };

      MilestoneRequest.findOne.mockResolvedValueOnce(requestRecord);
      Milestone.create.mockResolvedValueOnce(createdMilestone);

      await milestoneController.approveMilestoneRequest(req, res);

      expect(Milestone.create).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: 5, name: 'New Milestone Request' }),
        expect.any(Object)
      );
      expect(MilestoneResearcher.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ milestone_id: 101, researcher_id: 22 })
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Milestone request approved' })
      );
    });

    test('requestMilestoneRevision creates pending revision and moves completed milestone to revision_requested', async () => {
      req.user = { id: 22, role: 'researcher' };
      req.body = { reason: 'Final artifact needs corrections' };

      const milestone = buildMilestone({
        status: 'completed',
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: () => ({ id: 11, status: 'revision_requested' })
      });
      Milestone.findOne.mockResolvedValueOnce(milestone);

      await milestoneController.requestMilestoneRevision(req, res);

      expect(MilestoneRevisionRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ milestone_id: 11, requested_by: 22, status: 'pending' }),
        expect.any(Object)
      );
      expect(milestone.status).toBe('revision_requested');
      expect(milestone.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('approveMilestoneRevisionRequest transitions milestone to revision_in_progress', async () => {
      req.params = { projectId: 5, id: 11, revisionId: 4 };
      req.body = { feedback: 'Proceed with requested updates' };

      const milestone = buildMilestone({
        status: 'revision_requested',
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: () => ({ id: 11, status: 'revision_in_progress' })
      });
      const revisionRequest = {
        id: 4,
        requested_by: 22,
        status: 'pending',
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: () => ({ id: 4, status: 'approved' })
      };

      Milestone.findOne.mockResolvedValueOnce(milestone);
      MilestoneRevisionRequest.findOne.mockResolvedValueOnce(revisionRequest);

      await milestoneController.approveMilestoneRevisionRequest(req, res);

      expect(revisionRequest.status).toBe('approved');
      expect(milestone.status).toBe('revision_in_progress');
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 22, type: 'milestone_revision_approved' })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Revision request approved' }));
    });

    test('rejectMilestoneRevisionRequest restores completed status when no pending revisions remain', async () => {
      req.params = { projectId: 5, id: 11, revisionId: 9 };
      req.body = { feedback: 'No changes required' };

      const milestone = buildMilestone({
        status: 'revision_requested',
        save: jest.fn().mockResolvedValue(true)
      });
      const revisionRequest = {
        id: 9,
        requested_by: 22,
        status: 'pending',
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: () => ({ id: 9, status: 'rejected' })
      };

      Milestone.findOne.mockResolvedValueOnce(milestone);
      MilestoneRevisionRequest.findOne.mockResolvedValueOnce(revisionRequest);
      MilestoneRevisionRequest.count.mockResolvedValueOnce(0);

      await milestoneController.rejectMilestoneRevisionRequest(req, res);

      expect(revisionRequest.status).toBe('rejected');
      expect(milestone.status).toBe('completed');
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 22, type: 'milestone_revision_rejected' })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Revision request rejected' }));
    });
  });
});
