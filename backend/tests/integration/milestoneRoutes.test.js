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
  getMilestoneAssignments: (req, res) => res.status(200).json({
    milestone_id: Number(req.params.id),
    assignments: [{ researcher_id: 2 }]
  }),
  setMilestoneAssignments: (req, res) => res.status(200).json({
    milestone_id: Number(req.params.id),
    assignments: (req.body.researcher_ids || []).map((researcherId) => ({ researcher_id: researcherId }))
  }),
  removeMilestoneAssignment: (req, res) => res.status(200).json({
    milestone_id: Number(req.params.id),
    researcher_id: Number(req.params.researcherId)
  }),
  getProjectResearcherAccess: (req, res) => res.status(200).json({ researchers: [] }),
  setProjectResearcherAccess: (req, res) => res.status(200).json({ whole_project: Boolean(req.body.whole_project) }),
  createMilestoneRequest: (req, res) => res.status(201).json({ milestone_request: { id: 1 } }),
  listMilestoneRequests: (req, res) => res.status(200).json({ milestone_requests: [] }),
  approveMilestoneRequest: (req, res) => res.status(200).json({ message: 'approved' }),
  rejectMilestoneRequest: (req, res) => res.status(200).json({ message: 'rejected' }),
  requestMilestoneRevision: (req, res) => res.status(201).json({ revision_request: { id: 1 } }),
  listMilestoneRevisionRequests: (req, res) => res.status(200).json({ revision_requests: [] }),
  approveMilestoneRevisionRequest: (req, res) => res.status(200).json({ message: 'approved' }),
  rejectMilestoneRevisionRequest: (req, res) => res.status(200).json({ message: 'rejected' }),
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
  },
  requireResearcher: (req, res, next) => {
    if (req.user.role !== 'researcher') {
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

  test('returns assignments for milestone', async () => {
    const response = await request(app)
      .get('/api/projects/9/milestones/4/assignments')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.milestone_id).toBe(4);
    expect(response.body.assignments[0].researcher_id).toBe(2);
  });

  test('updates milestone assignments for nonprofit user', async () => {
    const response = await request(app)
      .put('/api/projects/9/milestones/4/assignments')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'nonprofit')
      .send({ researcher_ids: [2, 3] });

    expect(response.status).toBe(200);
    expect(response.body.assignments).toHaveLength(2);
  });

  test('blocks assignment updates for researcher role', async () => {
    const response = await request(app)
      .put('/api/projects/9/milestones/4/assignments')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'researcher')
      .send({ researcher_ids: [2] });

    expect(response.status).toBe(403);
  });

  test('removes milestone assignment for nonprofit user', async () => {
    const response = await request(app)
      .delete('/api/projects/9/milestones/4/assignments/2')
      .set('Authorization', 'Bearer token')
      .set('x-role', 'nonprofit');

    expect(response.status).toBe(200);
    expect(response.body.researcher_id).toBe(2);
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

  test('supports researcher milestone request and revision routes', async () => {
    const auth = { Authorization: 'Bearer token' };

    const createRequest = await request(app)
      .post('/api/projects/9/milestones/requests')
      .set(auth)
      .set('x-role', 'researcher')
      .send({ name: 'Request', justification: 'Need additional checkpoint' });
    expect(createRequest.status).toBe(201);

    const listRequests = await request(app)
      .get('/api/projects/9/milestones/requests')
      .set(auth);
    expect(listRequests.status).toBe(200);

    const requestRevision = await request(app)
      .post('/api/projects/9/milestones/4/request-revision')
      .set(auth)
      .set('x-role', 'researcher')
      .send({ reason: 'Please reopen for updates' });
    expect(requestRevision.status).toBe(201);

    const listRevisions = await request(app)
      .get('/api/projects/9/milestones/4/revisions')
      .set(auth);
    expect(listRevisions.status).toBe(200);
  });

  test('supports nonprofit review of milestone requests and revisions plus access matrix updates', async () => {
    const auth = { Authorization: 'Bearer token' };

    const listAccess = await request(app)
      .get('/api/projects/9/milestones/access/researchers')
      .set(auth)
      .set('x-role', 'nonprofit');
    expect(listAccess.status).toBe(200);

    const setAccess = await request(app)
      .put('/api/projects/9/milestones/access/researchers/2')
      .set(auth)
      .set('x-role', 'nonprofit')
      .send({ whole_project: true, milestone_ids: [] });
    expect(setAccess.status).toBe(200);

    const approveRequest = await request(app)
      .post('/api/projects/9/milestones/requests/1/approve')
      .set(auth)
      .set('x-role', 'nonprofit')
      .send({ feedback: 'Approved' });
    expect(approveRequest.status).toBe(200);

    const rejectRequest = await request(app)
      .post('/api/projects/9/milestones/requests/1/reject')
      .set(auth)
      .set('x-role', 'nonprofit')
      .send({ feedback: 'Rejected' });
    expect(rejectRequest.status).toBe(200);

    const approveRevision = await request(app)
      .post('/api/projects/9/milestones/4/revisions/1/approve')
      .set(auth)
      .set('x-role', 'nonprofit')
      .send({ feedback: 'Approved' });
    expect(approveRevision.status).toBe(200);

    const rejectRevision = await request(app)
      .post('/api/projects/9/milestones/4/revisions/1/reject')
      .set(auth)
      .set('x-role', 'nonprofit')
      .send({ feedback: 'Rejected' });
    expect(rejectRevision.status).toBe(200);
  });
});
