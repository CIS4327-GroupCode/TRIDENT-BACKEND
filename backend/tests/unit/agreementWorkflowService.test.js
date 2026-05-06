jest.mock('../../src/database/models', () => ({
  Contract: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  ContractReview: {
    create: jest.fn()
  },
  sequelize: {
    transaction: jest.fn()
  }
}));

jest.mock('../../src/utils/agreementObservability', () => ({
  recordTransitionStart: jest.fn(),
  recordTransitionOutcome: jest.fn(),
  inspectAgreementForAnomalies: jest.fn()
}));

const { Contract, ContractReview, sequelize } = require('../../src/database/models');
const {
  recordTransitionStart,
  recordTransitionOutcome,
  inspectAgreementForAnomalies
} = require('../../src/utils/agreementObservability');
const {
  createAgreementTransition,
  createAmendmentTransition,
  signAgreementTransition,
  makeAgreementEffectiveTransition,
  activateAgreementTransition,
  terminateAgreementTransition,
  archiveAgreementTransition,
  updateAgreementDraftTransition
} = require('../../src/services/agreementWorkflowService');

const transactionMock = {
  LOCK: {
    UPDATE: 'UPDATE'
  }
};

function mockContract(overrides = {}) {
  return {
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
    status: 'approved_for_signature',
    review_required: false,
    contains_sensitive_data: false,
    data_classification: 'internal',
    retention_period_days: null,
    destruction_required: false,
    variables: { project_title: 'Study A' },
    rendered_content: 'Rendered body',
    content_snapshot: 'Rendered body',
    root_contract_id: 10,
    version_number: 1,
    is_current_version: true,
    nonprofit_signed_at: null,
    nonprofit_sign_ip: null,
    researcher_signed_at: null,
    researcher_sign_ip: null,
    metadata: null,
    save: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn(function toJSON() {
      return { ...this };
    }),
    ...overrides
  };
}

describe('agreementWorkflowService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (callback) => callback(transactionMock));
    ContractReview.create.mockResolvedValue({ id: 1 });
  });

  it('createAgreementTransition creates a draft agreement inside locked transaction', async () => {
    const created = mockContract({ id: 99, root_contract_id: null, status: 'draft' });
    Contract.findOne.mockResolvedValue(null);
    Contract.create.mockResolvedValue(created);

    const result = await createAgreementTransition({
      applicationId: 3,
      actorUser: { id: 7, org_id: 4 },
      templateType: 'NDA',
      sourceKind: 'template',
      variables: { project_title: 'Cancer Trial' },
      freeTextContent: '',
      uploadedAttachmentId: null,
      title: 'Data NDA',
      reviewRequired: true,
      containsSensitiveData: true,
      dataClassification: 'confidential',
      retentionPeriodDays: 90,
      destructionRequired: true,
      resolveAcceptedApplication: jest.fn().mockResolvedValue({
        application: {
          id: 3,
          project_id: 22,
          org_id: 4,
          researcher_id: 11,
          status: 'accepted'
        }
      }),
      resolveAgreementSource: jest.fn().mockResolvedValue({
        sourceKind: 'template',
        uploadedAttachmentId: null,
        variables: { project_title: 'Cancer Trial' },
        renderedContent: 'Rendered NDA Preview',
        contentSnapshot: 'Rendered NDA Preview'
      })
    });

    expect(Contract.findOne).toHaveBeenCalledWith(expect.objectContaining({
      transaction: transactionMock,
      lock: 'UPDATE'
    }));
    expect(Contract.create).toHaveBeenCalledWith(expect.objectContaining({
      application_id: 3,
      project_id: 22,
      template_type: 'NDA',
      status: 'draft',
      review_required: true,
      contains_sensitive_data: true
    }), expect.objectContaining({ transaction: transactionMock }));
    expect(created.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
    expect(result.error).toBeUndefined();
    expect(result.agreement.id).toBe(99);
    expect(recordTransitionStart).toHaveBeenCalledWith(expect.objectContaining({ transition: 'create_agreement' }));
    expect(recordTransitionOutcome).toHaveBeenCalledWith(expect.objectContaining({
      transition: 'create_agreement',
      outcome: 'success'
    }));
    expect(inspectAgreementForAnomalies).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }), expect.objectContaining({ transition: 'create_agreement' }));
  });

  it('createAgreementTransition returns conflict when a current open agreement already exists', async () => {
    Contract.findOne.mockResolvedValue({ id: 55 });

    const result = await createAgreementTransition({
      applicationId: 3,
      actorUser: { id: 7, org_id: 4 },
      templateType: 'NDA',
      sourceKind: 'template',
      variables: {},
      freeTextContent: '',
      uploadedAttachmentId: null,
      title: 'Data NDA',
      reviewRequired: false,
      containsSensitiveData: false,
      dataClassification: 'internal',
      retentionPeriodDays: null,
      destructionRequired: false,
      resolveAcceptedApplication: jest.fn().mockResolvedValue({
        application: {
          id: 3,
          project_id: 22,
          org_id: 4,
          researcher_id: 11,
          status: 'accepted'
        }
      }),
      resolveAgreementSource: jest.fn()
    });

    expect(result).toEqual({
      error: {
        status: 409,
        message: 'A current agreement of this type already exists for this accepted application or invitation'
      }
    });
    expect(Contract.create).not.toHaveBeenCalled();
    expect(recordTransitionOutcome).toHaveBeenCalledWith(expect.objectContaining({
      transition: 'create_agreement',
      outcome: 'business_error',
      statusCode: 409
    }));
  });

  it('signAgreementTransition moves first signature to pending_signature without artifact generation', async () => {
    const contract = mockContract({ status: 'approved_for_signature', nonprofit_signed_at: null, researcher_signed_at: null });
    Contract.findByPk.mockResolvedValue(contract);
    const executeArtifact = jest.fn();

    const result = await signAgreementTransition({
      agreementId: 10,
      actorId: 7,
      signIp: '127.0.0.1',
      executeArtifact
    });

    expect(result.transition).toBe('pending_signature');
    expect(result.agreement.status).toBe('pending_signature');
    expect(executeArtifact).not.toHaveBeenCalled();
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
  });

  it('signAgreementTransition executes when both parties have signed', async () => {
    const contract = mockContract({
      status: 'pending_signature',
      nonprofit_signed_at: null,
      researcher_signed_at: new Date('2026-05-06T10:00:00.000Z')
    });
    Contract.findByPk.mockResolvedValue(contract);
    const executeArtifact = jest.fn().mockResolvedValue({
      storageKey: 'agreements/10/executed.pdf',
      checksum: 'abc123',
      filename: 'agreement-10.pdf',
      mimetype: 'application/pdf'
    });

    const result = await signAgreementTransition({
      agreementId: 10,
      actorId: 7,
      signIp: '127.0.0.1',
      executeArtifact
    });

    expect(result.transition).toBe('executed');
    expect(result.agreement.status).toBe('executed');
    expect(result.agreement.storage_key).toBe('agreements/10/executed.pdf');
    expect(executeArtifact).toHaveBeenCalledTimes(1);
  });

  it('createAmendmentTransition rejects historical agreement versions', async () => {
    const contract = mockContract({ status: 'executed', is_current_version: false });
    Contract.findByPk.mockResolvedValue(contract);

    const result = await createAmendmentTransition({
      agreementId: 10,
      actorId: 7,
      reason: 'Need revised scope'
    });

    expect(result).toEqual({
      error: {
        status: 409,
        message: 'Only the current agreement version can be amended'
      }
    });
    expect(Contract.create).not.toHaveBeenCalled();
  });

  it('makeAgreementEffectiveTransition enforces operational prerequisites for sensitive data', async () => {
    const contract = mockContract({ status: 'executed', contains_sensitive_data: true, retention_period_days: null });
    Contract.findByPk.mockResolvedValue(contract);

    const result = await makeAgreementEffectiveTransition({
      agreementId: 10,
      actorId: 7,
      validateOperationalPrerequisites: () => 'Sensitive-data agreements require retention_period_days before becoming effective'
    });

    expect(result).toEqual({
      error: {
        status: 400,
        message: 'Sensitive-data agreements require retention_period_days before becoming effective'
      }
    });
    expect(contract.save).not.toHaveBeenCalled();
  });

  it('activateAgreementTransition deactivates previous current versions before activating target', async () => {
    const contract = mockContract({ status: 'effective', is_current_version: false });
    Contract.findByPk.mockResolvedValue(contract);
    Contract.update.mockResolvedValue([1]);

    const result = await activateAgreementTransition({
      agreementId: 10,
      actorId: 7
    });

    expect(Contract.update).toHaveBeenCalledWith(
      { is_current_version: false },
      expect.objectContaining({ transaction: transactionMock })
    );
    expect(result.error).toBeUndefined();
    expect(result.agreement.status).toBe('active');
    expect(result.agreement.is_current_version).toBe(true);
  });

  it('terminateAgreementTransition rejects users outside agreement parties', async () => {
    const contract = mockContract({ status: 'active' });
    Contract.findByPk.mockResolvedValue(contract);

    const result = await terminateAgreementTransition({
      agreementId: 10,
      actorId: 999,
      reason: 'Stop collaboration'
    });

    expect(result).toEqual({
      error: {
        status: 403,
        message: 'You are not authorized to terminate this agreement'
      }
    });
  });

  it('archiveAgreementTransition allows admin users to archive terminated agreements', async () => {
    const contract = mockContract({ status: 'terminated' });
    Contract.findByPk.mockResolvedValue(contract);

    const result = await archiveAgreementTransition({
      agreementId: 10,
      actor: { id: 90, role: 'admin' }
    });

    expect(result.error).toBeUndefined();
    expect(result.agreement.status).toBe('archived');
    expect(result.agreement.is_current_version).toBe(false);
  });

  it('updateAgreementDraftTransition updates draft metadata in locked transaction', async () => {
    const contract = mockContract({ status: 'draft' });
    Contract.findByPk.mockResolvedValue(contract);

    const result = await updateAgreementDraftTransition({
      agreementId: 10,
      actorId: 7,
      nextTemplateType: 'DUA',
      nextTitle: 'Updated Draft',
      nextSourceKind: 'template',
      nextVariables: { project_title: 'Updated Study' },
      nextFreeTextContent: '',
      nextUploadedAttachmentId: null,
      nextReviewRequired: true,
      nextContainsSensitiveData: true,
      nextDataClassification: 'confidential',
      nextRetentionPeriodDays: 365,
      nextDestructionRequired: true,
      resolveAgreementSource: jest.fn().mockResolvedValue({
        sourceKind: 'template',
        uploadedAttachmentId: null,
        variables: { project_title: 'Updated Study' },
        renderedContent: 'Updated render',
        contentSnapshot: 'Updated render'
      })
    });

    expect(result.error).toBeUndefined();
    expect(result.agreement.template_type).toBe('DUA');
    expect(result.agreement.title).toBe('Updated Draft');
    expect(result.after.review_required).toBe(true);
    expect(contract.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: transactionMock }));
  });

  it('updateAgreementDraftTransition returns bad request when source resolution fails', async () => {
    const contract = mockContract({ status: 'draft' });
    Contract.findByPk.mockResolvedValue(contract);

    const result = await updateAgreementDraftTransition({
      agreementId: 10,
      actorId: 7,
      nextTemplateType: 'NDA',
      nextTitle: 'Draft',
      nextSourceKind: 'attachment',
      nextVariables: {},
      nextFreeTextContent: '',
      nextUploadedAttachmentId: 99,
      nextReviewRequired: false,
      nextContainsSensitiveData: false,
      nextDataClassification: 'internal',
      nextRetentionPeriodDays: null,
      nextDestructionRequired: false,
      resolveAgreementSource: jest.fn().mockRejectedValue(new Error('Uploaded agreement source attachment was not found for this project'))
    });

    expect(result).toEqual({
      error: {
        status: 400,
        message: 'Uploaded agreement source attachment was not found for this project'
      }
    });
    expect(contract.save).not.toHaveBeenCalled();
  });
});
