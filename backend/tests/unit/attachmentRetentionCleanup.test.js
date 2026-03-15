jest.mock('../../src/database/models', () => ({
  Attachment: {
    findAll: jest.fn()
  }
}));

const storageDeleteMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/storage', () => ({
  getStorageAdapter: jest.fn(() => ({
    delete: storageDeleteMock
  }))
}));

jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn(() => ({ id: 'cleanup-job' }))
}));

const schedule = require('node-schedule');
const { Attachment } = require('../../src/database/models');
const { getStorageAdapter } = require('../../src/services/storage');
const cleanupTask = require('../../src/tasks/attachmentRetentionCleanup');

describe('attachmentRetentionCleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageDeleteMock.mockClear();
  });

  it('purges expired attachments', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    Attachment.findAll.mockResolvedValue([
      { id: 1, storage_key: 'a.txt', destroy },
      { id: 2, storage_key: 'b.txt', destroy }
    ]);

    const result = await cleanupTask.purgeExpiredAttachments();

    expect(result.scanned).toBe(2);
    expect(result.purged).toBe(2);
    expect(storageDeleteMock).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalled();
  });

  it('registers cleanup schedule', () => {
    cleanupTask.scheduleAttachmentRetentionCleanup();
    expect(schedule.scheduleJob).toHaveBeenCalledWith('30 2 * * *', expect.any(Function));
  });
});
