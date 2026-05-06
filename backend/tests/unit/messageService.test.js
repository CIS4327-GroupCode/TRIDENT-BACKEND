jest.mock('../../src/database', () => ({
  transaction: jest.fn(),
}));

jest.mock('../../src/database/models', () => ({
  Thread: {
    findByPk: jest.fn(),
    update: jest.fn(),
  },
  ThreadParticipant: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    increment: jest.fn(),
    update: jest.fn(),
  },
  Message: {
    create: jest.fn(),
  },
  MessageAttachment: {
    bulkCreate: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
    getAttributes: jest.fn(() => ({ id: {}, name: {}, email: {} })),
  },
}));

jest.mock('../../src/services/notificationService', () => ({
  createBulkNotifications: jest.fn(),
}));

jest.mock('../../src/utils/encryption', () => ({
  encryptMessage: jest.fn(() => 'encrypted-body'),
  decryptMessage: jest.fn(),
}));

const sequelize = require('../../src/database');
const {
  Thread,
  ThreadParticipant,
  Message,
  MessageAttachment,
  User,
} = require('../../src/database/models');
const notificationService = require('../../src/services/notificationService');
const { sendMessage } = require('../../src/services/messageService');

describe('messageService.sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MSG_SECRET = 'test-secret';

    sequelize.transaction.mockImplementation(async (callback) => callback({}));

    Thread.findByPk.mockResolvedValue({
      id: 10,
      thread_type: 'direct',
      name: null,
      project_id: null,
    });

    ThreadParticipant.findOne.mockResolvedValue({
      thread_id: 10,
      user_id: 1,
    });

    ThreadParticipant.findAll.mockResolvedValue([
      { user_id: 2 },
      { user_id: 3 },
    ]);

    User.findByPk.mockResolvedValue({
      id: 1,
      name: 'Alice Sender',
      email: 'alice@example.com',
    });

    Message.create.mockResolvedValue({
      id: 99,
      thread_id: 10,
      sender_id: 1,
      created_at: new Date('2026-05-05T10:00:00.000Z'),
    });

    MessageAttachment.bulkCreate.mockResolvedValue([]);
    Thread.update.mockResolvedValue([1]);
    ThreadParticipant.increment.mockResolvedValue([1]);
    ThreadParticipant.update.mockResolvedValue([1]);
    notificationService.createBulkNotifications.mockResolvedValue([]);
  });

  it('notifies non-sender participants after a successful send', async () => {
    const result = await sendMessage({
      threadId: 10,
      senderId: 1,
      body: ' Hello team ',
    });

    expect(result).toEqual({
      message: {
        id: 99,
        thread_id: 10,
        sender_id: 1,
        body: 'Hello team',
        created_at: new Date('2026-05-05T10:00:00.000Z'),
        attachments: [],
      },
    });

    expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
      [2, 3],
      expect.objectContaining({
        type: 'message_received',
        title: 'New Message',
        message: 'Alice Sender sent you a message',
        link: '/messages?thread=10',
        metadata: expect.objectContaining({
          thread_id: 10,
          sender_id: 1,
          sender_name: 'Alice Sender',
          thread_type: 'direct',
          has_attachments: false,
        }),
      })
    );
  });
});