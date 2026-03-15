const express = require('express');
const request = require('supertest');

jest.mock('../../src/controllers/milestoneController', () => ({
  createMilestone: (req, res) => res.status(201).json({
    milestone: { id: 1, project_id: Number(req.params.projectId), ...req.body }
  }),
  getMilestones: (req, res) => res.status(200).json({
    milestones: [{ id: 1, status: req.query.status || 'pending' }]
  }),
  getMilestone: (req, res) => res.status(200).json({
    milestone: { id: Number(req.params.id) }
  }),
  updateMilestone: (req, res) => {
    if (req.body.id !== undefined && req.body.depends_on === req.body.id) {
      return res.status(400).json({ error: 'A milestone cannot depend on itself' });
    }
    if (req.body.forceDependencyError) {
      return res.status(400).json({ error: 'Dependency milestone must be completed before this status transition' });
    }
    return res.status(200).json({ milestone: { id: Number(req.params.id), ...req.body } });
  },
  deleteMilestone: (req, res) => res.status(200).json({ deleted_id: Number(req.params.id) }),
  getMilestoneStats: (req, res) => res.status(200).json({
    stats: { total: 1, completed: 0, overdue: 0 }
  })
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 1, role: req.headers['x-role'] || 'nonprofit' };
    return next();
  },
  requireNonprofit: (req, res, next) => {
    if (req.user.role !== 'nonprofit') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  }
}));

const milestoneRoutes = require('../../src/routes/milestoneRoutes');

describe('milestoneRoutes integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/milestones', milestoneRoutes);
  });

  test('enforces authentication on list endpoint', async () => {
    const response = await request(app).get('/api/projects/9/milestones');
    expect(response.status).toBe(401);
  });

  test('creates milestone for nonprofit user', async () => {
    const response = await request(app)
      .post('/api/projects/9/milestones')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'nonprofit')
      .send({ name: 'Milestone A' });

    expect(response.status).toBe(201);
    expect(response.body.milestone).toMatchObject({ name: 'Milestone A', project_id: 9 });
  });

  test('blocks create milestone for non-nonprofit roles', async () => {
    const response = await request(app)
      .post('/api/projects/9/milestones')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'researcher')
      .send({ name: 'Milestone A' });

    expect(response.status).toBe(403);
  });

  test('returns milestones and supports status filter query', async () => {
    const response = await request(app)
      .get('/api/projects/9/milestones?status=completed')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.milestones[0].status).toBe('completed');
  });

  test('updates milestone and carries dependency payload', async () => {
    const response = await request(app)
      .put('/api/projects/9/milestones/4')
      .set('Authorization', 'Bearer token')
      .send({ status: 'in_progress', depends_on: 2 });

    expect(response.status).toBe(200);
    expect(response.body.milestone.depends_on).toBe(2);
  });

  test('returns dependency validation errors from controller', async () => {
    const response = await request(app)
      .put('/api/projects/9/milestones/4')
      .set('Authorization', 'Bearer token')
      .send({ forceDependencyError: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Dependency milestone must be completed');
  });

  test('deletes milestone for nonprofit user', async () => {
    const response = await request(app)
      .delete('/api/projects/9/milestones/4')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.deleted_id).toBe(4);
  });

  test('returns milestone stats', async () => {
    const response = await request(app)
      .get('/api/projects/9/milestones/stats')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.stats.total).toBe(1);
  });
});
