const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../../src/index');
const sequelize = require('../../src/database');
const {
  User,
  Organization,
  Project,
  Application,
  ResearcherProfile,
  Attachment
} = require('../../src/database/models');

describe('Attachment Routes Integration', () => {
  let nonprofitUser;
  let nonprofitToken;
  let unauthorizedNonprofit;
  let unauthorizedNonprofitToken;
  let researcherUser;
  let researcherToken;
  let unrelatedResearcher;
  let unrelatedResearcherToken;
  let project;

  const storageRoot = process.env.ATTACHMENT_LOCAL_PATH
    ? path.resolve(process.env.ATTACHMENT_LOCAL_PATH)
    : path.resolve(__dirname, '../../src/uploads/attachments');

  beforeAll(async () => {
    await sequelize.authenticate();
    await Attachment.sync({ alter: true });

    nonprofitUser = await User.create({
      name: 'Attachment Nonprofit',
      email: `attachment_nonprofit_${Date.now()}@example.com`,
      password_hash: 'hashed-password',
      role: 'nonprofit',
      account_status: 'active'
    });

    const org = await Organization.create({
      name: `Attachment Org ${Date.now()}`
    });

    nonprofitUser.org_id = org.id;
    await nonprofitUser.save();

    project = await Project.create({
      title: 'Attachment Test Project',
      org_id: org.id,
      status: 'open'
    });

    unauthorizedNonprofit = await User.create({
      name: 'Other Nonprofit',
      email: `other_nonprofit_${Date.now()}@example.com`,
      password_hash: 'hashed-password',
      role: 'nonprofit',
      account_status: 'active'
    });

    const otherOrg = await Organization.create({
      name: `Other Org ${Date.now()}`
    });
    unauthorizedNonprofit.org_id = otherOrg.id;
    await unauthorizedNonprofit.save();

    researcherUser = await User.create({
      name: 'Authorized Researcher',
      email: `authorized_researcher_${Date.now()}@example.com`,
      password_hash: 'hashed-password',
      role: 'researcher',
      account_status: 'active'
    });

    await ResearcherProfile.create({
      user_id: researcherUser.id,
      bio: 'Authorized researcher profile'
    });

    await Application.create({
      researcher_id: researcherUser.id,
      org_id: project.org_id,
      project_id: project.project_id,
      status: 'accepted',
      type: 'project_application'
    });

    unrelatedResearcher = await User.create({
      name: 'Unrelated Researcher',
      email: `unrelated_researcher_${Date.now()}@example.com`,
      password_hash: 'hashed-password',
      role: 'researcher',
      account_status: 'active'
    });

    await ResearcherProfile.create({
      user_id: unrelatedResearcher.id,
      bio: 'Unrelated researcher profile'
    });

    nonprofitToken = jwt.sign(
      { userId: nonprofitUser.id, email: nonprofitUser.email, role: nonprofitUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    unauthorizedNonprofitToken = jwt.sign(
      { userId: unauthorizedNonprofit.id, email: unauthorizedNonprofit.email, role: unauthorizedNonprofit.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    researcherToken = jwt.sign(
      { userId: researcherUser.id, email: researcherUser.email, role: researcherUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    unrelatedResearcherToken = jwt.sign(
      { userId: unrelatedResearcher.id, email: unrelatedResearcher.email, role: unrelatedResearcher.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Attachment.destroy({ where: { project_id: project.project_id }, force: true });
    await Application.destroy({ where: { project_id: project.project_id }, force: true });
    await Project.destroy({ where: { project_id: project.project_id }, force: true });
    await ResearcherProfile.destroy({ where: { user_id: [researcherUser.id, unrelatedResearcher.id] }, force: true });
    await User.destroy({ where: { id: [nonprofitUser.id, unauthorizedNonprofit.id, researcherUser.id, unrelatedResearcher.id] }, force: true });
    await Organization.destroy({ where: { id: [nonprofitUser.org_id, unauthorizedNonprofit.org_id] }, force: true });

    if (fs.existsSync(storageRoot)) {
      await fs.promises.rm(storageRoot, { recursive: true, force: true });
    }
  });

  describe('happy path upload/list/download/delete', () => {
    it('uploads, lists, downloads and deletes an attachment for own project', async () => {
      const uploadResponse = await request(app)
        .post(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .attach('file', Buffer.from('important test file content'), {
          filename: 'project-brief.txt',
          contentType: 'text/plain'
        });

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.attachment).toBeDefined();
      expect(uploadResponse.body.attachment.filename).toBe('project-brief.txt');

      const attachmentId = uploadResponse.body.attachment.id;

      const listResponse = await request(app)
        .get(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.attachments)).toBe(true);
      expect(listResponse.body.attachments.some((item) => item.id === attachmentId)).toBe(true);

      const researcherListResponse = await request(app)
        .get(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(researcherListResponse.status).toBe(200);
      expect(researcherListResponse.body.attachments.some((item) => item.id === attachmentId)).toBe(true);

      const downloadResponse = await request(app)
        .get(`/api/projects/${project.project_id}/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.headers['content-type']).toContain('text/plain');

      const deleteResponse = await request(app)
        .delete(`/api/projects/${project.project_id}/attachments/${attachmentId}`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(deleteResponse.status).toBe(200);

      const afterDeleteListResponse = await request(app)
        .get(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${nonprofitToken}`);

      expect(afterDeleteListResponse.status).toBe(200);
      expect(afterDeleteListResponse.body.attachments.some((item) => item.id === attachmentId)).toBe(false);
    });
  });

  describe('validation and authorization', () => {
    it('rejects unsupported MIME type', async () => {
      const response = await request(app)
        .post(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .attach('file', Buffer.from('binary-content'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Unsupported file type');
    });

    it('rejects oversize files', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');
      const response = await request(app)
        .post(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .attach('file', largeBuffer, {
          filename: 'large-file.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File exceeds size limit');
    });

    it('blocks unrelated users from accessing or deleting attachments', async () => {
      const uploadResponse = await request(app)
        .post(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${nonprofitToken}`)
        .attach('file', Buffer.from('visibility test content'), {
          filename: 'visibility.txt',
          contentType: 'text/plain'
        });

      expect(uploadResponse.status).toBe(201);
      const attachmentId = uploadResponse.body.attachment.id;

      const unauthorizedList = await request(app)
        .get(`/api/projects/${project.project_id}/attachments`)
        .set('Authorization', `Bearer ${unrelatedResearcherToken}`);
      expect(unauthorizedList.status).toBe(403);

      const unauthorizedDeleteByNonprofit = await request(app)
        .delete(`/api/projects/${project.project_id}/attachments/${attachmentId}`)
        .set('Authorization', `Bearer ${unauthorizedNonprofitToken}`);
      expect(unauthorizedDeleteByNonprofit.status).toBe(403);

      await request(app)
        .delete(`/api/projects/${project.project_id}/attachments/${attachmentId}`)
        .set('Authorization', `Bearer ${nonprofitToken}`);
    });
  });
});