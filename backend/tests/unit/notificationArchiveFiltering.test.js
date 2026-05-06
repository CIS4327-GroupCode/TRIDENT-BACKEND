jest.mock('../../src/database/models/Notification', () => ({
  findAndCountAll: jest.fn(),
  count: jest.fn(),
}));

const notificationController = require('../../src/controllers/notificationController');
const Notification = require('../../src/database/models/Notification');

describe('notification archive filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes archived notifications from list queries and unread counts', async () => {
    Notification.findAndCountAll.mockResolvedValue({
      count: 0,
      rows: [],
    });
    Notification.count.mockResolvedValue(0);

    const req = {
      user: { id: 1 },
      query: { unread: 'true' },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await notificationController.getNotifications(req, res);

    expect(Notification.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 1,
          archived: false,
          is_read: false,
        },
      })
    );
    expect(Notification.count).toHaveBeenCalledWith({
      where: { user_id: 1, is_read: false, archived: false },
    });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: [],
        unreadCount: 0,
      })
    );
  });
});