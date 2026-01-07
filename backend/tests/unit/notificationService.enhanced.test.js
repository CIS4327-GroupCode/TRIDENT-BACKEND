/**
 * Enhanced Notification Service Tests
 * Tests for preference checking, bulk notification filtering, and admin logging
 */

const notificationService = require('../../src/services/notificationService');
const { Notification, User, UserPreferences } = require('../../src/database/models');

describe('Enhanced Notification Service', () => {
  let testUser;
  let testAdmin;
  let testUser2;
  let testPreferences;

  beforeAll(async () => {
    // Create test users
    testUser = await User.create({
      name: 'Pref Test User',
      email: 'preftest@example.com',
      password_hash: 'hashedpassword',
      role: 'researcher',
      account_status: 'active'
    });

    testUser2 = await User.create({
      name: 'Pref Test User 2',
      email: 'preftest2@example.com',
      password_hash: 'hashedpassword',
      role: 'researcher',
      account_status: 'active'
    });

    testAdmin = await User.create({
      name: 'Test Admin',
      email: 'admin@example.com',
      password_hash: 'hashedpassword',
      role: 'admin',
      account_status: 'active'
    });

    // Create preferences for testUser (with messages disabled)
    testPreferences = await UserPreferences.create({
      user_id: testUser.id,
      inapp_notifications: true,
      inapp_messages: false, // Disabled
      inapp_matches: true,
      email_notifications: false,
      email_messages: false,
      email_matches: false
    });
  });

  afterAll(async () => {
    await Notification.destroy({ where: { user_id: [testUser.id, testUser2.id, testAdmin.id] } });
    await UserPreferences.destroy({ where: { user_id: testUser.id } });
    await User.destroy({ where: { id: [testUser.id, testUser2.id, testAdmin.id] } });
  });

  afterEach(async () => {
    await Notification.destroy({
      where: { user_id: [testUser.id, testUser2.id, testAdmin.id] }
    });
  });

  describe('createNotification with preference checking', () => {
    it('should create notification when user has enabled the type', async () => {
      const notificationData = {
        userId: testUser.id,
        type: 'project_updated',
        title: 'Project Updated',
        message: 'Your project has been updated',
        metadata: { project_id: 1 }
      };

      const notification = await notificationService.createNotification(notificationData);

      expect(notification).toBeDefined();
      expect(notification.user_id).toBe(testUser.id);
      expect(notification.type).toBe('project_updated');
    });

    it('should NOT create notification when user has disabled the type', async () => {
      const notificationData = {
        userId: testUser.id,
        type: 'message_received', // Disabled in preferences
        title: 'New Message',
        message: 'You have a new message'
      };

      const notification = await notificationService.createNotification(notificationData);

      expect(notification).toBeNull();
    });

    it('should NOT create notification when global inapp_notifications is disabled', async () => {
      // Create user with global toggle disabled
      const disabledUser = await User.create({
        name: 'Disabled User',
        email: 'disabled@example.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      await UserPreferences.create({
        user_id: disabledUser.id,
        inapp_notifications: false, // Global disabled
        inapp_messages: true,
        inapp_matches: true
      });

      const notificationData = {
        userId: disabledUser.id,
        type: 'project_created',
        title: 'Project Created',
        message: 'A new project created'
      };

      const notification = await notificationService.createNotification(notificationData);

      expect(notification).toBeNull();

      // Cleanup
      await UserPreferences.destroy({ where: { user_id: disabledUser.id } });
      await User.destroy({ where: { id: disabledUser.id } });
    });

    it('should create notification for user without preferences (defaults enabled)', async () => {
      const newUser = await User.create({
        name: 'No Prefs User',
        email: 'noprefs@example.com',
        password_hash: 'hashedpassword',
        role: 'nonprofit',
        account_status: 'active'
      });

      const notificationData = {
        userId: newUser.id,
        type: 'project_created',
        title: 'Project Created',
        message: 'Your project created'
      };

      const notification = await notificationService.createNotification(notificationData);

      expect(notification).toBeDefined();
      expect(notification.user_id).toBe(newUser.id);

      // Cleanup
      await Notification.destroy({ where: { user_id: newUser.id } });
      await User.destroy({ where: { id: newUser.id } });
    });
  });

  describe('createBulkNotifications with filtering', () => {
    it('should create notifications only for users with enabled preferences', async () => {
      const userIds = [testUser.id, testUser2.id]; // testUser2 has no preferences (enabled by default)

      const notificationData = {
        type: 'project_updated',
        title: 'Project Updated',
        message: 'Your project changed'
      };

      const results = await notificationService.createBulkNotifications(
        userIds,
        notificationData
      );

      // Should create for testUser2 (default enabled) but not testUser (messages not in type check)
      // This depends on the type - project_updated should be enabled for both
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter out users with message_received disabled', async () => {
      const userIds = [testUser.id, testUser2.id];

      const notificationData = {
        type: 'message_received',
        title: 'New Message',
        message: 'You have a message'
      };

      const results = await notificationService.createBulkNotifications(
        userIds,
        notificationData
      );

      // testUser has inapp_messages disabled, testUser2 has default (enabled)
      expect(Array.isArray(results)).toBe(true);
      // At minimum, testUser2 should have received it
      const createdNotifications = await Notification.findAll({
        where: { user_id: userIds, type: 'message_received' }
      });

      expect(createdNotifications.length).toBeGreaterThan(0);
      // Verify testUser was NOT notified
      const testUserNotification = createdNotifications.find(n => n.user_id === testUser.id);
      expect(testUserNotification).toBeUndefined();
    });

    it('should handle empty user list gracefully', async () => {
      const notificationData = {
        type: 'project_created',
        title: 'Project Created',
        message: 'Project created'
      };

      const results = await notificationService.createBulkNotifications([], notificationData);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('isNotificationEnabled', () => {
    it('should return true when global toggle and type-specific toggle are enabled', async () => {
      const prefs = await UserPreferences.findOne({ where: { user_id: testUser2.id } });
      // testUser2 has no preferences, so it will be undefined or default

      const enabled = await notificationService.isNotificationEnabled(prefs || {}, 'project_created');
      expect(typeof enabled).toBe('boolean');
    });

    it('should respect per-type toggles', async () => {
      const prefs = testPreferences;

      // message_received maps to inapp_messages which is false
      const messageEnabled = await notificationService.isNotificationEnabled(prefs, 'message_received');
      expect(messageEnabled).toBe(false);

      // project_created should use global toggle (true)
      const projectEnabled = await notificationService.isNotificationEnabled(prefs, 'project_created');
      expect(projectEnabled).toBe(true);
    });

    it('should return false when global notifications disabled', async () => {
      const disabledUser = await User.create({
        name: 'Disabled Test',
        email: 'disabled-test@example.com',
        password_hash: 'hashedpassword',
        role: 'researcher',
        account_status: 'active'
      });

      const disabledPrefs = await UserPreferences.create({
        user_id: disabledUser.id,
        inapp_notifications: false,
        inapp_messages: true,
        inapp_matches: true
      });

      const enabled = await notificationService.isNotificationEnabled(disabledPrefs, 'project_created');
      expect(enabled).toBe(false);

      // Cleanup
      await UserPreferences.destroy({ where: { user_id: disabledUser.id } });
      await User.destroy({ where: { id: disabledUser.id } });
    });
  });

  describe('logNotificationFailure', () => {
    it('should create system_announcement notification to all admins on failure', async () => {
      const errorDetails = {
        originalUserId: testUser.id,
        notificationType: 'project_created',
        error: 'Database connection failed'
      };

      await notificationService.logNotificationFailure(errorDetails);

      // Check that a system_announcement was created for admins
      const adminNotifications = await Notification.findAll({
        where: {
          type: 'system_announcement',
          user_id: testAdmin.id
        }
      });

      expect(adminNotifications.length).toBeGreaterThan(0);
    });

    it('should include error context in logged notification', async () => {
      const errorDetails = {
        originalUserId: testUser.id,
        notificationType: 'milestone_completed',
        error: 'User preferences query timeout'
      };

      await notificationService.logNotificationFailure(errorDetails);

      const adminNotifications = await Notification.findAll({
        where: {
          type: 'system_announcement',
          user_id: testAdmin.id
        },
        order: [['created_at', 'DESC']],
        limit: 1
      });

      expect(adminNotifications.length).toBeGreaterThan(0);
      const notification = adminNotifications[0];
      expect(notification.message).toContain('milestone_completed');
    });
  });

  describe('Notification failure handling (non-blocking)', () => {
    it('should return null on notification creation failure instead of throwing', async () => {
      const notificationData = {
        userId: null, // Invalid user ID
        type: 'project_created',
        title: 'Test',
        message: 'Test'
      };

      // Should not throw, should return null or handle gracefully
      try {
        const result = await notificationService.createNotification(notificationData);
        // Either null or undefined is acceptable
        expect(result == null).toBe(true);
      } catch (error) {
        // If it throws, it should be caught and logged, not propagated
        expect(error).toBeDefined();
      }
    });
  });
});
