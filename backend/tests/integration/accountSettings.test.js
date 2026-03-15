/**
 * Integration Tests for Account Settings
 */

jest.mock('../../src/services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendNotificationEmail: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sequelize = require('../../src/database');
const { User, UserPreferences, EmailVerification, AuditLog } = require('../../src/database/models');
const app = require('../../src/index');

describe('Account Settings Integration', () => {
  let testUser;
  let authToken;
  let testTimestamp;

  beforeAll(async () => {
    await sequelize.authenticate();
  });

  beforeEach(async () => {
    testTimestamp = Date.now();
    const password_hash = await bcrypt.hash('OldPass123!', 10);

    testUser = await User.create({
      name: `Settings User ${testTimestamp}`,
      email: `settings_${testTimestamp}@example.com`,
      password_hash,
      role: 'researcher',
      account_status: 'active',
    });

    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    await AuditLog.destroy({ where: { actor_id: testUser.id } });
    await EmailVerification.destroy({ where: { user_id: testUser.id } });
    await UserPreferences.destroy({ where: { user_id: testUser.id } });
    await User.destroy({ where: { id: testUser.id }, force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('supports profile + preferences + password + delete flow and writes audits', async () => {
    const profileUpdate = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: ' Updated Name ',
      });

    expect(profileUpdate.status).toBe(200);
    expect(profileUpdate.body).toHaveProperty('emailVerificationSent', false);

    const preferencesUpdate = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        email_notifications: false,
        inapp_notifications: true,
      });

    expect(preferencesUpdate.status).toBe(200);

    const passwordUpdate = await request(app)
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!',
      });

    expect(passwordUpdate.status).toBe(200);
    expect(passwordUpdate.body).toEqual(
      expect.objectContaining({ requireReLogin: true })
    );

    const accountDelete = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(accountDelete.status).toBe(200);

    const [auditRows] = await sequelize.query(
      'SELECT COUNT(*)::int AS count FROM audit_logs WHERE actor_id = :actorId',
      { replacements: { actorId: testUser.id } }
    );
    expect(auditRows[0].count).toBeGreaterThan(0);
  });

  it('triggers email re-verification and marks account pending on email change', async () => {
    const profileUpdate = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        email: `new_settings_${testTimestamp}@example.com`,
      });

    expect(profileUpdate.status).toBe(200);
    expect(profileUpdate.body).toHaveProperty('emailVerificationSent', true);

    const updatedUser = await User.findByPk(testUser.id);
    expect(updatedUser.account_status).toBe('pending');
  });

  it('rate limits repeated password change attempts', async () => {
    const attempts = [];

    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'WrongPass123!',
          newPassword: 'NewPass123!',
        });
      attempts.push(response.status);
    }

    expect(attempts[attempts.length - 1]).toBe(429);
  });
});
