const express = require('express');
const request = require('supertest');

jest.mock('../../src/controllers/agreementController', () => ({
  getTemplates: (req, res) => res.status(200).json({ templates: [{ type: 'NDA' }] }),
  listAgreements: (req, res) => res.status(200).json({ agreements: [] }),
  createAgreement: (req, res) => res.status(201).json({ agreement: { id: 1, ...req.body } }),
  listAgreementHistory: (req, res) => res.status(200).json({ history: [] }),
  listAgreementReviews: (req, res) => res.status(200).json({ reviews: [] }),
  getAgreement: (req, res) => res.status(200).json({ agreement: { id: Number(req.params.id) } }),
  updateAgreement: (req, res) => res.status(200).json({ agreement: { id: Number(req.params.id), ...req.body } }),
  submitAgreementForReview: (req, res) => res.status(200).json({ message: 'submitted' }),
  reviewAgreement: (req, res) => res.status(200).json({ message: 'reviewed' }),
  counterpartyReviewAgreement: (req, res) => res.status(200).json({ message: 'reviewed' }),
  previewAgreement: (req, res) => res.status(200).json({ agreement_id: Number(req.params.id), preview: 'Preview body' }),
  signAgreement: (req, res) => res.status(200).json({ message: 'signed' }),
  downloadAgreement: (req, res) => res.status(200).send('PDF-BINARY'),
  makeAgreementEffective: (req, res) => res.status(200).json({ message: 'effective' }),
  activateAgreement: (req, res) => res.status(200).json({ message: 'activated' }),
  completeAgreement: (req, res) => res.status(200).json({ message: 'completed' }),
  archiveAgreement: (req, res) => res.status(200).json({ message: 'archived' }),
  createAmendment: (req, res) => res.status(201).json({ agreement: { id: 2 } }),
  terminateAgreement: (req, res) => res.status(200).json({ message: 'terminated' }),
  listAgreementRemovalRequests: (req, res) => res.status(200).json({ removal_requests: [] }),
  requestAgreementRemoval: (req, res) => res.status(201).json({ removal_request: { id: 1 } }),
  approveAgreementRemovalRequest: (req, res) => res.status(200).json({ message: 'approved' }),
  rejectAgreementRemovalRequest: (req, res) => res.status(200).json({ message: 'rejected' })
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 1, role: 'nonprofit', org_id: 1 };
    return next();
  }
}));

jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next()
}));

const agreementRoutes = require('../../src/routes/agreementRoutes');

describe('agreementRoutes integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agreements', agreementRoutes);
  });

  test('requires auth', async () => {
    const response = await request(app).get('/api/agreements');
    expect(response.status).toBe(401);
  });

  test('lists agreements', async () => {
    const response = await request(app)
      .get('/api/agreements')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.agreements).toEqual([]);
  });

  test('creates agreement', async () => {
    const response = await request(app)
      .post('/api/agreements')
      .set('Authorization', 'Bearer token')
      .send({ application_id: 3, template_type: 'NDA', title: 'New NDA' });

    expect(response.status).toBe(201);
    expect(response.body.agreement.application_id).toBe(3);
  });

  test('supports detail, preview, sign, activate, terminate and download', async () => {
    const auth = { Authorization: 'Bearer token' };

    const detail = await request(app).get('/api/agreements/5').set(auth);
    expect(detail.status).toBe(200);

    const preview = await request(app).get('/api/agreements/5/preview').set(auth);
    expect(preview.status).toBe(200);

    const sign = await request(app).post('/api/agreements/5/sign').set(auth);
    expect(sign.status).toBe(200);

    const activate = await request(app).post('/api/agreements/5/activate').set(auth);
    expect(activate.status).toBe(200);

    const terminate = await request(app)
      .post('/api/agreements/5/terminate')
      .set(auth)
      .send({ reason: 'Close project' });
    expect(terminate.status).toBe(200);

    const listRemovalRequests = await request(app)
      .get('/api/agreements/5/removal-requests')
      .set(auth);
    expect(listRemovalRequests.status).toBe(200);

    const createRemovalRequest = await request(app)
      .post('/api/agreements/5/removal-requests')
      .set(auth)
      .send({ reason: 'Duplicate amendment chain' });
    expect(createRemovalRequest.status).toBe(201);

    const approveRemovalRequest = await request(app)
      .post('/api/agreements/5/removal-requests/1/approve')
      .set(auth)
      .send({ feedback: 'Approved' });
    expect(approveRemovalRequest.status).toBe(200);

    const rejectRemovalRequest = await request(app)
      .post('/api/agreements/5/removal-requests/1/reject')
      .set(auth)
      .send({ feedback: 'Rejected' });
    expect(rejectRemovalRequest.status).toBe(200);

    const download = await request(app).get('/api/agreements/5/download').set(auth);
    expect(download.status).toBe(200);
  });
});
