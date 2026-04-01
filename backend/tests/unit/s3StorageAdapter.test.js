const sendMock = jest.fn();
const presignMock = jest.fn();

class S3ClientMock {
  constructor() {
    this.send = sendMock;
  }
}

class PutObjectCommandMock {
  constructor(input) {
    this.input = input;
  }
}

class DeleteObjectCommandMock {
  constructor(input) {
    this.input = input;
  }
}

class GetObjectCommandMock {
  constructor(input) {
    this.input = input;
  }
}

class HeadObjectCommandMock {
  constructor(input) {
    this.input = input;
  }
}

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: S3ClientMock,
  PutObjectCommand: PutObjectCommandMock,
  DeleteObjectCommand: DeleteObjectCommandMock,
  GetObjectCommand: GetObjectCommandMock,
  HeadObjectCommand: HeadObjectCommandMock
}), { virtual: true });

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: presignMock
}), { virtual: true });

const S3StorageAdapter = require('../../src/services/storage/s3StorageAdapter');

describe('S3StorageAdapter', () => {
  let adapter;

  beforeEach(() => {
    sendMock.mockReset();
    presignMock.mockReset();

    adapter = new S3StorageAdapter({
      bucket: 'unit-test-bucket',
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      credentials: {
        accessKeyId: 'abc',
        secretAccessKey: 'def'
      }
    });
  });

  it('saves file to S3 using generated storage key', async () => {
    sendMock.mockResolvedValueOnce({});

    const result = await adapter.save({
      projectId: 10,
      filename: 'dataset.csv',
      buffer: Buffer.from('csv-content'),
      mimetype: 'text/csv'
    });

    expect(result.storageKey).toContain('project-10/');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const command = sendMock.mock.calls[0][0];
    expect(command.input.Bucket).toBe('unit-test-bucket');
    expect(command.input.Key).toBe(result.storageKey);
    expect(command.input.ContentType).toBe('text/csv');
  });

  it('deletes object by key', async () => {
    sendMock.mockResolvedValueOnce({});

    await adapter.delete('project-10/file.txt');

    const command = sendMock.mock.calls[0][0];
    expect(command.input.Bucket).toBe('unit-test-bucket');
    expect(command.input.Key).toBe('project-10/file.txt');
  });

  it('returns read stream body from getReadStream', async () => {
    const body = { pipe: jest.fn() };
    sendMock.mockResolvedValueOnce({ Body: body });

    const stream = await adapter.getReadStream('project-10/report.pdf');

    expect(stream).toBe(body);
  });

  it('throws if S3 get object response has no body', async () => {
    sendMock.mockResolvedValueOnce({});

    await expect(adapter.getReadStream('project-10/missing.pdf'))
      .rejects
      .toThrow('Failed to retrieve object stream from storage');
  });

  it('returns signed URL for object', async () => {
    presignMock.mockResolvedValueOnce('https://signed.example.com/object');

    const url = await adapter.getSignedUrl({
      storageKey: 'project-10/object.pdf',
      expiresInSeconds: 120
    });

    expect(url).toBe('https://signed.example.com/object');
    expect(presignMock).toHaveBeenCalledTimes(1);
  });

  it('returns true for exists when head request succeeds', async () => {
    sendMock.mockResolvedValueOnce({});

    await expect(adapter.exists('project-1/file.txt')).resolves.toBe(true);
  });

  it('returns false for exists when object is not found', async () => {
    const notFound = new Error('missing');
    notFound.name = 'NotFound';
    sendMock.mockRejectedValueOnce(notFound);

    await expect(adapter.exists('project-1/file.txt')).resolves.toBe(false);
  });
});
