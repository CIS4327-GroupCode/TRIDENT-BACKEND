const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const StorageAdapter = require('./storageAdapter');

class LocalDiskStorageAdapter extends StorageAdapter {
  constructor(basePath) {
    super();
    this.basePath = basePath;
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  generateStorageKey({ projectId, filename }) {
    const safeName = this.sanitizeFilename(filename);
    const suffix = crypto.randomBytes(8).toString('hex');
    return path.join(`project-${projectId}`, `${Date.now()}-${suffix}-${safeName}`);
  }

  async ensureDirectory(filePath) {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  resolvePath(storageKey) {
    return path.resolve(this.basePath, storageKey);
  }

  async save({ projectId, filename, buffer }) {
    const storageKey = this.generateStorageKey({ projectId, filename });
    const destinationPath = this.resolvePath(storageKey);
    await this.ensureDirectory(destinationPath);
    await fs.promises.writeFile(destinationPath, buffer);
    return { storageKey };
  }

  async delete(storageKey) {
    const destinationPath = this.resolvePath(storageKey);
    try {
      await fs.promises.unlink(destinationPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async getReadStream(storageKey) {
    const destinationPath = this.resolvePath(storageKey);
    await fs.promises.access(destinationPath, fs.constants.F_OK);
    return fs.createReadStream(destinationPath);
  }

  async getSignedUrl() {
    return null;
  }

  async exists(storageKey) {
    const destinationPath = this.resolvePath(storageKey);
    try {
      await fs.promises.access(destinationPath, fs.constants.F_OK);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
}

module.exports = LocalDiskStorageAdapter;