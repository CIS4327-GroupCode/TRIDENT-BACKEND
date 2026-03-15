class StorageAdapter {
  async save() {
    throw new Error('save() not implemented');
  }

  async delete() {
    throw new Error('delete() not implemented');
  }

  async getReadStream() {
    throw new Error('getReadStream() not implemented');
  }

  async getSignedUrl() {
    throw new Error('getSignedUrl() not implemented');
  }

  async exists() {
    throw new Error('exists() not implemented');
  }
}

module.exports = StorageAdapter;