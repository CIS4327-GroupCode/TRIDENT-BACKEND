describe('scanService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
  });

  it('returns clean when noop driver is configured', async () => {
    process.env.ATTACHMENT_SCAN_DRIVER = 'noop';
    const { scanAttachment } = require('../../src/services/scanService');

    const result = await scanAttachment({
      filename: 'report.pdf',
      buffer: Buffer.from('safe')
    });

    expect(result.clean).toBe(true);
    expect(result.scanStatus).toBe('clean');
  });

  it('flags suspicious extension in basic mode', async () => {
    process.env.ATTACHMENT_SCAN_DRIVER = 'basic';
    const { scanAttachment } = require('../../src/services/scanService');

    const result = await scanAttachment({
      filename: 'payload.exe',
      buffer: Buffer.from('MZmalicious')
    });

    expect(result.clean).toBe(false);
    expect(result.scanStatus).toBe('infected');
    expect(result.reason).toContain('.exe');
  });

  it('flags suspicious signatures in basic mode', async () => {
    process.env.ATTACHMENT_SCAN_DRIVER = 'basic';
    const { scanAttachment } = require('../../src/services/scanService');

    const result = await scanAttachment({
      filename: 'notes.txt',
      buffer: Buffer.from('<script>alert(1)</script>')
    });

    expect(result.clean).toBe(false);
    expect(result.scanStatus).toBe('infected');
  });
});
