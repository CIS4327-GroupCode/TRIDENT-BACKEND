jest.mock('../../src/database/models', () => ({
  Contract: {
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  },
  Application: {
    findByPk: jest.fn()
  },
  Project: {},
  User: {}
}));

jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 }),
  createBulkNotifications: jest.fn().mockResolvedValue([])
}));

jest.mock('../../src/services/pdfService', () => ({
  renderTemplatePreview: jest.fn(),
  generatePdf: jest.fn(),
  getAvailableTemplates: jest.fn(() => [{ type: 'NDA', requiredVariables: ['project_title'] }])
}));

const adapterMock = {
  save: jest.fn(),
  exists: jest.fn(),
  getReadStream: jest.fn()
};

jest.mock('../../src/services/storage', () => ({
  getStorageAdapter: jest.fn(() => adapterMock)
}));

jest.mock('../../src/utils/auditLogger', () => ({
  AUDIT_ACTIONS: {
    AGREEMENT_CREATED: 'AGREEMENT_CREATED',
    AGREEMENT_UPDATED: 'AGREEMENT_UPDATED',
    AGREEMENT_PARTY_SIGNED: 'AGREEMENT_PARTY_SIGNED',
    AGREEMENT_SIGNED: 'AGREEMENT_SIGNED',
    AGREEMENT_ACTIVATED: 'AGREEMENT_ACTIVATED',
    AGREEMENT_TERMINATED: 'AGREEMENT_TERMINATED'
  },
  logAudit: jest.fn().mockResolvedValue(undefined)
}));

const agreementController = require('../../src/controllers/agreementController');
const { Contract, Application } = require('../../src/database/models');
const notificationService = require('../../src/services/notificationService');
const pdfService = require('../../src/services/pdfService');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn().mockReturnThis()
  };
}

function mockContract(overrides = {}) {
  const contract = {
    id: 10,
    application_id: 3,
    project_id: 22,
    nonprofit_user_id: 7,
    researcher_user_id: 11,
    template_type: 'NDA',
    title: 'NDA Draft',
    status: 'draft',
    variables: { project_title: 'Study A' },
    rendered_content: 'Rendered body',
    storage_key: null,
    checksum: null,
    nonprofit_signed_at: null,
    nonprofit_sign_ip: null,
    researcher_signed_at: null,
    researcher_sign_ip: null,
    terminated_at: null,
    terminated_by: null,
    termination_reason: null,
    save: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn(function toJSON() {
      return {
        id: this.id,
        application_id: this.application_id,
        project_id: this.project_id,
        nonprofit_user_id: this.nonprofit_user_id,
        researcher_user_id: this.researcher_user_id,
        template_type: this.template_type,
        title: this.title,
        status: this.status,
        variables: this.variables,
        rendered_content: this.rendered_content,
        storage_key: this.storage_key,
        checksum: this.checksum,
        nonprofit_signed_at: this.nonprofit_signed_at,
        researcher_signed_at: this.researcher_signed_at,
        terminated_at: this.terminated_at,
        termination_reason: this.termination_reason
      };
    })
  };

  return { ...contract, ...overrides };
}

describe('agreementController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adapterMock.save.mockReset();
    adapterMock.exists.mockReset();
    adapterMock.getReadStream.mockReset();
  });

  test('createAgreement creates contract for nonprofit on accepted application', async () => {
    const req = {
      user: { id: 7, role: 'nonprofit', org_id: 4 },
      body: {
        application_id: 3,
        template_type: 'nda',
        title: 'Data NDA',
        variables: { project_title: 'Cancer Trial', nonprofit_name: 'Org', researcher_name: 'R', effective_date: '2026-03-14', confidential_scope: 'Data', term_months: '12', governing_law: 'CA' }
      }
    };
    const res = createRes();

    Application.findByPk.mockResolvedValue({
      id: 3,
      status: 'accepted',
      project_id: 22,
      org_id: 4,
      researcher_id: 11
    });
    Contract.findOne.mockResolvedValue(null);
    pdfService.renderTemplatePreview.mockReturnValue('Rendered NDA Preview');

    const created = mockContract({ title: 'Data NDA', status: 'draft', rendered_content: 'Rendered NDA Preview' });
    Contract.create.mockResolvedValue(created);

    await agreementController.createAgreement(req, res);

    expect(Contract.create).toHaveBeenCalledWith(expect.objectContaining({
      application_id: 3,
      project_id: 22,
      nonprofit_user_id: 7,
      researcher_user_id: 11,
      template_type: 'NDA'
    }));
    expect(notificationService.createNotification).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('createAgreement rejects non-nonprofit user', async () => {
    const req = { user: { id: 10, role: 'researcher' }, body: { application_id: 3, template_type: 'NDA', title: 'NDA' } };
    const res = createRes();

    await agreementController.createAgreement(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('createAgreement validates request payload and application state branches', async () => {
    const res = createRes();

    await agreementController.createAgreement(
      { user: { id: 7, role: 'nonprofit', org_id: 4 }, body: { application_id: 'bad', template_type: 'NDA', title: 'x' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);

    await agreementController.createAgreement(
      { user: { id: 7, role: 'nonprofit', org_id: 4 }, body: { application_id: 9, template_type: '', title: '' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);

    Application.findByPk.mockResolvedValueOnce(null);
    await agreementController.createAgreement(
      { user: { id: 7, role: 'nonprofit', org_id: 4 }, body: { application_id: 9, template_type: 'NDA', title: 'x' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);

    Application.findByPk.mockResolvedValueOnce({ id: 9, status: 'pending', project_id: 2, org_id: 4, researcher_id: 11 });
    await agreementController.createAgreement(
      { user: { id: 7, role: 'nonprofit', org_id: 4 }, body: { application_id: 9, template_type: 'NDA', title: 'x' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);

    Application.findByPk.mockResolvedValueOnce({ id: 9, status: 'accepted', project_id: 2, org_id: 5, researcher_id: 11 });
    await agreementController.createAgreement(
      { user: { id: 7, role: 'nonprofit', org_id: 4 }, body: { application_id: 9, template_type: 'NDA', title: 'x' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);

    Application.findByPk.mockResolvedValueOnce({ id: 9, status: 'accepted', project_id: 2, org_id: 4, researcher_id: 11 });
    Contract.findOne.mockResolvedValueOnce(mockContract());
    await agreementController.createAgreement(
      { user: { id: 7, role: 'nonprofit', org_id: 4 }, body: { application_id: 9, template_type: 'NDA', title: 'x' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('listAgreements returns paginated results', async () => {
    const req = { user: { id: 11 }, query: { page: '1', limit: '10' } };
    const res = createRes();

    Contract.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [mockContract()]
    });

    await agreementController.listAgreements(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1, page: 1, limit: 10 }));
  });

  test('listAgreements validates project_id filter', async () => {
    const req = { user: { id: 11 }, query: { project_id: 'bad' } };
    const res = createRes();

    await agreementController.listAgreements(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('getAgreement enforces party authorization', async () => {
    const req = { user: { id: 100, role: 'researcher' }, params: { id: '10' } };
    const res = createRes();

    Contract.findByPk.mockResolvedValue(mockContract());

    await agreementController.getAgreement(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('getAgreement handles invalid, missing and admin access paths', async () => {
    const res = createRes();

    await agreementController.getAgreement({ user: { id: 1, role: 'admin' }, params: { id: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(null);
    await agreementController.getAgreement({ user: { id: 1, role: 'admin' }, params: { id: '123' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    const contract = mockContract();
    Contract.findByPk.mockResolvedValueOnce(contract);
    await agreementController.getAgreement({ user: { id: 1, role: 'admin' }, params: { id: '10' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ agreement: expect.any(Object) }));
  });

  test('updateAgreement only updates draft by creator', async () => {
    const req = {
      user: { id: 7 },
      params: { id: '10' },
      body: { title: 'Updated NDA' }
    };
    const res = createRes();

    const contract = mockContract({ status: 'draft', title: 'Old NDA' });
    Contract.findByPk.mockResolvedValue(contract);
    pdfService.renderTemplatePreview.mockReturnValue('Updated preview');

    await agreementController.updateAgreement(req, res);

    expect(contract.title).toBe('Updated NDA');
    expect(contract.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement updated successfully' }));
  });

  test('updateAgreement validates id, ownership and draft-only constraints', async () => {
    const res = createRes();

    await agreementController.updateAgreement({ user: { id: 7 }, params: { id: 'x' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(null);
    await agreementController.updateAgreement({ user: { id: 7 }, params: { id: '1' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_user_id: 99 }));
    await agreementController.updateAgreement({ user: { id: 7 }, params: { id: '1' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(403);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'signed' }));
    await agreementController.updateAgreement({ user: { id: 7 }, params: { id: '1' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updateAgreement validates empty title and template render errors', async () => {
    const res = createRes();

    Contract.findByPk.mockResolvedValueOnce(mockContract({ title: 'Original title' }));
    await agreementController.updateAgreement({ user: { id: 7 }, params: { id: '1' }, body: { title: '   ' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(mockContract());
    pdfService.renderTemplatePreview.mockImplementationOnce(() => {
      throw new Error('Invalid variables');
    });
    await agreementController.updateAgreement({ user: { id: 7 }, params: { id: '1' }, body: { title: 'Updated', variables: {} } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('signAgreement transitions to pending_signature when one party signs', async () => {
    const req = {
      user: { id: 7 },
      params: { id: '10' },
      headers: {},
      ip: '127.0.0.1'
    };
    const res = createRes();

    const contract = mockContract({ status: 'draft' });
    Contract.findByPk.mockResolvedValue(contract);

    await agreementController.signAgreement(req, res);

    expect(contract.status).toBe('pending_signature');
    expect(notificationService.createNotification).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Waiting for counterparty') }));
  });

  test('signAgreement validates invalid states and duplicate signatures', async () => {
    const res = createRes();

    await agreementController.signAgreement({ user: { id: 7 }, params: { id: 'x' }, headers: {}, ip: '127.0.0.1' }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(null);
    await agreementController.signAgreement({ user: { id: 7 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_user_id: 8, researcher_user_id: 9 }));
    await agreementController.signAgreement({ user: { id: 7 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' }, res);
    expect(res.status).toHaveBeenCalledWith(403);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'terminated' }));
    await agreementController.signAgreement({ user: { id: 7 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_signed_at: new Date('2026-01-01T00:00:00.000Z') }));
    await agreementController.signAgreement({ user: { id: 7 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('signAgreement generates/stores PDF when both signatures present', async () => {
    const req = {
      user: { id: 11 },
      params: { id: '10' },
      headers: {},
      ip: '127.0.0.1'
    };
    const res = createRes();

    const contract = mockContract({
      status: 'pending_signature',
      nonprofit_signed_at: new Date('2026-03-14T00:00:00.000Z')
    });
    Contract.findByPk.mockResolvedValue(contract);
    pdfService.generatePdf.mockResolvedValue({
      buffer: Buffer.from('pdf-bytes'),
      checksum: 'a'.repeat(64),
      preview: 'body'
    });
    adapterMock.save.mockResolvedValue({ storageKey: 'project-22/nda.pdf' });

    await agreementController.signAgreement(req, res);

    expect(pdfService.generatePdf).toHaveBeenCalled();
    expect(adapterMock.save).toHaveBeenCalled();
    expect(contract.status).toBe('signed');
    expect(notificationService.createBulkNotifications).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement fully signed' }));
  });

  test('downloadAgreement verifies checksum before sending', async () => {
    const req = {
      user: { id: 7, role: 'nonprofit' },
      params: { id: '10' }
    };
    const res = createRes();

    const crypto = require('crypto');
    const buffer = Buffer.from('signed pdf payload');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    const contract = mockContract({
      status: 'signed',
      storage_key: 'project-22/nda.pdf',
      checksum
    });

    Contract.findByPk.mockResolvedValue(contract);
    adapterMock.exists.mockResolvedValue(true);
    adapterMock.getReadStream.mockResolvedValue(require('stream').Readable.from([buffer]));

    await agreementController.downloadAgreement(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  test('downloadAgreement enforces access and storage validity checks', async () => {
    const res = createRes();

    await agreementController.downloadAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: 'bad' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(null);
    await agreementController.downloadAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_user_id: 77, researcher_user_id: 88 }));
    await agreementController.downloadAgreement({ user: { id: 7, role: 'researcher' }, params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'draft' }));
    await agreementController.downloadAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'signed', storage_key: null, checksum: null }));
    await agreementController.downloadAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'signed', storage_key: 'x', checksum: 'abc' }));
    adapterMock.exists.mockResolvedValueOnce(false);
    await agreementController.downloadAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('downloadAgreement rejects checksum mismatch', async () => {
    const res = createRes();
    const buffer = Buffer.from('tampered payload');

    Contract.findByPk.mockResolvedValueOnce(mockContract({
      status: 'signed',
      storage_key: 'x',
      checksum: 'b'.repeat(64)
    }));
    adapterMock.exists.mockResolvedValueOnce(true);
    adapterMock.getReadStream.mockResolvedValueOnce(require('stream').Readable.from([buffer]));

    await agreementController.downloadAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('terminateAgreement requires reason and updates status', async () => {
    const req = {
      user: { id: 7 },
      params: { id: '10' },
      body: { reason: 'Project cancelled' }
    };
    const res = createRes();

    const contract = mockContract({ status: 'active' });
    Contract.findByPk.mockResolvedValue(contract);

    await agreementController.terminateAgreement(req, res);

    expect(contract.status).toBe('terminated');
    expect(contract.termination_reason).toBe('Project cancelled');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement terminated' }));
  });

  test('activateAgreement enforces ownership and signed-only transitions', async () => {
    const req = { user: { id: 7 }, params: { id: '10' } };
    const res = createRes();

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'signed' }));
    await agreementController.activateAgreement(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement activated' }));

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_user_id: 9, status: 'signed' }));
    await agreementController.activateAgreement(req, res);
    expect(res.status).toHaveBeenCalledWith(403);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'pending_signature' }));
    await agreementController.activateAgreement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('activateAgreement validates agreement id and existence', async () => {
    const res = createRes();

    await agreementController.activateAgreement({ user: { id: 7 }, params: { id: 'bad' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(null);
    await agreementController.activateAgreement({ user: { id: 7 }, params: { id: '10' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('terminateAgreement validates reason/party and already-terminated cases', async () => {
    const res = createRes();

    await agreementController.terminateAgreement({ user: { id: 7 }, params: { id: '10' }, body: { reason: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_user_id: 99, researcher_user_id: 100 }));
    await agreementController.terminateAgreement({ user: { id: 7 }, params: { id: '10' }, body: { reason: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'terminated' }));
    await agreementController.terminateAgreement({ user: { id: 7 }, params: { id: '10' }, body: { reason: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('previewAgreement and adminListAgreements return expected payloads', async () => {
    const previewRes = createRes();
    const adminRes = createRes();

    await agreementController.previewAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: 'x' } }, previewRes);
    expect(previewRes.status).toHaveBeenCalledWith(400);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ rendered_content: 'Preview body' }));
    await agreementController.previewAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '10' } }, previewRes);
    expect(previewRes.json).toHaveBeenCalledWith(expect.objectContaining({ preview: 'Preview body' }));

    Contract.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [mockContract()] });
    await agreementController.adminListAgreements({ query: { page: '1', limit: '10' } }, adminRes);
    expect(adminRes.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
  });

  test('previewAgreement enforces authorization and not-found responses', async () => {
    const res = createRes();

    Contract.findByPk.mockResolvedValueOnce(null);
    await agreementController.previewAgreement({ user: { id: 7, role: 'nonprofit' }, params: { id: '10' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    Contract.findByPk.mockResolvedValueOnce(mockContract({ nonprofit_user_id: 70, researcher_user_id: 71 }));
    await agreementController.previewAgreement({ user: { id: 7, role: 'researcher' }, params: { id: '10' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('adminListAgreements supports status/template filters', async () => {
    const res = createRes();
    Contract.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

    await agreementController.adminListAgreements({ query: { status: 'active', template_type: 'nda' } }, res);

    expect(Contract.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'active', template_type: 'NDA' })
    }));
  });

  test('createAgreement returns 400 when template rendering fails', async () => {
    const req = {
      user: { id: 7, role: 'nonprofit', org_id: 4 },
      body: {
        application_id: 3,
        template_type: 'nda',
        title: 'Data NDA',
        variables: {}
      }
    };
    const res = createRes();

    Application.findByPk.mockResolvedValueOnce({
      id: 3,
      status: 'accepted',
      project_id: 22,
      org_id: 4,
      researcher_id: 11
    });
    Contract.findOne.mockResolvedValueOnce(null);
    pdfService.renderTemplatePreview.mockImplementationOnce(() => {
      throw new Error('Missing fields');
    });

    await agreementController.createAgreement(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('getTemplates returns available template metadata', async () => {
    const req = {};
    const res = createRes();

    await agreementController.getTemplates(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ templates: expect.any(Array) }));
  });

  test('adminAgreementStats returns status counts', async () => {
    const req = {};
    const res = createRes();

    Contract.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    await agreementController.adminAgreementStats(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      total: 12,
      by_status: expect.objectContaining({ draft: 2, pending_signature: 3 })
    }));
  });
});
