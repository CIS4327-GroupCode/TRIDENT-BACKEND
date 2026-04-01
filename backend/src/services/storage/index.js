const path = require('path');
const LocalDiskStorageAdapter = require('./localDiskStorageAdapter');

const STORAGE_DRIVER_LOCAL = 'local';
const STORAGE_DRIVER_S3 = 's3';

let adapterInstance;

function createAdapter() {
  const driver = (
    process.env.STORAGE_DRIVER
    || process.env.ATTACHMENT_STORAGE_DRIVER
    || STORAGE_DRIVER_LOCAL
  ).toLowerCase();

  if (driver === STORAGE_DRIVER_LOCAL) {
    const basePath = process.env.STORAGE_LOCAL_PATH
      ? path.resolve(process.env.STORAGE_LOCAL_PATH)
      : process.env.ATTACHMENT_LOCAL_PATH
        ? path.resolve(process.env.ATTACHMENT_LOCAL_PATH)
      : path.resolve(__dirname, '../../../uploads/attachments');
    return new LocalDiskStorageAdapter(basePath);
  }

  if (driver === STORAGE_DRIVER_S3) {
    const S3StorageAdapter = require('./s3StorageAdapter');

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error('Missing required S3_BUCKET environment variable for s3 storage driver');
    }

    const region = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT;

    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    const hasStaticCredentials = Boolean(accessKeyId && secretAccessKey);

    return new S3StorageAdapter({
      bucket,
      region,
      endpoint,
      credentials: hasStaticCredentials
        ? {
          accessKeyId,
          secretAccessKey
        }
        : undefined
    });
  }

  throw new Error(`Unsupported storage driver: ${driver}`);
}

function getStorageAdapter() {
  if (!adapterInstance) {
    adapterInstance = createAdapter();
  }
  return adapterInstance;
}

function resetStorageAdapter() {
  adapterInstance = null;
}

module.exports = {
  getStorageAdapter,
  resetStorageAdapter
};