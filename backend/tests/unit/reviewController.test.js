jest.mock('../../src/database/models', () => ({
  Project: { findByPk: jest.fn() },
  Rating: { findOne: jest.fn(), create: jest.fn() },
  Application: { findAll: jest.fn(), findOne: jest.fn() },
  User: { findOne: jest.fn() },
  ResearcherProfile: { findOne: jest.fn() }
}));

jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 })
}));

const {
  Project,
  Rating,
  Application,
  User,
  ResearcherProfile
} = require('../../src/database/models');

const reviewController = require('../../src/controllers/reviewController');

describe('reviewController submitProjectReview', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      params: { projectId: '9' },
      body: {
        comments: 'Excellent collaboration from start to finish.',
        scores: { quality: 5, communication: 5, timeliness: 4, overall: 5 }
      },
      user: { id: 21, role: 'nonprofit', org_id: 3 }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    Project.findByPk.mockResolvedValue({ project_id: 9, org_id: 3, status: 'completed', title: 'Project X' });
    Rating.findOne.mockResolvedValue(null);
    Rating.create.mockResolvedValue({ id: 100 });
  });

  test('requires reviewed_user_id when nonprofit project has multiple accepted researchers', async () => {
    Application.findAll.mockResolvedValue([{ researcher_id: 31 }, { researcher_id: 32 }]);

    await reviewController.submitProjectReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Please specify reviewed_user_id') })
    );
  });

  test('rejects reviewed_user_id not in accepted researcher list', async () => {
    req.body.reviewed_user_id = 99;
    Application.findAll.mockResolvedValue([{ researcher_id: 31 }, { researcher_id: 32 }]);

    await reviewController.submitProjectReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('must be one of the accepted researchers') })
    );
  });

  test('submits nonprofit review when reviewed_user_id is accepted participant', async () => {
    req.body.reviewed_user_id = 31;
    Application.findAll.mockResolvedValue([{ researcher_id: 31 }, { researcher_id: 32 }]);

    await reviewController.submitProjectReview(req, res);

    expect(Rating.create).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 9,
      rated_by_user_id: 21,
      rated_user_id: 31
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('submits researcher review and targets nonprofit owner', async () => {
    req.user = { id: 41, role: 'researcher' };
    ResearcherProfile.findOne.mockResolvedValue({ user_id: 41 });
    Application.findOne.mockResolvedValue({ id: 201, project_id: 9, researcher_id: 41, status: 'accepted' });
    User.findOne.mockResolvedValue({ id: 7, role: 'nonprofit', org_id: 3 });

    await reviewController.submitProjectReview(req, res);

    expect(Rating.create).toHaveBeenCalledWith(expect.objectContaining({ rated_user_id: 7 }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
