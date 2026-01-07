/**
 * Application Controller Tests
 * Tests for apply, accept, reject, and list endpoints
 */

const request = require('supertest');
const app = require('../../src/index');
const {
  User,
  Project,
  Organization,
  Application,
  Notification,
  ResearcherProfile
} = require('../../src/database/models');
const jwt = require('jsonwebtoken');

describe('Application Controller Integration Tests', () => {
  let researcherToken;
  let researcherUser;
  let researcherProfile;
  let nonprofitToken;
  let nonprofitUser;
  let nonprofitOrg;
  let testProject;
  let testApplication;

  beforeAll(async () => {
    // Create nonprofit user and organization
    nonprofitUser = await User.create({
      name: 'Test Nonprofit',
      email: 'nonprofit@test.com',
      password_hash: 'hashedpassword',
      role: 'nonprofit',
      account_status: 'active'
    });

    nonprofitOrg = await Organization.create({
      name: 'Test Organization',
      owner_id: nonprofitUser.id,
      status: 'active'
    });

    nonprofitToken = jwt.sign(
      { id: nonprofitUser.id, email: nonprofitUser.email, role: 'nonprofit' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create researcher user with profile
    researcherUser = await User.create({
      name: 'Test Researcher',
      email: 'researcher@test.com',
      password_hash: 'hashedpassword',
      role: 'researcher',
      account_status: 'active'
    });

    researcherProfile = await ResearcherProfile.create({
      user_id: researcherUser.id,
      bio: 'Test researcher'
    });

    researcherToken = jwt.sign(
      { id: researcherUser.id, email: researcherUser.email, role: 'researcher' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test project
    testProject = await Project.create({
      org_id: nonprofitOrg.id,
      owner_id: nonprofitUser.id,
      title: 'Test Project',
      description: 'A test project for applications',
      status: 'open'
    });
  });

  afterAll(async () => {
    await Notification.destroy({
      where: { user_id: [researcherUser.id, nonprofitUser.id] }
    });
    await Application.destroy({ where: { project_id: testProject.id } });
    await Project.destroy({ where: { id: testProject.id } });
    await ResearcherProfile.destroy({ where: { user_id: researcherUser.id } });
    await Organization.destroy({ where: { id: nonprofitOrg.id } });
    await User.destroy({ where: { id: [researcherUser.id, nonprofitUser.id] } });
  });

  afterEach(async () => {
    await Notification.destroy({
      where: { user_id: [researcherUser.id, nonprofitUser.id] }
    });
  });

  describe('POST /api/applications/projects/:projectId/apply', () => {
    it('should allow researcher to apply to a project', async () => {
      const res = await request(app)
        .post(`/api/applications/projects/${testProject.id}/apply`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          message: 'I am interested in this project'
        });

      expect(res.status).toBe(201);
      expect(res.body.application).toBeDefined();
      expect(res.body.application.researcher_id).toBe(researcherUser.id);
      expect(res.body.application.project_id).toBe(testProject.id);
      expect(res.body.application.status).toBe('pending');

      // Store for later tests
      testApplication = res.body.application;
    });

    it('should create notifications for owner and researcher', async () => {
      // Clear previous notifications
      await Notification.destroy({
        where: { user_id: [researcherUser.id, nonprofitUser.id] }
      });

      await request(app)
        .post(`/api/applications/projects/${testProject.id}/apply`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          message: 'Another application'
        });

      // Check owner notification
      const ownerNotifications = await Notification.findAll({
        where: {
          user_id: nonprofitUser.id,
          type: 'application_received'
        }
      });

      expect(ownerNotifications.length).toBeGreaterThan(0);

      // Check researcher notification
      const researcherNotifications = await Notification.findAll({
        where: {
          user_id: researcherUser.id,
          type: 'application_received'
        }
      });

      expect(researcherNotifications.length).toBeGreaterThan(0);
    });

    it('should prevent duplicate pending applications', async () => {
      const res = await request(app)
        .post(`/api/applications/projects/${testProject.id}/apply`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          message: 'Duplicate application'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already applied');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`/api/applications/projects/${testProject.id}/apply`)
        .send({
          message: 'No auth'
        });

      expect(res.status).toBe(401);
    });

    it('should return 403 if user is not a researcher', async () => {
      const res = await request(app)
        .post(`/api/applications/projects/${testProject.id}/apply`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .send({
          message: 'Nonprofit trying to apply'
        });

      expect(res.status).toBe(403);
    });

    it('should return 404 if project does not exist', async () => {
      const res = await request(app)
        .post('/api/applications/projects/999999/apply')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          message: 'Non-existent project'
        });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/applications/projects/:projectId', () => {
    beforeAll(async () => {
      // Ensure there's an application for the test project
      if (!testApplication || !testApplication.id) {
        const app1 = await Application.create({
          researcher_id: researcherUser.id,
          project_id: testProject.id,
          status: 'pending'
        });
        testApplication = app1;
      }
    });

    it('should allow nonprofit to view applications for their project', async () => {
      const res = await request(app)
        .get(`/api/applications/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.applications)).toBe(true);
      expect(res.body.applications.length).toBeGreaterThan(0);
      expect(res.body.applications[0]).toHaveProperty('researcher_id');
      expect(res.body.applications[0]).toHaveProperty('status');
    });

    it('should return 403 if user is not the project owner', async () => {
      // Create another researcher
      const otherResearcher = await User.create({
        name: 'Other Researcher',
        email: 'other@test.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      const otherToken = jwt.sign(
        { id: otherResearcher.id, email: otherResearcher.email, role: 'researcher' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get(`/api/applications/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);

      // Cleanup
      await User.destroy({ where: { id: otherResearcher.id } });
    });

    it('should filter applications by status', async () => {
      const res = await request(app)
        .get(`/api/applications/projects/${testProject.id}?status=pending`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.applications)).toBe(true);
      res.body.applications.forEach(app => {
        expect(app.status).toBe('pending');
      });
    });
  });

  describe('POST /api/applications/:applicationId/accept', () => {
    beforeAll(async () => {
      // Ensure we have an application
      if (!testApplication || !testApplication.id) {
        testApplication = await Application.create({
          researcher_id: researcherUser.id,
          project_id: testProject.id,
          status: 'pending'
        });
      }
    });

    it('should allow nonprofit to accept an application', async () => {
      const res = await request(app)
        .post(`/api/applications/${testApplication.id}/accept`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe('accepted');
    });

    it('should create notification for researcher on acceptance', async () => {
      // Create new application
      const app = await Application.create({
        researcher_id: researcherUser.id,
        project_id: testProject.id,
        status: 'pending'
      });

      await Notification.destroy({
        where: { user_id: researcherUser.id, type: 'application_accepted' }
      });

      await request(app)
        .post(`/api/applications/${app.id}/accept`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      const notifications = await Notification.findAll({
        where: {
          user_id: researcherUser.id,
          type: 'application_accepted'
        }
      });

      expect(notifications.length).toBeGreaterThan(0);
    });

    it('should return 403 if user is not the project owner', async () => {
      const otherResearcher = await User.create({
        name: 'Other Researcher 2',
        email: 'other2@test.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      const otherToken = jwt.sign(
        { id: otherResearcher.id, email: otherResearcher.email, role: 'researcher' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const app = await Application.create({
        researcher_id: researcherUser.id,
        project_id: testProject.id,
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/applications/${app.id}/accept`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);

      // Cleanup
      await Application.destroy({ where: { id: app.id } });
      await User.destroy({ where: { id: otherResearcher.id } });
    });

    it('should return 404 if application does not exist', async () => {
      const res = await request(app)
        .post('/api/applications/999999/accept')
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/applications/:applicationId/reject', () => {
    it('should allow nonprofit to reject an application with reason', async () => {
      const app = await Application.create({
        researcher_id: researcherUser.id,
        project_id: testProject.id,
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/applications/${app.id}/reject`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .send({
          reason: 'Not a good fit for this project'
        });

      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe('rejected');
      expect(res.body.application.metadata?.reason).toBe('Not a good fit for this project');
    });

    it('should create notification for researcher on rejection', async () => {
      const app = await Application.create({
        researcher_id: researcherUser.id,
        project_id: testProject.id,
        status: 'pending'
      });

      await Notification.destroy({
        where: { user_id: researcherUser.id, type: 'application_rejected' }
      });

      await request(app)
        .post(`/api/applications/${app.id}/reject`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .send({
          reason: 'Selection complete'
        });

      const notifications = await Notification.findAll({
        where: {
          user_id: researcherUser.id,
          type: 'application_rejected'
        }
      });

      expect(notifications.length).toBeGreaterThan(0);
    });

    it('should allow rejection without reason', async () => {
      const app = await Application.create({
        researcher_id: researcherUser.id,
        project_id: testProject.id,
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/applications/${app.id}/reject`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe('rejected');
    });
  });

  describe('GET /api/applications', () => {
    it('should return researchers own applications', async () => {
      const res = await request(app)
        .get('/api/applications')
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.applications)).toBe(true);
      res.body.applications.forEach(app => {
        expect(app.researcher_id).toBe(researcherUser.id);
      });
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/applications');
      expect(res.status).toBe(401);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/applications?status=accepted')
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.applications)).toBe(true);
      res.body.applications.forEach(app => {
        expect(app.status).toBe('accepted');
      });
    });

    it('should return empty list if researcher has no applications', async () => {
      const newResearcher = await User.create({
        name: 'New Researcher',
        email: 'newresearch@test.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      const newToken = jwt.sign(
        { id: newResearcher.id, email: newResearcher.email, role: 'researcher' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/applications')
        .set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(200);
      expect(res.body.applications.length).toBe(0);

      // Cleanup
      await User.destroy({ where: { id: newResearcher.id } });
    });
  });
});
