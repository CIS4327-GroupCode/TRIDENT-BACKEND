jest.mock('../../src/database/models/Notification', () => ({
  create: jest.fn(),
  bulkCreate: jest.fn(),
}));

jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  UserPreferences: {
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
}));

jest.mock('../../src/services/emailService', () => ({
  sendNotificationEmail: jest.fn(),
}));

const Notification = require('../../src/database/models/Notification');
const { User, UserPreferences } = require('../../src/database/models');
const emailService = require('../../src/services/emailService');
const notificationService = require('../../src/services/notificationService');

describe('notificationService email preference enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Notification.create.mockResolvedValue({
      id: 1,
      user_id: 10,
      type: 'message_received',
    });

    Notification.bulkCreate.mockResolvedValue([
      { user_id: 10, type: 'message_received' },
      { user_id: 11, type: 'message_received' },
    ]);

    User.findByPk.mockResolvedValue({
      id: 10,
      email: 'user10@example.com',
      name: 'User 10',
    });

    User.findAll.mockResolvedValue([
      { id: 11, email: 'user11@example.com', name: 'User 11' },
    ]);

    emailService.sendNotificationEmail.mockResolvedValue();
  });

  it('suppresses message emails when email_messages is disabled', async () => {
    UserPreferences.findOne.mockResolvedValue({
      user_id: 10,
      inapp_notifications: true,
      inapp_messages: true,
      email_notifications: true,
      email_messages: false,
    });

    const notification = await notificationService.createNotification({
      userId: 10,
      type: 'message_received',
      title: 'New Message',
      message: 'You have a new message',
      link: '/messages?thread=5',
    });

    expect(notification).toBeDefined();
    expect(Notification.create).toHaveBeenCalled();
    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('emails only recipients whose type-specific email preference allows it', async () => {
    UserPreferences.findAll.mockResolvedValue([
      {
        user_id: 10,
        inapp_notifications: true,
        inapp_messages: true,
        email_notifications: true,
        email_messages: false,
      },
      {
        user_id: 11,
        inapp_notifications: true,
        inapp_messages: true,
        email_notifications: true,
        email_messages: true,
      },
    ]);

    await notificationService.createBulkNotifications([10, 11], {
      type: 'message_received',
      title: 'New Message',
      message: 'You have a new message',
      link: '/messages?thread=5',
    });

    expect(Notification.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 10, type: 'message_received' }),
      expect.objectContaining({ user_id: 11, type: 'message_received' }),
    ]);
    expect(User.findAll).toHaveBeenCalledWith({
      where: { id: [11] },
      attributes: ['id', 'email', 'name'],
    });
    expect(emailService.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
      'user11@example.com',
      'User 11',
      expect.objectContaining({ type: 'message_received' })
    );
  });
});