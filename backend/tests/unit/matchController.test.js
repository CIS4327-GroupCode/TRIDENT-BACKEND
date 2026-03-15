jest.mock('../../src/services/matchingService', () => ({
  findMatchesForProject: jest.fn(),
  findMatchesForResearcher: jest.fn(),
  calculateMatchScore: jest.fn(() => ({
    totalScore: 77,
    breakdown: {
      expertise: 20,
      methods: 20,
      budget: 10,
      availability: 10,
      experience: 7,
      domain: 10
    },
    strengths: ['Strong expertise match'],
    concerns: []
  }))
}));

jest.mock('../../src/database/models/Project', () => ({
  findByPk: jest.fn(),
  findAll: jest.fn()
}));

jest.mock('../../src/database/models/Organization', () => ({
  findByPk: jest.fn()
}));

jest.mock('../../src/database/models/Match', () => ({
  findByPk: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn()
}));

jest.mock('../../src/database/models/ResearcherProfile', () => ({
  findOne: jest.fn(),
  findAll: jest.fn()
}));

jest.mock('../../src/database/models/User', () => ({
  findAll: jest.fn()
}));

const matchController = require('../../src/controllers/matchController');
const matchingService = require('../../src/services/matchingService');
const Project = require('../../src/database/models/Project');
const Match = require('../../src/database/models/Match');
const ResearcherProfile = require('../../src/database/models/ResearcherProfile');
const User = require('../../src/database/models/User');
const Organization = require('../../src/database/models/Organization');

describe('matchController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: {},
      query: {},
      user: { id: 2, role: 'nonprofit', org_id: 9 }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getProjectMatches', () => {
    it('returns matches for authorized nonprofit', async () => {
      req.params.projectId = '1';
      Project.findByPk.mockResolvedValue({
        project_id: 1,
        org_id: 9,
        title: 'P1',
        status: 'open'
      });
      matchingService.findMatchesForProject.mockResolvedValue({
        matches: [{ researcher: { user_id: 10 }, matchScore: 88 }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false }
      });

      await matchController.getProjectMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(matchingService.findMatchesForProject).toHaveBeenCalled();
    });

    it('returns 403 for unauthorized nonprofit', async () => {
      req.params.projectId = '1';
      Project.findByPk.mockResolvedValue({ project_id: 1, org_id: 999, title: 'P1', status: 'open' });

      await matchController.getProjectMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 404 when project is missing', async () => {
      req.params.projectId = '999';
      Project.findByPk.mockResolvedValue(null);

      await matchController.getProjectMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 401 when req.user is missing', async () => {
      req.params.projectId = '1';
      req.user = null;
      Project.findByPk.mockResolvedValue({ project_id: 1, org_id: 9, title: 'P1', status: 'open' });

      await matchController.getProjectMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 500 on service failure', async () => {
      req.params.projectId = '1';
      Project.findByPk.mockResolvedValue({ project_id: 1, org_id: 9, title: 'P1', status: 'open' });
      matchingService.findMatchesForProject.mockRejectedValue(new Error('service-fail'));

      await matchController.getProjectMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('passes compliance filter options to matching service', async () => {
      req.params.projectId = '1';
      req.query = {
        minScore: '55',
        requireCompliance: 'true',
        complianceFilter: 'IRB, FERPA'
      };
      Project.findByPk.mockResolvedValue({ project_id: 1, org_id: 9, title: 'P1', status: 'open' });
      matchingService.findMatchesForProject.mockResolvedValue({
        matches: [],
        pagination: { total: 0, limit: 20, offset: 0, hasMore: false }
      });

      await matchController.getProjectMatches(req, res);

      expect(matchingService.findMatchesForProject).toHaveBeenCalledWith('1', {
        limit: 20,
        offset: 0,
        minScore: 55,
        requireCompliance: true,
        complianceFilter: 'IRB, FERPA'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getResearcherMatches', () => {
    it('returns 401 when unauthenticated', async () => {
      req.user = null;

      await matchController.getResearcherMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 200 for authenticated researcher payload', async () => {
      req.user = { id: 7, role: 'researcher', first_name: 'A', last_name: 'B' };
      matchingService.findMatchesForResearcher.mockResolvedValue({
        matches: [{ project: { project_id: 1 }, matchScore: 61 }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false }
      });

      await matchController.getResearcherMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on matching error', async () => {
      req.user = { id: 7, role: 'researcher' };
      matchingService.findMatchesForResearcher.mockRejectedValue(new Error('boom'));

      await matchController.getResearcherMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('explainMatch', () => {
    it('returns 400 when params missing', async () => {
      req.query = {};

      await matchController.explainMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns explanation for authorized researcher self', async () => {
      req.user = { id: 7, role: 'researcher' };
      req.query = { projectId: '1', researcherId: '7' };

      Project.findByPk.mockResolvedValue({
        project_id: 1,
        org_id: 9,
        title: 'P1',
        toJSON: () => ({ project_id: 1, org_id: 9, title: 'P1' })
      });
      ResearcherProfile.findOne.mockResolvedValue({
        user_id: 7,
        title: 'Dr',
        institution: 'Uni',
        projects_completed: 5,
        toJSON: () => ({ user_id: 7, projects_completed: 5 })
      });

      await matchController.explainMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 401 when unauthenticated', async () => {
      req.user = null;
      req.query = { projectId: '1', researcherId: '7' };

      await matchController.explainMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when project or researcher missing', async () => {
      req.query = { projectId: '1', researcherId: '7' };
      Project.findByPk.mockResolvedValue(null);
      ResearcherProfile.findOne.mockResolvedValue(null);

      await matchController.explainMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 when unauthorized to view explanation', async () => {
      req.user = { id: 99, role: 'researcher' };
      req.query = { projectId: '1', researcherId: '7' };
      Project.findByPk.mockResolvedValue({
        project_id: 1,
        org_id: 9,
        title: 'P1',
        toJSON: () => ({ project_id: 1, org_id: 9, title: 'P1' })
      });
      ResearcherProfile.findOne.mockResolvedValue({
        user_id: 7,
        title: 'Dr',
        institution: 'Uni',
        projects_completed: 5,
        toJSON: () => ({ user_id: 7, projects_completed: 5 })
      });

      await matchController.explainMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 500 when explanation throws', async () => {
      req.query = { projectId: '1', researcherId: '7' };
      Project.findByPk.mockRejectedValue(new Error('explode'));

      await matchController.explainMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('dismissMatch', () => {
    it('dismisses by project/researcher pair when match does not exist', async () => {
      req.user = { id: 10, role: 'researcher' };
      req.params = { projectId: '5', researcherId: '10' };

      Match.findOne.mockResolvedValue(null);
      Match.create.mockResolvedValue({
        id: 55,
        dismissed: true,
        toSafeObject: () => ({ id: 55, dismissed: true })
      });

      await matchController.dismissMatch(req, res);

      expect(Match.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 403 for unauthorized dismiss', async () => {
      req.user = { id: 2, role: 'researcher' };
      req.params = { matchId: '9' };

      Match.findByPk.mockResolvedValue({
        id: 9,
        brief_id: 3,
        researcher_id: 8,
        save: jest.fn(),
        toSafeObject: () => ({ id: 9 })
      });
      Project.findByPk.mockResolvedValue({ project_id: 3, org_id: 99 });

      await matchController.dismissMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 when user missing', async () => {
      req.user = null;
      req.params = { matchId: '1' };

      await matchController.dismissMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when match id does not exist', async () => {
      req.params = { matchId: '404' };
      Match.findByPk.mockResolvedValue(null);

      await matchController.dismissMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('dismisses existing researcher-owned match', async () => {
      req.user = { id: 8, role: 'researcher' };
      req.params = { matchId: '9' };
      const save = jest.fn();

      Match.findByPk.mockResolvedValue({
        id: 9,
        brief_id: 3,
        researcher_id: 8,
        dismissed: false,
        save,
        toSafeObject: () => ({ id: 9, dismissed: true })
      });
      Project.findByPk.mockResolvedValue({ project_id: 3, org_id: 99 });

      await matchController.dismissMatch(req, res);

      expect(save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when project for match is missing', async () => {
      req.params = { matchId: '9' };
      Match.findByPk.mockResolvedValue({
        id: 9,
        brief_id: 3,
        researcher_id: 8,
        save: jest.fn(),
        toSafeObject: () => ({ id: 9 })
      });
      Project.findByPk.mockResolvedValue(null);

      await matchController.dismissMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when dismiss throws', async () => {
      req.params = { matchId: '9' };
      Match.findByPk.mockRejectedValue(new Error('dismiss-fail'));

      await matchController.dismissMatch(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('recalculateAllMatches', () => {
    it('recalculates and returns summary', async () => {
      Project.findAll.mockResolvedValue([
        { project_id: 1, org_id: 9, toJSON: () => ({ project_id: 1, org_id: 9 }) }
      ]);
      ResearcherProfile.findAll.mockResolvedValue([
        { user_id: 10, toJSON: () => ({ user_id: 10 }) }
      ]);
      User.findAll.mockResolvedValue([{ id: 10 }]);
      Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 9, focus_areas: 'health' }) });
      Match.findOne.mockResolvedValue(null);
      Match.create.mockResolvedValue({ id: 1 });

      await matchController.recalculateAllMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(Match.create).toHaveBeenCalled();
    });

    it('updates existing matches when present', async () => {
      Project.findAll.mockResolvedValue([
        { project_id: 1, org_id: 9, toJSON: () => ({ project_id: 1, org_id: 9 }) }
      ]);
      ResearcherProfile.findAll.mockResolvedValue([
        { user_id: 10, toJSON: () => ({ user_id: 10 }) }
      ]);
      User.findAll.mockResolvedValue([{ id: 10 }]);
      Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 9, focus_areas: 'health' }) });

      const save = jest.fn();
      Match.findOne.mockResolvedValue({
        score: 10,
        score_breakdown: {},
        calculated_at: null,
        save
      });

      await matchController.recalculateAllMatches(req, res);

      expect(save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('handles empty active researchers', async () => {
      Project.findAll.mockResolvedValue([
        { project_id: 1, org_id: 9, toJSON: () => ({ project_id: 1, org_id: 9 }) }
      ]);
      ResearcherProfile.findAll.mockResolvedValue([
        { user_id: 10, toJSON: () => ({ user_id: 10 }) }
      ]);
      User.findAll.mockResolvedValue([]);
      Organization.findByPk.mockResolvedValue({ toJSON: () => ({ id: 9, focus_areas: 'health' }) });

      await matchController.recalculateAllMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(Match.create).not.toHaveBeenCalled();
    });

    it('returns 500 when recalculation throws', async () => {
      Project.findAll.mockRejectedValue(new Error('recalc-fail'));

      await matchController.recalculateAllMatches(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
