describe('storage service factory', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_LOCAL_PATH;
    delete process.env.ATTACHMENT_STORAGE_DRIVER;
    delete process.env.ATTACHMENT_LOCAL_PATH;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('returns the same singleton adapter instance between calls', () => {
    const { getStorageAdapter } = require('../../src/services/storage');

    const first = getStorageAdapter();
    const second = getStorageAdapter();

    expect(first).toBe(second);
  });

  it('creates a new instance after resetStorageAdapter', () => {
    const { getStorageAdapter, resetStorageAdapter } = require('../../src/services/storage');

    const first = getStorageAdapter();
    resetStorageAdapter();
    const second = getStorageAdapter();

    expect(first).not.toBe(second);
  });

  it('supports legacy ATTACHMENT_STORAGE_DRIVER env for backwards compatibility', () => {
    process.env.ATTACHMENT_STORAGE_DRIVER = 'local';

    const { getStorageAdapter } = require('../../src/services/storage');
    const adapter = getStorageAdapter();

    expect(adapter.constructor.name).toBe('LocalDiskStorageAdapter');
  });

  it('throws for unsupported drivers', () => {
    process.env.STORAGE_DRIVER = 'unsupported-driver';

    const { getStorageAdapter } = require('../../src/services/storage');
    expect(() => getStorageAdapter()).toThrow('Unsupported storage driver: unsupported-driver');
  });

  it('creates S3 adapter when STORAGE_DRIVER is s3', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'test-bucket';

    jest.doMock('../../src/services/storage/s3StorageAdapter', () => {
      return jest.fn().mockImplementation(() => ({ provider: 's3' }));
    });

    const { getStorageAdapter } = require('../../src/services/storage');
    const adapter = getStorageAdapter();

    expect(adapter.provider).toBe('s3');
  });
});
