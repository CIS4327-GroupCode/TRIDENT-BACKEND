const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const LocalDiskStorageAdapter = require('../../src/services/storage/localDiskStorageAdapter');

describe('LocalDiskStorageAdapter', () => {
  let tempRoot;
  let adapter;

  beforeEach(async () => {
    tempRoot = path.join(os.tmpdir(), `trident-storage-test-${crypto.randomBytes(6).toString('hex')}`);
    await fs.promises.mkdir(tempRoot, { recursive: true });
    adapter = new LocalDiskStorageAdapter(tempRoot);
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('sanitizes filenames for safe storage keys', () => {
    expect(adapter.sanitizeFilename('my file*name?.pdf')).toBe('my_file_name_.pdf');
  });

  it('saves files and returns a project-scoped storage key', async () => {
    const result = await adapter.save({
      projectId: 7,
      filename: 'report.pdf',
      buffer: Buffer.from('hello-world')
    });

    expect(result.storageKey).toContain('project-7');
    expect(await adapter.exists(result.storageKey)).toBe(true);
  });

  it('returns readable stream for saved files', async () => {
    const payload = 'stream-content';
    const { storageKey } = await adapter.save({
      projectId: 2,
      filename: 'notes.txt',
      buffer: Buffer.from(payload)
    });

    const stream = await adapter.getReadStream(storageKey);
    const chunks = [];

    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    expect(Buffer.concat(chunks).toString('utf8')).toBe(payload);
  });

  it('deletes existing files and ignores missing files', async () => {
    const { storageKey } = await adapter.save({
      projectId: 3,
      filename: 'to-delete.txt',
      buffer: Buffer.from('delete-me')
    });

    expect(await adapter.exists(storageKey)).toBe(true);

    await adapter.delete(storageKey);
    expect(await adapter.exists(storageKey)).toBe(false);

    await expect(adapter.delete(storageKey)).resolves.toBeUndefined();
  });

  it('returns null for getSignedUrl in local mode', async () => {
    await expect(adapter.getSignedUrl({ storageKey: 'project-1/file.txt' })).resolves.toBeNull();
  });
});
