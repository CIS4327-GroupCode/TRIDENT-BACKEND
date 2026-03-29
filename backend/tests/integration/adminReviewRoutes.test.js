const express = require('express');
const request = require('supertest');

jest.mock('../../src/controllers/adminController', () => ({
  getDashboardStats: (req, res) => res.status(200).json({}),
  getAllUsers: (req, res) => res.status(200).json({ users: [] }),
  getUserDetails: (req, res) => res.status(200).json({ user: {} }),
  updateUserStatus: (req, res) => res.status(200).json({}),
  approveUser: (req, res) => res.status(200).json({}),
  suspendUser: (req, res) => res.status(200).json({}),
  unsuspendUser: (req, res) => res.status(200).json({}),
  permanentlyDeleteUser: (req, res) => res.status(200).json({}),
  getAllProjects: (req, res) => res.status(200).json({ projects: [] }),
  getPendingProjects: (req, res) => res.status(200).json({ projects: [] }),
  getProjectById: (req, res) => res.status(200).json({ project: {} }),
  updateProjectStatus: (req, res) => res.status(200).json({}),
  deleteProject: (req, res) => res.status(200).json({}),
  approveProject: (req, res) => res.status(200).json({}),
  rejectProject: (req, res) => res.status(200).json({}),
  requestProjectChanges: (req, res) => res.status(200).json({}),
  getAllMilestones: (req, res) => res.status(200).json({ milestones: [] }),
  deleteMilestone: (req, res) => res.status(200).json({}),
  getAllOrganizations: (req, res) => res.status(200).json({ organizations: [] }),
  deleteOrganization: (req, res) => res.status(200).json({}),
  getAllAttachments: (req, res) => res.status(200).json({ attachments: [] }),
  getAttachmentStats: (req, res) => res.status(200).json({ stats: {} }),
  forceDeleteAttachment: (req, res) => res.status(200).json({})
}));

jest.mock('../../src/controllers/ratingController', () => ({
  getAdminRatings: (req, res) =>
    res.status(200).json({ ratings: [{ id: 11, status: req.query.status || 'active' }] }),
  getAdminRatingStats: (req, res) =>
    res.status(200).json({ stats: { total: 1, active: 1, flagged: 0, removed: 0 } }),
  moderateRating: (req, res) =>
    res.status(200).json({ message: 'ok', rating: { id: Number(req.params.ratingId), action: req.body.action } })
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 1, role: req.headers['x-role'] || 'researcher' };
    return next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  }
}));

const adminRoutes = require('../../src/routes/adminRoutes');

describe('admin rating routes integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
  });

  test('requires authentication for rating moderation endpoints', async () => {
    const response = await request(app).get('/api/admin/ratings');
    expect(response.status).toBe(401);
  });

  test('requires admin role for rating moderation endpoints', async () => {
    const response = await request(app)
      .get('/api/admin/ratings')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'researcher');

    expect(response.status).toBe(403);
  });

  test('returns admin ratings for authorized admin', async () => {
    const response = await request(app)
      .get('/api/admin/ratings?status=flagged')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.ratings[0].status).toBe('flagged');
  });

  test('returns admin rating stats for authorized admin', async () => {
    const response = await request(app)
      .get('/api/admin/ratings/stats')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.stats.total).toBe(1);
  });

  test('moderates a rating for authorized admin', async () => {
    const response = await request(app)
      .put('/api/admin/ratings/15/moderate')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'admin')
      .send({ action: 'flag', reason: 'Needs review' });

    expect(response.status).toBe(200);
    expect(response.body.rating.id).toBe(15);
    expect(response.body.rating.action).toBe('flag');
  });
});
