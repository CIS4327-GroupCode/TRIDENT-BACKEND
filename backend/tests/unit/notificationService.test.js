const notificationService = require('../../src/services/notificationService');
const { Notification, User } = require('../../src/database/models');

describe('Notification Service', () => {
  let testUser;

  beforeAll(async () => {
    testUser = await User.create({
      name: 'Service Test User',
      email: 'servicetest@example.com',
      password_hash: 'hashedpassword',
      role: 'nonprofit',
      account_status: 'active'
    });
  });

  afterAll(async () => {
    await Notification.destroy({ where: { user_id: testUser.id } });
    await User.destroy({ where: { id: testUser.id } });
  });

  afterEach(async () => {
    await Notification.destroy({ where: { user_id: testUser.id } });
  });

  describe('createNotification', () => {
    it('should create a notification with all fields', async () => {
      const notificationData = {
        userId: testUser.id,
        type: 'project_created',
        title: 'Project Created',
        message: 'Your project has been created successfully',
        link: '/projects/123',
        metadata: { project_id: 123 }
      };

      const notification = await notificationService.createNotification(notificationData);

      expect(notification).toBeDefined();
      expect(notification.id).toBeDefined();
      expect(notification.user_id).toBe(testUser.id);
      expect(notification.type).toBe('project_created');
      expect(notification.title).toBe('Project Created');
      expect(notification.message).toBe('Your project has been created successfully');
      expect(notification.link).toBe('/projects/123');
      expect(notification.is_read).toBe(false);
      expect(notification.metadata).toEqual({ project_id: 123 });
    });

    it('should create notification without optional fields', async () => {
      const notificationData = {
        userId: testUser.id,
        type: 'message_received',
        title: 'New Message',
        message: 'You have a new message'
      };

      const notification = await notificationService.createNotification(notificationData);

      expect(notification).toBeDefined();
      expect(notification.link).toBeNull();
      expect(notification.metadata).toBeNull();
    });

    it('should throw error if required fields are missing', async () => {
      const invalidData = {
        userId: testUser.id,
        type: 'project_created',
        // Missing title and message
      };

      await expect(
        notificationService.createNotification(invalidData)
      ).rejects.toThrow('Missing required notification fields');
    });

    it('should throw error if userId is missing', async () => {
      const invalidData = {
        type: 'project_created',
        title: 'Test',
        message: 'Test message'
      };

      await expect(
        notificationService.createNotification(invalidData)
      ).rejects.toThrow('Missing required notification fields');
    });
  });

  describe('createBulkNotifications', () => {
    it('should create notifications for multiple users', async () => {
      const user2 = await User.create({
        name: 'Bulk Test User 2',
        email: 'bulktest2@example.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      const user3 = await User.create({
        name: 'Bulk Test User 3',
        email: 'bulktest3@example.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      const userIds = [testUser.id, user2.id, user3.id];
      const notificationData = {
        type: 'system_announcement',
        title: 'System Maintenance',
        message: 'The system will be under maintenance',
        link: '/announcements/1'
      };

      const notifications = await notificationService.createBulkNotifications(
        userIds,
        notificationData
      );

      expect(notifications).toHaveLength(3);
      expect(notifications[0].user_id).toBe(testUser.id);
      expect(notifications[1].user_id).toBe(user2.id);
      expect(notifications[2].user_id).toBe(user3.id);
      expect(notifications.every(n => n.type === 'system_announcement')).toBe(true);

      // Clean up
      await Notification.destroy({ where: { user_id: [user2.id, user3.id] } });
      await User.destroy({ where: { id: [user2.id, user3.id] } });
    });

    it('should throw error if no user IDs provided', async () => {
      const notificationData = {
        type: 'system_announcement',
        title: 'Test',
        message: 'Test message'
      };

      await expect(
        notificationService.createBulkNotifications([], notificationData)
      ).rejects.toThrow('No user IDs provided');
    });

    it('should throw error if required fields are missing', async () => {
      const invalidData = {
        type: 'system_announcement'
        // Missing title and message
      };

      await expect(
        notificationService.createBulkNotifications([testUser.id], invalidData)
      ).rejects.toThrow('Missing required notification fields');
    });
  });

  describe('isNotificationEnabled', () => {
    it('should return true if no preferences exist', () => {
      const result = notificationService.isNotificationEnabled(null, 'project_created');
      expect(result).toBe(true);
    });

    it('should return true if notification settings not configured', () => {
      const preferences = {};
      const result = notificationService.isNotificationEnabled(preferences, 'project_created');
      expect(result).toBe(true);
    });

    it('should return false if in-app notifications disabled globally', () => {
      const preferences = {
        notification_settings: {
          in_app_enabled: false
        }
      };
      const result = notificationService.isNotificationEnabled(preferences, 'project_created');
      expect(result).toBe(false);
    });

    it('should return false if specific notification type disabled', () => {
      const preferences = {
        notification_settings: {
          in_app_enabled: true,
          types: {
            project_created: false
          }
        }
      };
      const result = notificationService.isNotificationEnabled(preferences, 'project_created');
      expect(result).toBe(false);
    });

    it('should return true if specific notification type enabled', () => {
      const preferences = {
        notification_settings: {
          in_app_enabled: true,
          types: {
            project_created: true,
            message_received: false
          }
        }
      };
      const result = notificationService.isNotificationEnabled(preferences, 'project_created');
      expect(result).toBe(true);
    });
  });
});
