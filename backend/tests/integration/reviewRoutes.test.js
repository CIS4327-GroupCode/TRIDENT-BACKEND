const express = require('express');
const request = require('supertest');

jest.mock('../../src/controllers/ratingController', () => ({
  getProjectRatings: (req, res) =>
    res.status(200).json({ ratings: [{ id: 1, project_id: Number(req.params.projectId) }] }),
  getProjectRatingSummary: (req, res) =>
    res.status(200).json({ summary: { count: 1, averages: { overall: 4.5 } } }),
  submitProjectRating: (req, res) =>
    res.status(201).json({ rating: { id: 10, project_id: Number(req.params.projectId), ...req.body } }),
  updateProjectRating: (req, res) =>
    res.status(200).json({ rating: { id: Number(req.params.ratingId), ...req.body } }),
  deleteProjectRating: (req, res) =>
    res.status(200).json({ message: 'deleted', id: Number(req.params.ratingId) })
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 7, role: req.headers['x-role'] || 'researcher' };
    return next();
  }
}));

const ratingRoutes = require('../../src/routes/ratingRoutes');

describe('ratingRoutes integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/ratings', ratingRoutes);
  });

  test('allows public project rating listing', async () => {
    const response = await request(app).get('/api/projects/9/ratings');

    expect(response.status).toBe(200);
    expect(response.body.ratings[0].project_id).toBe(9);
  });

  test('allows public project rating summary', async () => {
    const response = await request(app).get('/api/projects/9/ratings/summary');

    expect(response.status).toBe(200);
    expect(response.body.summary.averages.overall).toBe(4.5);
  });

  test('requires auth to submit a rating', async () => {
    const response = await request(app)
      .post('/api/projects/9/ratings')
      .send({ comments: 'Great collaboration', scores: { quality: 5, communication: 5, timeliness: 5, overall: 5 } });

    expect(response.status).toBe(401);
  });

  test('submits rating for authenticated user', async () => {
    const response = await request(app)
      .post('/api/projects/9/ratings')
      .set('Authorization', 'Bearer token')
      .send({ comments: 'Great collaboration', scores: { quality: 5, communication: 5, timeliness: 5, overall: 5 } });

    expect(response.status).toBe(201);
    expect(response.body.rating.project_id).toBe(9);
  });

  test('updates and deletes rating for authenticated user', async () => {
    const updateResponse = await request(app)
      .put('/api/projects/9/ratings/3')
      .set('Authorization', 'Bearer token')
      .send({ comments: 'Updated comment' });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.rating.id).toBe(3);

    const deleteResponse = await request(app)
      .delete('/api/projects/9/ratings/3')
      .set('Authorization', 'Bearer token');

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.id).toBe(3);
  });
});
