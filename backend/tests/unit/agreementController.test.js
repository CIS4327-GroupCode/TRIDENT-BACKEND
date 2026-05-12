jest.mock('../../src/database/models', () => ({
  Contract: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  ContractReview: {
    create: jest.fn(),
    findAll: jest.fn()
  },
  AgreementRemovalRequest: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn()
  },
  Application: {
    findByPk: jest.fn()
  },
  Attachment: {
    findByPk: jest.fn()
  },
  Project: {},
  Milestone: {
    findAll: jest.fn()
  },
  MilestoneResearcher: {
    findAll: jest.fn()
  },
  ProjectResearcherAccess: {
    findAll: jest.fn()
  },
  User: {
    findAll: jest.fn()
  },
  sequelize: {
    transaction: jest.fn()
  }
}));

jest.mock('../../src/services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 }),
  createBulkNotifications: jest.fn().mockResolvedValue([])
}));

jest.mock('../../src/services/pdfService', () => ({
  renderTemplatePreview: jest.fn(),
  generatePdf: jest.fn(),
  generatePdfFromText: jest.fn(),
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
    AGREEMENT_SUBMITTED_FOR_REVIEW: 'AGREEMENT_SUBMITTED_FOR_REVIEW',
    AGREEMENT_REVIEW_APPROVED: 'AGREEMENT_REVIEW_APPROVED',
    AGREEMENT_CHANGES_REQUESTED: 'AGREEMENT_CHANGES_REQUESTED',
    AGREEMENT_APPROVED_FOR_SIGNATURE: 'AGREEMENT_APPROVED_FOR_SIGNATURE',
    AGREEMENT_PARTY_SIGNED: 'AGREEMENT_PARTY_SIGNED',
    AGREEMENT_EXECUTED: 'AGREEMENT_EXECUTED',
    AGREEMENT_EFFECTIVE: 'AGREEMENT_EFFECTIVE',
    AGREEMENT_ACTIVATED: 'AGREEMENT_ACTIVATED',
    AGREEMENT_COMPLETED: 'AGREEMENT_COMPLETED',
    AGREEMENT_ARCHIVED: 'AGREEMENT_ARCHIVED',
    AGREEMENT_TERMINATED: 'AGREEMENT_TERMINATED',
    AGREEMENT_REMOVAL_REQUESTED: 'AGREEMENT_REMOVAL_REQUESTED',
    AGREEMENT_REMOVAL_APPROVED: 'AGREEMENT_REMOVAL_APPROVED',
    AGREEMENT_REMOVAL_REJECTED: 'AGREEMENT_REMOVAL_REJECTED'
  },
  logAudit: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/utils/agreementObservability', () => ({
  recordTransitionStart: jest.fn(),
  recordTransitionOutcome: jest.fn(),
  inspectAgreementForAnomalies: jest.fn(),
  recordAnomaly: jest.fn(),
  getAgreementObservabilitySnapshot: jest.fn(() => ({
    transitions: { create_agreement: { success: 1 } },
    recent_anomalies: []
  }))
}));

const agreementController = require('../../src/controllers/agreementController');
const {
  Contract,
  ContractReview,
  AgreementRemovalRequest,
  Application,
  Attachment,
  User,
  sequelize
} = require('../../src/database/models');
const notificationService = require('../../src/services/notificationService');
const pdfService = require('../../src/services/pdfService');
const { getAgreementObservabilitySnapshot } = require('../../src/utils/agreementObservability');

const transactionMock = {
  LOCK: {
    UPDATE: 'UPDATE'
  }
};

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn().mockReturnThis()
  };
}

function makeReview(overrides = {}) {
  return {
    id: 21,
    contract_id: 10,
    reviewer_id: 1,
    review_stage: 'internal_review',
    action: 'approved',
    previous_status: 'internal_review',
    new_status: 'counterparty_review',
    feedback: null,
    changes_requested: null,
    created_at: new Date('2026-05-05T10:00:00.000Z'),
    toSafeObject() {
      return { ...this };
    },
    ...overrides
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
    template_version_id: 'NDA:v1',
    source_kind: 'template',
    uploaded_attachment_id: null,
    title: 'NDA Draft',
    status: 'draft',
    review_required: false,
    contains_sensitive_data: false,
    data_classification: 'internal',
    retention_period_days: null,
    destruction_required: false,
    variables: { project_title: 'Study A' },
    rendered_content: 'Rendered body',
    content_snapshot: 'Rendered body',
    storage_key: null,
    executed_filename: null,
    executed_mimetype: null,
    checksum: null,
    nonprofit_signed_at: null,
    nonprofit_sign_ip: null,
    researcher_signed_at: null,
    researcher_sign_ip: null,
    effective_at: null,
    completed_at: null,
    archived_at: null,
    root_contract_id: 10,
    version_number: 1,
    is_current_version: true,
    terminated_at: null,
    terminated_by: null,
    termination_reason: null,
    save: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn(function toJSON() {
      return { ...this };
    })
  };

  return { ...contract, ...overrides };
}

function makeRemovalRequest(overrides = {}) {
  const record = {
    id: 77,
    contract_id: 10,
    requested_by: 7,
    reason: 'Request cleanup',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    feedback: null,
    save: jest.fn().mockResolvedValue(true),
    toSafeObject() {
      return { ...this };
    },
    ...overrides
  };

  return record;
}

describe('agreementController lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adapterMock.save.mockReset();
    adapterMock.exists.mockReset();
    adapterMock.getReadStream.mockReset();
    sequelize.transaction.mockImplementation(async (callback) => callback(transactionMock));
    Contract.update.mockResolvedValue([1]);
    ContractReview.create.mockResolvedValue(makeReview());
    AgreementRemovalRequest.findOne.mockResolvedValue(null);
    AgreementRemovalRequest.findAll.mockResolvedValue([]);
    AgreementRemovalRequest.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    AgreementRemovalRequest.create.mockResolvedValue(makeRemovalRequest());
    User.findAll.mockResolvedValue([{ id: 90 }, { id: 91 }]);
  });

  test('createAgreement stores lifecycle metadata and default review rules', async () => {
    const req = {
      user: { id: 7, role: 'nonprofit', org_id: 4 },
      body: {
        application_id: 3,
        template_type: 'nda',
        title: 'Data NDA',
        contains_sensitive_data: true,
        retention_period_days: 90,
        variables: {
          project_title: 'Cancer Trial',
          nonprofit_name: 'Org',
          researcher_name: 'R',
          effective_date: '2026-03-14',
          confidential_scope: 'Data',
          term_months: '12',
          governing_law: 'CA'
        }
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
    Contract.create.mockResolvedValue(mockContract({ title: 'Data NDA', review_required: true, contains_sensitive_data: true }));

    await agreementController.createAgreement(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Application.findByPk).toHaveBeenCalledWith(3, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(Contract.findOne).toHaveBeenCalledWith(expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(Contract.create).toHaveBeenCalledWith(expect.objectContaining({
      template_type: 'NDA',
      template_version_id: 'NDA:v1',
      review_required: true,
      contains_sensitive_data: true,
      data_classification: 'confidential',
      retention_period_days: 90
    }), expect.objectContaining({ transaction: transactionMock }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('submitAgreementForReview routes to internal review when required', async () => {
    const contract = mockContract({ status: 'draft', review_required: true, contains_sensitive_data: true });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 7, role: 'nonprofit' }, params: { id: '10' }, body: { feedback: 'Ready for compliance.' } };
    const res = createRes();

    await agreementController.submitAgreementForReview(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(contract.status).toBe('internal_review');
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(ContractReview.create).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: 10,
      review_stage: 'submission',
      action: 'submitted',
      new_status: 'internal_review'
    }), expect.objectContaining({ transaction: transactionMock }));
    expect(notificationService.createBulkNotifications).toHaveBeenCalled();
  });

  test('submitAgreementForReview routes directly to counterparty review when internal review is not required', async () => {
    const contract = mockContract({ status: 'draft', review_required: false, contains_sensitive_data: false });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 7, role: 'nonprofit' }, params: { id: '10' }, body: {} };
    const res = createRes();

    await agreementController.submitAgreementForReview(req, res);

    expect(contract.status).toBe('counterparty_review');
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      type: 'agreement_submitted_for_review'
    }));
  });

  test('reviewAgreement approves internal review into counterparty review', async () => {
    const contract = mockContract({ status: 'internal_review', review_required: true });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 90, role: 'admin' }, params: { id: '10' }, body: { action: 'approve', feedback: 'Approved.' } };
    const res = createRes();

    await agreementController.reviewAgreement(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(contract.status).toBe('counterparty_review');
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(ContractReview.create).toHaveBeenCalledWith(expect.objectContaining({
      review_stage: 'internal_review',
      action: 'approved',
      new_status: 'counterparty_review'
    }), expect.objectContaining({ transaction: transactionMock }));
  });

  test('reviewAgreement can request changes from internal review', async () => {
    const contract = mockContract({ status: 'internal_review', review_required: true });
    Contract.findByPk.mockResolvedValue(contract);
    const req = {
      user: { id: 90, role: 'super_admin' },
      params: { id: '10' },
      body: { action: 'changes_requested', changes_requested: 'Tighten retention clause.' }
    };
    const res = createRes();

    await agreementController.reviewAgreement(req, res);

    expect(contract.status).toBe('changes_requested');
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      type: 'agreement_changes_requested'
    }));
  });

  test('counterpartyReviewAgreement approves agreement for signature', async () => {
    const contract = mockContract({ status: 'counterparty_review' });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 11, role: 'researcher' }, params: { id: '10' }, body: { action: 'approve' } };
    const res = createRes();

    await agreementController.counterpartyReviewAgreement(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(contract.status).toBe('approved_for_signature');
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      type: 'agreement_approved_for_signature'
    }));
  });

  test('signAgreement blocks signing before approved_for_signature', async () => {
    const contract = mockContract({ status: 'counterparty_review' });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 7 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' };
    const res = createRes();

    await agreementController.signAgreement(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('signAgreement moves first signature to pending_signature', async () => {
    const contract = mockContract({ status: 'approved_for_signature' });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 7 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' };
    const res = createRes();

    await agreementController.signAgreement(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(contract.status).toBe('pending_signature');
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      type: 'agreement_pending_signature'
    }));
  });

  test('signAgreement executes agreement once both parties sign', async () => {
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
    const req = { user: { id: 11 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' };
    const res = createRes();

    await agreementController.signAgreement(req, res);

    expect(contract.status).toBe('executed');
    expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
      [7, 11],
      expect.objectContaining({ type: 'agreement_executed' })
    );
  });

  test('signAgreement copies uploaded attachment when source kind is attachment', async () => {
    const contract = mockContract({
      status: 'pending_signature',
      source_kind: 'attachment',
      template_type: 'SOW',
      uploaded_attachment_id: 99,
      nonprofit_signed_at: new Date('2026-03-14T00:00:00.000Z')
    });
    Contract.findByPk.mockResolvedValue(contract);
    Attachment.findByPk.mockResolvedValue({
      id: 99,
      project_id: 22,
      status: 'active',
      filename: 'signed-source.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1024,
      storage_key: 'project-22/signed-source.docx'
    });
    adapterMock.getReadStream.mockResolvedValue(require('stream').Readable.from([Buffer.from('docx-payload')]));
    adapterMock.save.mockResolvedValue({ storageKey: 'project-22/executed.docx' });
    const req = { user: { id: 11 }, params: { id: '10' }, headers: {}, ip: '127.0.0.1' };
    const res = createRes();

    await agreementController.signAgreement(req, res);

    expect(pdfService.generatePdf).not.toHaveBeenCalled();
    expect(adapterMock.save).toHaveBeenCalledWith(expect.objectContaining({
      filename: expect.stringMatching(/\.docx$/),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }));
  });

  test('makeAgreementEffective requires sensitive-data prerequisites', async () => {
    const contract = mockContract({ status: 'executed', contains_sensitive_data: true, retention_period_days: null });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 7 }, params: { id: '10' } };
    const res = createRes();

    await agreementController.makeAgreementEffective(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('makeAgreementEffective moves executed agreement to effective', async () => {
    const contract = mockContract({
      status: 'executed',
      contains_sensitive_data: true,
      review_required: true,
      retention_period_days: 180,
      data_classification: 'restricted'
    });
    Contract.findByPk.mockResolvedValue(contract);
    const req = { user: { id: 7 }, params: { id: '10' } };
    const res = createRes();

    await agreementController.makeAgreementEffective(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(contract.status).toBe('effective');
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      type: 'agreement_effective'
    }));
  });

  test('activateAgreement requires effective status', async () => {
    const res = createRes();

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'effective' }));
    await agreementController.activateAgreement({ user: { id: 7 }, params: { id: '10' } }, res);
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(Contract.update).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ transaction: transactionMock }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement activated' }));

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'executed' }));
    await agreementController.activateAgreement({ user: { id: 7 }, params: { id: '10' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('completeAgreement and archiveAgreement advance the post-execution lifecycle', async () => {
    const completeRes = createRes();
    const archiveRes = createRes();
    const activeContract = mockContract({ status: 'active' });
    Contract.findByPk.mockResolvedValueOnce(activeContract);

    await agreementController.completeAgreement({ user: { id: 7 }, params: { id: '10' } }, completeRes);
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(activeContract.status).toBe('completed');
    expect(activeContract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));

    const completedContract = mockContract({ status: 'completed' });
    Contract.findByPk.mockResolvedValueOnce(completedContract);
    await agreementController.archiveAgreement({ user: { id: 7 }, params: { id: '10' } }, archiveRes);
    expect(sequelize.transaction).toHaveBeenCalledTimes(2);
    expect(completedContract.status).toBe('archived');
    expect(completedContract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
  });

  test('downloadAgreement verifies checksum before sending', async () => {
    const crypto = require('crypto');
    const buffer = Buffer.from('signed pdf payload');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const contract = mockContract({ status: 'executed', storage_key: 'project-22/nda.pdf', checksum });

    Contract.findByPk.mockResolvedValue(contract);
    adapterMock.exists.mockResolvedValue(true);
    adapterMock.getReadStream.mockResolvedValue(require('stream').Readable.from([buffer]));

    const req = { user: { id: 7, role: 'nonprofit' }, params: { id: '10' } };
    const res = createRes();
    await agreementController.downloadAgreement(req, res);

    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  test('downloadAgreement rejects checksum mismatch', async () => {
    const contract = mockContract({ status: 'executed', storage_key: 'x', checksum: 'b'.repeat(64) });
    Contract.findByPk.mockResolvedValue(contract);
    adapterMock.exists.mockResolvedValue(true);
    adapterMock.getReadStream.mockResolvedValue(require('stream').Readable.from([Buffer.from('tampered payload')]));

    const req = { user: { id: 7, role: 'nonprofit' }, params: { id: '10' } };
    const res = createRes();
    await agreementController.downloadAgreement(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('terminateAgreement only allows post-execution statuses', async () => {
    const res = createRes();

    Contract.findByPk.mockResolvedValueOnce(mockContract({ status: 'draft' }));
    await agreementController.terminateAgreement({ user: { id: 7 }, params: { id: '10' }, body: { reason: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    const contract = mockContract({ status: 'active' });
    Contract.findByPk.mockResolvedValueOnce(contract);
    await agreementController.terminateAgreement({ user: { id: 7 }, params: { id: '10' }, body: { reason: 'Project cancelled' } }, res);
    expect(sequelize.transaction).toHaveBeenCalledTimes(2);
    expect(contract.status).toBe('terminated');
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
  });

  test('createAmendment clones executed agreement into a draft amendment', async () => {
    const original = mockContract({
      status: 'completed',
      version_number: 1,
      root_contract_id: 10,
      review_required: true,
      contains_sensitive_data: true,
      retention_period_days: 30
    });
    const amendment = mockContract({
      id: 12,
      status: 'draft',
      version_number: 2,
      parent_contract_id: 10,
      root_contract_id: 10,
      supersedes_contract_id: 10,
      is_current_version: false
    });

    Contract.findByPk.mockResolvedValueOnce(original);
    Contract.findOne.mockResolvedValueOnce(null);
    Contract.create.mockResolvedValueOnce(amendment);

    const req = { user: { id: 7, role: 'nonprofit' }, params: { id: '10' }, body: { reason: 'Extend retention terms' } };
    const res = createRes();
    await agreementController.createAmendment(req, res);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Contract.findByPk).toHaveBeenCalledWith(10, expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(Contract.findOne).toHaveBeenCalledWith(expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(Contract.create).toHaveBeenCalledWith(expect.objectContaining({
      parent_contract_id: 10,
      supersedes_contract_id: 10,
      version_number: 2,
      review_required: true,
      contains_sensitive_data: true,
      retention_period_days: 30
    }), expect.objectContaining({ transaction: transactionMock }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('createAmendment rejects historical agreement versions', async () => {
    const original = mockContract({
      status: 'completed',
      is_current_version: false,
      version_number: 1,
      root_contract_id: 10
    });

    Contract.findByPk.mockResolvedValueOnce(original);

    const req = { user: { id: 7, role: 'nonprofit' }, params: { id: '10' }, body: { reason: 'Revise legacy version' } };
    const res = createRes();
    await agreementController.createAmendment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(Contract.findOne).not.toHaveBeenCalled();
    expect(Contract.create).not.toHaveBeenCalled();
  });

  test('requestAgreementRemoval creates pending request for agreement party', async () => {
    const contract = mockContract({ status: 'active', title: 'Active NDA' });
    const removalRequest = makeRemovalRequest({ id: 501, reason: 'Duplicate agreement' });
    Contract.findByPk.mockResolvedValue(contract);
    AgreementRemovalRequest.findOne.mockResolvedValueOnce(null);
    AgreementRemovalRequest.create.mockResolvedValueOnce(removalRequest);

    const req = {
      user: { id: 7, role: 'nonprofit' },
      params: { id: '10' },
      body: { reason: 'Duplicate agreement' }
    };
    const res = createRes();

    await agreementController.requestAgreementRemoval(req, res);

    expect(AgreementRemovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contract_id: 10,
        requested_by: 7,
        reason: 'Duplicate agreement',
        status: 'pending'
      }),
      expect.objectContaining({ transaction: transactionMock })
    );
    expect(ContractReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'removal_requested', contract_id: 10 }),
      expect.objectContaining({ transaction: transactionMock })
    );
    expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
      [90, 91],
      expect.objectContaining({ type: 'agreement_removal_requested' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('approveAgreementRemovalRequest archives agreement and notifies both parties', async () => {
    const contract = mockContract({ status: 'active', metadata: { source: 'test' } });
    const removalRequest = makeRemovalRequest({ id: 700, reason: 'Retired scope' });
    Contract.findByPk.mockResolvedValueOnce(contract);
    AgreementRemovalRequest.findOne.mockResolvedValueOnce(removalRequest);

    const req = {
      user: { id: 90, role: 'admin' },
      params: { id: '10', requestId: '700' },
      body: { feedback: 'Approved by compliance' }
    };
    const res = createRes();

    await agreementController.approveAgreementRemovalRequest(req, res);

    expect(removalRequest.status).toBe('approved');
    expect(removalRequest.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(contract.status).toBe('archived');
    expect(contract.is_current_version).toBe(false);
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(notificationService.createBulkNotifications).toHaveBeenCalledWith(
      [7, 11],
      expect.objectContaining({ type: 'agreement_removal_approved' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement removal request approved' }));
  });

  test('rejectAgreementRemovalRequest records rejection and notifies requester', async () => {
    const contract = mockContract({ status: 'active', title: 'Agreement A' });
    const removalRequest = makeRemovalRequest({ id: 701, requested_by: 11 });
    Contract.findByPk.mockResolvedValueOnce(contract);
    AgreementRemovalRequest.findOne.mockResolvedValueOnce(removalRequest);

    const req = {
      user: { id: 90, role: 'super_admin' },
      params: { id: '10', requestId: '701' },
      body: { feedback: 'Insufficient justification' }
    };
    const res = createRes();

    await agreementController.rejectAgreementRemovalRequest(req, res);

    expect(removalRequest.status).toBe('rejected');
    expect(removalRequest.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(ContractReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'removal_rejected', contract_id: 10 }),
      expect.objectContaining({ transaction: transactionMock })
    );
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 11, type: 'agreement_removal_rejected' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agreement removal request rejected' }));
  });

  test('adminListAgreementRemovalRequests returns paginated records', async () => {
    AgreementRemovalRequest.findAndCountAll.mockResolvedValueOnce({
      count: 1,
      rows: [makeRemovalRequest({ id: 888, status: 'approved' })]
    });

    const req = { query: { page: '1', limit: '5', status: 'approved' } };
    const res = createRes();

    await agreementController.adminListAgreementRemovalRequests(req, res);

    expect(AgreementRemovalRequest.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'approved' },
        limit: 5,
        offset: 0
      })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1, requests: expect.any(Array) }));
  });

  test('listAgreementReviews and listAgreementHistory return structured workflow data', async () => {
    const contract = mockContract({ root_contract_id: 10 });
    Contract.findByPk.mockResolvedValue(contract);
    ContractReview.findAll.mockResolvedValue([makeReview()]);
    Contract.findAndCountAll.mockResolvedValue({
      count: 2,
      rows: [contract, mockContract({ id: 12, root_contract_id: 10, version_number: 2, status: 'draft' })]
    });

    const reviewsRes = createRes();
    const historyRes = createRes();

    await agreementController.listAgreementReviews({ user: { id: 7, role: 'nonprofit' }, params: { id: '10' } }, reviewsRes);
    await agreementController.listAgreementHistory({ user: { id: 7, role: 'nonprofit' }, params: { id: '10' } }, historyRes);

    expect(reviewsRes.json).toHaveBeenCalledWith(expect.objectContaining({ reviews: expect.any(Array) }));
    expect(historyRes.json).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      limit: 100,
      total: 2,
      history: expect.any(Array)
    }));
  });

  test('previewAgreement and adminListAgreements still return expected payloads', async () => {
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
    const res = createRes();
    await agreementController.getTemplates({}, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ templates: expect.any(Array) }));
  });

  test('adminAgreementStats returns lifecycle status counts', async () => {
    const res = createRes();

    Contract.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    await agreementController.adminAgreementStats({}, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      total: 12,
      by_status: expect.objectContaining({
        draft: 2,
        pending_signature: 3,
        executed: 4,
        effective: 1,
        active: 1,
        completed: 1
      })
    }));
  });

  test('adminAgreementObservability returns transition/anomaly snapshot', async () => {
    const res = createRes();

    await agreementController.adminAgreementObservability({}, res);

    expect(getAgreementObservabilitySnapshot).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      transitions: expect.any(Object),
      recent_anomalies: expect.any(Array)
    }));
  });
});