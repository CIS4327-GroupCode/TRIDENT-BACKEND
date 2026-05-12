const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../../src/index');
const sequelize = require('../../src/database');
const {
  User,
  Thread,
  ThreadParticipant,
  Message,
  MessageAttachment,
  MessageUploadAsset,
  UploadSecurityIncident
} = require('../../src/database/models');

describe('Message Upload Routes Integration', () => {
  let senderUser;
  let senderToken;
  let recipientUser;
  let recipientToken;

  beforeAll(async () => {
    await sequelize.authenticate();
    await MessageUploadAsset.sync({ alter: true });
    await UploadSecurityIncident.sync({ alter: true });

    senderUser = await User.create({
      name: 'Message Sender',
      email: `message_sender_${Date.now()}@example.com`,
      password_hash: 'hashed-password',
      role: 'researcher',
      account_status: 'active'
    });

    recipientUser = await User.create({
      name: 'Message Recipient',
      email: `message_recipient_${Date.now()}@example.com`,
      password_hash: 'hashed-password',
      role: 'nonprofit',
      account_status: 'active'
    });

    senderToken = jwt.sign(
      { userId: senderUser.id, email: senderUser.email, role: senderUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    recipientToken = jwt.sign(
      { userId: recipientUser.id, email: recipientUser.email, role: recipientUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await MessageAttachment.destroy({ where: {}, force: true });
    await Message.destroy({ where: {}, force: true });
    await ThreadParticipant.destroy({ where: {}, force: true });
    await Thread.destroy({ where: {}, force: true });
    await MessageUploadAsset.destroy({ where: {}, force: true });
    await UploadSecurityIncident.destroy({ where: { user_id: [senderUser?.id, recipientUser?.id].filter(Boolean) }, force: true });
    await User.destroy({ where: { id: [senderUser?.id, recipientUser?.id].filter(Boolean) }, force: true });
  });

  it('stores clean message uploads in governed storage and allows recipients to download them after send', async () => {
    const threadResponse = await request(app)
      .post('/api/messages/threads/direct')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ otherUserId: recipientUser.id });

    expect(threadResponse.status).toBe(201);
    const threadId = threadResponse.body.thread.id;

    const uploadResponse = await request(app)
      .post('/api/messages/upload')
      .set('Authorization', `Bearer ${senderToken}`)
      .attach('file', Buffer.from('chat attachment content'), {
        filename: 'chat-note.txt',
        contentType: 'text/plain'
      });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.file_url).toMatch(/^\/messages\/uploads\/\d+$/);

    const sendResponse = await request(app)
      .post(`/api/messages/threads/${threadId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({
        body: 'Please review the file',
        attachments: [
          {
            file_name: uploadResponse.body.file_name,
            file_url: uploadResponse.body.file_url
          }
        ]
      });

    expect(sendResponse.status).toBe(201);
    expect(sendResponse.body.message.attachments).toHaveLength(1);
    expect(sendResponse.body.message.attachments[0].file_url).toBe(uploadResponse.body.file_url);

    const downloadResponse = await request(app)
      .get(`/api${uploadResponse.body.file_url}`)
      .set('Authorization', `Bearer ${recipientToken}`);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers['content-type']).toContain('text/plain');
  });

  it('rejects malicious message uploads, records an incident, and auto-suspends the uploader', async () => {
    const uploadResponse = await request(app)
      .post('/api/messages/upload')
      .set('Authorization', `Bearer ${senderToken}`)
      .attach('file', Buffer.from('<script>alert("chat")</script>'), {
        filename: 'chat-note.txt',
        contentType: 'text/plain'
      });

    expect(uploadResponse.status).toBe(422);
    expect(uploadResponse.body.error).toBe('MALICIOUS_UPLOAD_REJECTED');
    expect(uploadResponse.body.accountSuspended).toBe(true);
    expect(uploadResponse.body.incidentId).toBeTruthy();

    const incident = await UploadSecurityIncident.findByPk(uploadResponse.body.incidentId);
    expect(incident).toBeTruthy();
    expect(incident.surface).toBe('message_attachment');
    expect(incident.action_taken).toBe('rejected_and_suspended');

    const suspendedSender = await User.findByPk(senderUser.id, { paranoid: false });
    expect(suspendedSender.deleted_at).toBeTruthy();

    const blockedRequest = await request(app)
      .get('/api/messages/threads')
      .set('Authorization', `Bearer ${senderToken}`);

    expect(blockedRequest.status).toBe(401);
    expect(blockedRequest.body.error).toBe('Account has been suspended');
  });
});