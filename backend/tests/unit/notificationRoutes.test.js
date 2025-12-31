const request = require('supertest');
const app = require('../../src/index');
const { User, Notification } = require('../../src/database/models');
const jwt = require('jsonwebtoken');

describe('Notification Routes', () => {
  let authToken;
  let testUser;
  let otherUser;
  let testNotifications = [];

  beforeAll(async () => {
    // Create test users
    testUser = await User.create({
      name: 'Test User',
      email: 'testuser@example.com',
      password_hash: 'hashedpassword',
      role: 'nonprofit',
      account_status: 'active'
    });

    otherUser = await User.create({
      name: 'Other User',
      email: 'otheruser@example.com',
      password_hash: 'hashedpassword',
      role: 'researcher',
      account_status: 'active'
    });

    // Generate auth token
    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create test notifications
    for (let i = 0; i < 5; i++) {
      const notification = await Notification.create({
        user_id: testUser.id,
        type: 'project_created',
        title: `Test Notification ${i + 1}`,
        message: `This is test notification ${i + 1}`,
        link: `/projects/${i + 1}`,
        is_read: i % 2 === 0, // Alternate read/unread
        metadata: { test: true, index: i }
      });
      testNotifications.push(notification);
    }
  });

  afterAll(async () => {
    // Clean up test data
    await Notification.destroy({ where: { user_id: testUser.id } });
    await Notification.destroy({ where: { user_id: otherUser.id } });
    await User.destroy({ where: { id: testUser.id } });
    await User.destroy({ where: { id: otherUser.id } });
  });

  describe('GET /api/notifications', () => {
    it('should return paginated notifications for authenticated user', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('unreadCount');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.notifications.length).toBeLessThanOrEqual(10);
    });

    it('should filter unread notifications when unread=true', async () => {
      const res = await request(app)
        .get('/api/notifications?unread=true')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications.every(n => !n.is_read)).toBe(true);
    });

    it('should filter by notification type', async () => {
      const res = await request(app)
        .get('/api/notifications?type=project_created')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications.every(n => n.type === 'project_created')).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/notifications');

      expect(res.status).toBe(401);
    });

    it('should enforce pagination limits (max 100)', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=200')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return unread notification count', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('unreadCount');
      expect(typeof res.body.unreadCount).toBe('number');
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(0);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const unreadNotification = testNotifications.find(n => !n.is_read);
      
      const res = await request(app)
        .put(`/api/notifications/${unreadNotification.id}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Notification marked as read');
      expect(res.body.notification.is_read).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .put('/api/notifications/99999/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Notification not found');
    });

    it('should not allow marking other users notifications as read', async () => {
      const otherNotification = await Notification.create({
        user_id: otherUser.id,
        type: 'message_received',
        title: 'Other User Notification',
        message: 'This belongs to another user',
        is_read: false
      });

      const res = await request(app)
        .put(`/api/notifications/${otherNotification.id}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);

      await otherNotification.destroy();
    });
  });

  describe('PUT /api/notifications/:id/unread', () => {
    it('should mark notification as unread', async () => {
      const readNotification = testNotifications.find(n => n.is_read);
      
      const res = await request(app)
        .put(`/api/notifications/${readNotification.id}/unread`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Notification marked as unread');
      expect(res.body.notification.is_read).toBe(false);
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'All notifications marked as read');
      expect(res.body).toHaveProperty('updatedCount');
      expect(typeof res.body.updatedCount).toBe('number');

      // Verify all are read
      const unreadCount = await Notification.count({
        where: { user_id: testUser.id, is_read: false }
      });
      expect(unreadCount).toBe(0);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete notification', async () => {
      const notification = await Notification.create({
        user_id: testUser.id,
        type: 'system_announcement',
        title: 'To be deleted',
        message: 'This will be deleted',
        is_read: true
      });

      const res = await request(app)
        .delete(`/api/notifications/${notification.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Notification deleted successfully');

      // Verify deletion
      const deletedNotification = await Notification.findByPk(notification.id);
      expect(deletedNotification).toBeNull();
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .delete('/api/notifications/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/notifications/read', () => {
    it('should delete all read notifications', async () => {
      // Create some read notifications
      await Notification.create({
        user_id: testUser.id,
        type: 'message_received',
        title: 'Read notification 1',
        message: 'This is read',
        is_read: true
      });

      await Notification.create({
        user_id: testUser.id,
        type: 'message_received',
        title: 'Read notification 2',
        message: 'This is also read',
        is_read: true
      });

      const res = await request(app)
        .delete('/api/notifications/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Read notifications deleted successfully');
      expect(res.body.deletedCount).toBeGreaterThan(0);

      // Verify only unread remain
      const remainingNotifications = await Notification.findAll({
        where: { user_id: testUser.id }
      });
      expect(remainingNotifications.every(n => !n.is_read)).toBe(true);
    });
  });
});
