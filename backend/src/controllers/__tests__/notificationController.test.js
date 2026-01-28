const request = require('supertest');
const express = require('express');
const notificationRoutes = require('../../routes/notificationRoutes');
const Notification = require('../../database/models/Notification');
const { authenticate } = require('../../middleware/auth');

// Mock Sequelize model
jest.mock('../../database/models/Notification');
jest.mock('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRoutes);

describe('Notification Controller - Real-World Flows', () => {
  const mockUser = { id: 1, email: 'test@example.com', role: 'nonprofit' };
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock auth middleware
    authenticate.mockImplementation((req, res, next) => {
      req.user = mockUser;
      next();
    });
  });

  describe('GET /api/notifications - Notification Types & Links', () => {
    test('returns application_received notification with correct link', async () => {
      const mockNotifications = [
        {
          id: 1,
          user_id: 1,
          type: 'application_received',
          title: 'New Project Application',
          message: 'John Doe has applied to your project "Community Health Study".',
          link: '/projects/123/applications',
          is_read: false,
          metadata: {
            application_id: 42,
            project_id: 123,
            researcher_id: 55,
            researcher_name: 'John Doe'
          },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      
      Notification.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.notifications).toHaveLength(1);
      expect(response.body.notifications[0].type).toBe('application_received');
      expect(response.body.notifications[0].link).toBe('/projects/123/applications');
      expect(response.body.unreadCount).toBe(1);
    });

    test('returns milestone notifications with project-specific links', async () => {
      const mockNotifications = [
        {
          id: 2,
          user_id: 1,
          type: 'milestone_deadline_approaching',
          title: 'Milestone Deadline Approaching',
          message: 'The milestone "Initial Data Collection" is due in 3 days.',
          link: '/projects/456/milestones',
          is_read: false,
          metadata: { milestone_id: 12, project_id: 456, days_until_deadline: 3 },
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 3,
          user_id: 1,
          type: 'milestone_completed',
          title: 'Milestone Completed',
          message: 'Milestone "Data Analysis" has been marked as complete.',
          link: '/projects/456/milestones',
          is_read: true,
          metadata: { milestone_id: 11, project_id: 456 },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: mockNotifications
      });
      
      Notification.count.mockResolvedValue(1); // 1 unread

      const response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.notifications[0].link).toContain('/milestones');
      expect(response.body.unreadCount).toBe(1);
    });

    test('returns project status notifications with project detail links', async () => {
      const mockNotifications = [
        {
          id: 4,
          user_id: 1,
          type: 'project_status_changed',
          title: 'Project Status Updated',
          message: 'Your project "Climate Impact" status changed to "In Progress".',
          link: '/projects/789',
          is_read: false,
          metadata: { project_id: 789, old_status: 'pending', new_status: 'in_progress' },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      
      Notification.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.notifications[0].link).toBe('/projects/789');
      expect(response.body.notifications[0].metadata.project_id).toBe(789);
    });

    test('returns message notifications with messages link', async () => {
      const mockNotifications = [
        {
          id: 5,
          user_id: 1,
          type: 'message_received',
          title: 'New Message',
          message: 'Jane Smith sent you a message.',
          link: '/messages',
          is_read: false,
          metadata: { sender_id: 88, sender_name: 'Jane Smith' },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      
      Notification.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.notifications[0].link).toBe('/messages');
    });

    test('filters by unread only', async () => {
      const mockNotifications = [
        {
          id: 6,
          user_id: 1,
          type: 'application_received',
          title: 'Unread Application',
          message: 'New application',
          link: '/projects/111/applications',
          is_read: false,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      
      Notification.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/notifications?unread=true')
        .expect(200);

      expect(Notification.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_read: false })
        })
      );
    });

    test('filters by notification type', async () => {
      const mockNotifications = [
        {
          id: 7,
          user_id: 1,
          type: 'milestone_created',
          title: 'New Milestone',
          message: 'Milestone created',
          link: '/projects/222/milestones',
          is_read: false,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      
      Notification.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications?type=milestone_created')
        .expect(200);

      expect(Notification.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'milestone_created' })
        })
      );
    });
  });

  describe('PUT /api/notifications/:id/read - Mark as Read Flow', () => {
    test('marks notification as read and returns updated notification', async () => {
      const mockNotification = {
        id: 10,
        user_id: 1,
        type: 'application_received',
        title: 'Test Notification',
        message: 'Test message',
        link: '/projects/123/applications',
        is_read: false,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: jest.fn().mockReturnValue({
          id: 10,
          type: 'application_received',
          title: 'Test Notification',
          is_read: true
        })
      };

      Notification.findOne.mockResolvedValue(mockNotification);

      const response = await request(app)
        .put('/api/notifications/10/read')
        .expect(200);

      expect(mockNotification.is_read).toBe(true);
      expect(mockNotification.save).toHaveBeenCalled();
      expect(response.body.message).toBe('Notification marked as read');
      expect(response.body.notification.is_read).toBe(true);
    });

    test('returns 404 when notification not found', async () => {
      Notification.findOne.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/notifications/999/read')
        .expect(404);

      expect(response.body.error).toBe('Notification not found');
    });

    test('only marks user own notifications', async () => {
      Notification.findOne.mockResolvedValue(null);

      await request(app)
        .put('/api/notifications/10/read')
        .expect(404);

      expect(Notification.findOne).toHaveBeenCalledWith({
        where: { id: '10', user_id: 1 }
      });
    });
  });

  describe('PUT /api/notifications/read-all - Bulk Mark as Read', () => {
    test('marks all unread notifications as read', async () => {
      Notification.update.mockResolvedValue([5]); // 5 updated

      const response = await request(app)
        .put('/api/notifications/read-all')
        .expect(200);

      expect(response.body.message).toBe('All notifications marked as read');
      expect(response.body.updatedCount).toBe(5);
      expect(Notification.update).toHaveBeenCalledWith(
        { is_read: true },
        { where: { user_id: 1, is_read: false } }
      );
    });

    test('returns 0 when no unread notifications', async () => {
      Notification.update.mockResolvedValue([0]);

      const response = await request(app)
        .put('/api/notifications/read-all')
        .expect(200);

      expect(response.body.updatedCount).toBe(0);
    });
  });

  describe('DELETE /api/notifications/:id - Delete Flow', () => {
    test('deletes notification successfully', async () => {
      const mockNotification = {
        id: 20,
        user_id: 1,
        destroy: jest.fn().mockResolvedValue(true)
      };

      Notification.findOne.mockResolvedValue(mockNotification);

      const response = await request(app)
        .delete('/api/notifications/20')
        .expect(200);

      expect(mockNotification.destroy).toHaveBeenCalled();
      expect(response.body.message).toBe('Notification deleted successfully');
    });

    test('returns 404 when trying to delete non-existent notification', async () => {
      Notification.findOne.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/notifications/999')
        .expect(404);

      expect(response.body.error).toBe('Notification not found');
    });
  });

  describe('GET /api/notifications/unread-count - Badge Count', () => {
    test('returns correct unread count', async () => {
      Notification.count.mockResolvedValue(7);

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .expect(200);

      expect(response.body.unreadCount).toBe(7);
      expect(Notification.count).toHaveBeenCalledWith({
        where: { user_id: 1, is_read: false }
      });
    });

    test('returns 0 when no unread notifications', async () => {
      Notification.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .expect(200);

      expect(response.body.unreadCount).toBe(0);
    });
  });

  describe('Real-World Complete Flow Scenarios', () => {
    test('complete application notification flow', async () => {
      // Step 1: Get notifications (application_received shows up)
      const mockNotifications = [
        {
          id: 100,
          user_id: 1,
          type: 'application_received',
          title: 'New Project Application',
          message: 'John Doe applied to "Health Study"',
          link: '/projects/123/applications',
          is_read: false,
          metadata: { application_id: 42, project_id: 123 },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      Notification.count.mockResolvedValue(1);

      let response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.notifications).toHaveLength(1);
      expect(response.body.unreadCount).toBe(1);

      // Step 2: Click notification - mark as read
      const mockNotification = {
        id: 100,
        user_id: 1,
        is_read: false,
        save: jest.fn().mockResolvedValue(true),
        toSafeObject: jest.fn().mockReturnValue({ id: 100, is_read: true })
      };
      Notification.findOne.mockResolvedValue(mockNotification);

      response = await request(app)
        .put('/api/notifications/100/read')
        .expect(200);

      expect(mockNotification.is_read).toBe(true);
      expect(mockNotification.save).toHaveBeenCalled();

      // Step 3: Verify unread count decreased
      Notification.count.mockResolvedValue(0);

      response = await request(app)
        .get('/api/notifications/unread-count')
        .expect(200);

      expect(response.body.unreadCount).toBe(0);
    });

    test('complete milestone notification flow', async () => {
      // Milestone deadline approaching notification
      const mockNotifications = [
        {
          id: 200,
          user_id: 1,
          type: 'milestone_deadline_approaching',
          title: 'Milestone Deadline Approaching',
          message: 'Milestone due in 3 days',
          link: '/projects/456/milestones',
          is_read: false,
          metadata: { milestone_id: 12, days_until_deadline: 3 },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      Notification.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockNotifications
      });
      Notification.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/notifications?type=milestone_deadline_approaching')
        .expect(200);

      expect(response.body.notifications[0].link).toBe('/projects/456/milestones');
      expect(response.body.notifications[0].metadata.days_until_deadline).toBe(3);
    });

    test('bulk operations: mark all as read then delete all read', async () => {
      // Mark all as read
      Notification.update.mockResolvedValue([3]);

      let response = await request(app)
        .put('/api/notifications/read-all')
        .expect(200);

      expect(response.body.updatedCount).toBe(3);

      // Delete all read
      Notification.destroy.mockResolvedValue(3);

      response = await request(app)
        .delete('/api/notifications/read')
        .expect(200);

      expect(response.body.deletedCount).toBe(3);
      expect(Notification.destroy).toHaveBeenCalledWith({
        where: { user_id: 1, is_read: true }
      });
    });
  });
});
