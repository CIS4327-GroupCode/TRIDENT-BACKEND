const crypto = require('crypto');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl: presignUrl } = require('@aws-sdk/s3-request-presigner');
const StorageAdapter = require('./storageAdapter');

class S3StorageAdapter extends StorageAdapter {
  constructor({ bucket, region, endpoint, credentials }) {
    super();

    this.bucket = bucket;

    this.client = new S3Client({
      region,
      endpoint,
      credentials,
      forcePathStyle: Boolean(endpoint)
    });
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  generateStorageKey({ projectId, filename }) {
    const safeName = this.sanitizeFilename(filename);
    const suffix = crypto.randomBytes(8).toString('hex');
    return path.posix.join(`project-${projectId}`, `${Date.now()}-${suffix}-${safeName}`);
  }

  async save({ projectId, filename, buffer, mimetype }) {
    const storageKey = this.generateStorageKey({ projectId, filename });

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimetype,
      Metadata: {
        originalFilename: filename
      }
    }));

    return { storageKey };
  }

  async delete(storageKey) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey
    }));
  }

  async getReadStream(storageKey) {
    const output = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey
    }));

    if (!output || !output.Body) {
      throw new Error('Failed to retrieve object stream from storage');
    }

    return output.Body;
  }

  async getSignedUrl({ storageKey, expiresInSeconds = 300 }) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey
    });

    return presignUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async exists(storageKey) {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey
      }));
      return true;
    } catch (error) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

module.exports = S3StorageAdapter;
