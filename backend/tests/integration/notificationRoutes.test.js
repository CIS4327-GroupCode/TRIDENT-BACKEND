const request = require('supertest');
const app = require('../../src/index');
const { User, Notification } = require('../../src/database/models');
const jwt = require('jsonwebtoken');

describe('Notification API Integration Tests', () => {
  let authToken;
  let testUser;
  let testNotification;

  beforeAll(async () => {
    // Create a test user
    testUser = await User.create({
      name: 'Notification Test User',
      email: 'notificationtest@example.com',
      password_hash: 'hashedpassword',
      role: 'nonprofit',
      account_status: 'active'
    });

    // Generate auth token
    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test notifications
    testNotification = await Notification.create({
      user_id: testUser.id,
      type: 'project_created',
      title: 'Test Project Created',
      message: 'Your test project has been created',
      link: '/projects/1',
      metadata: { project_id: 1 },
      is_read: false
    });

    await Notification.create({
      user_id: testUser.id,
      type: 'message_received',
      title: 'Test Message',
      message: 'You have a new message',
      link: '/messages',
      is_read: true
    });
  });

  afterAll(async () => {
    await Notification.destroy({ where: { user_id: testUser.id } });
    await User.destroy({ where: { id: testUser.id } });
  });

  describe('GET /api/notifications', () => {
    it('should return notifications for authenticated user', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications).toBeDefined();
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.notifications.length).toBeGreaterThan(0);
      expect(res.body.total).toBeDefined();
      expect(res.body.unreadCount).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
    });

    it('should filter unread notifications', async () => {
      const res = await request(app)
        .get('/api/notifications?unread=true')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications.every(n => !n.is_read)).toBe(true);
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications.length).toBeLessThanOrEqual(1);
      expect(res.body.page).toBe(1);
    });

    it('should filter by notification type', async () => {
      const res = await request(app)
        .get('/api/notifications?type=project_created')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications.every(n => n.type === 'project_created')).toBe(true);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return unread count for authenticated user', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBeDefined();
      expect(typeof res.body.unreadCount).toBe('number');
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(0);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/notifications/unread-count');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const res = await request(app)
        .put(`/api/notifications/${testNotification.id}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notification marked as read');
      expect(res.body.notification.is_read).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .put('/api/notifications/999999/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).put(`/api/notifications/${testNotification.id}/read`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/notifications/:id/unread', () => {
    it('should mark notification as unread', async () => {
      const res = await request(app)
        .put(`/api/notifications/${testNotification.id}/unread`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notification marked as unread');
      expect(res.body.notification.is_read).toBe(false);
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('All notifications marked as read');
      expect(res.body.updatedCount).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).put('/api/notifications/read-all');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete notification', async () => {
      // Create a notification to delete
      const notificationToDelete = await Notification.create({
        user_id: testUser.id,
        type: 'system_announcement',
        title: 'Delete Test',
        message: 'This will be deleted',
        is_read: true
      });

      const res = await request(app)
        .delete(`/api/notifications/${notificationToDelete.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notification deleted successfully');

      // Verify deletion
      const deleted = await Notification.findByPk(notificationToDelete.id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .delete('/api/notifications/999999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/notifications/read', () => {
    it('should delete all read notifications', async () => {
      // Create read notifications
      await Notification.create({
        user_id: testUser.id,
        type: 'system_announcement',
        title: 'Read notification 1',
        message: 'This is read',
        is_read: true
      });

      await Notification.create({
        user_id: testUser.id,
        type: 'system_announcement',
        title: 'Read notification 2',
        message: 'This is also read',
        is_read: true
      });

      const res = await request(app)
        .delete('/api/notifications/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Read notifications deleted successfully');
      expect(res.body.deletedCount).toBeGreaterThan(0);
    });
  });
});
