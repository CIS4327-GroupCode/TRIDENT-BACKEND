const path = require('path');

class NoOpScanAdapter {
  async scanFile() {
    return {
      clean: true,
      scanStatus: 'clean',
      reason: null
    };
  }
}

class BasicSignatureScanAdapter {
  constructor() {
    const defaultBlocked = ['.exe', '.bat', '.cmd', '.com', '.js', '.vbs', '.ps1', '.jar', '.msi', '.scr'];
    this.blockedExtensions = new Set(
      (process.env.ATTACHMENT_SCAN_BLOCKED_EXTENSIONS || defaultBlocked.join(','))
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  hasSuspiciousSignature(buffer) {
    if (!buffer || buffer.length < 2) {
      return false;
    }

    // PE executable signature.
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return true;
    }

    const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf8').toLowerCase();
    if (head.includes('<script') || head.includes('powershell') || head.includes('wscript.shell')) {
      return true;
    }

    return false;
  }

  async scanFile({ filename, buffer }) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    if (ext && this.blockedExtensions.has(ext)) {
      return {
        clean: false,
        scanStatus: 'infected',
        reason: `Blocked file extension: ${ext}`
      };
    }

    if (this.hasSuspiciousSignature(buffer)) {
      return {
        clean: false,
        scanStatus: 'infected',
        reason: 'Suspicious binary/script signature detected'
      };
    }

    return {
      clean: true,
      scanStatus: 'clean',
      reason: null
    };
  }
}

let adapterInstance;

function createAdapter() {
  const driver = String(process.env.ATTACHMENT_SCAN_DRIVER || 'basic').toLowerCase();

  if (driver === 'none' || driver === 'noop' || driver === 'disabled') {
    return new NoOpScanAdapter();
  }

  if (driver === 'basic') {
    return new BasicSignatureScanAdapter();
  }

  throw new Error(`Unsupported attachment scan driver: ${driver}`);
}

function getScanAdapter() {
  if (!adapterInstance) {
    adapterInstance = createAdapter();
  }
  return adapterInstance;
}

function resetScanAdapter() {
  adapterInstance = null;
}

async function scanAttachment(params) {
  const adapter = getScanAdapter();
  return adapter.scanFile(params);
}

module.exports = {
  scanAttachment,
  getScanAdapter,
  resetScanAdapter,
  NoOpScanAdapter,
  BasicSignatureScanAdapter
};
