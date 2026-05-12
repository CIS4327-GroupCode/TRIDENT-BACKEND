const { Op } = require('sequelize');
const { Contract, ContractReview, sequelize } = require('../database/models');
const {
  recordTransitionStart,
  recordTransitionOutcome,
  inspectAgreementForAnomalies
} = require('../utils/agreementObservability');

const CONFLICTING_CURRENT_STATUSES = [
  'draft',
  'internal_review',
  'counterparty_review',
  'changes_requested',
  'approved_for_signature',
  'pending_signature',
  'executed',
  'effective',
  'active'
];
const TERMINABLE_STATUSES = ['executed', 'effective', 'active'];
const AMENDABLE_STATUSES = ['executed', 'effective', 'active', 'completed'];
const COMPLETABLE_STATUSES = ['effective', 'active'];
const ARCHIVABLE_STATUSES = ['completed', 'terminated', 'expired'];

function sanitizeContractResponse(contract) {
  const plain = contract.toJSON();
  if (plain.variables && typeof plain.variables === 'object') {
    plain.variables = { ...plain.variables };
  }
  if (plain.metadata && typeof plain.metadata === 'object') {
    plain.metadata = { ...plain.metadata };
  }
  return plain;
}

function isAdminReviewer(user) {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

function isAgreementParty(contract, userId) {
  return contract.nonprofit_user_id === userId || contract.researcher_user_id === userId;
}

async function createContractReviewRecord({
  contractId,
  reviewerId,
  reviewStage,
  action,
  previousStatus,
  newStatus,
  feedback,
  changesRequested,
  transaction
}) {
  const payload = {
    contract_id: contractId,
    reviewer_id: reviewerId,
    review_stage: reviewStage,
    action,
    previous_status: previousStatus || null,
    new_status: newStatus,
    feedback: feedback || null,
    changes_requested: changesRequested || null
  };

  if (transaction) {
    return ContractReview.create(payload, { transaction });
  }

  return ContractReview.create(payload);
}

async function observeTransition({ transition, actorId, agreementId }, execute) {
  const startedAt = Date.now();
  recordTransitionStart({ transition, actorId, agreementId });

  try {
    const result = await execute();

    if (result && result.error) {
      recordTransitionOutcome({
        transition,
        outcome: 'business_error',
        actorId,
        agreementId,
        durationMs: Date.now() - startedAt,
        statusCode: result.error.status,
        errorMessage: result.error.message
      });
      return result;
    }

    const agreement = result?.agreement;
    recordTransitionOutcome({
      transition,
      outcome: 'success',
      actorId,
      agreementId: agreement?.id || agreementId,
      durationMs: Date.now() - startedAt,
      agreementStatus: agreement?.status
    });

    if (agreement) {
      inspectAgreementForAnomalies(agreement, { transition });
    }

    return result;
  } catch (error) {
    recordTransitionOutcome({
      transition,
      outcome: 'exception',
      actorId,
      agreementId,
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      errorMessage: error.message
    });
    throw error;
  }
}

async function createAgreementTransition({
  applicationId,
  actorUser,
  templateType,
  sourceKind,
  variables,
  freeTextContent,
  uploadedAttachmentId,
  title,
  reviewRequired,
  containsSensitiveData,
  dataClassification,
  retentionPeriodDays,
  destructionRequired,
  agreementMetadata,
  resolveAcceptedApplication,
  resolveAgreementSource
}) {
  return observeTransition({
    transition: 'create_agreement',
    actorId: actorUser?.id,
    agreementId: null
  }, async () => sequelize.transaction(async (transaction) => {
    const appResult = await resolveAcceptedApplication(applicationId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (appResult.error) {
      return { error: appResult.error };
    }

    const { application } = appResult;

    if (application.org_id !== actorUser.org_id) {
      return { error: { status: 403, message: 'You are not authorized to create agreements for this application' } };
    }

    const existingOpenContract = await Contract.findOne({
      where: {
        application_id: application.id,
        template_type: templateType,
        is_current_version: true,
        status: {
          [Op.in]: CONFLICTING_CURRENT_STATUSES
        }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (existingOpenContract) {
      return { error: { status: 409, message: 'A current agreement of this type already exists for this accepted application or invitation' } };
    }

    let sourcePayload;
    try {
      sourcePayload = await resolveAgreementSource({
        sourceKind,
        templateType,
        variables,
        freeTextContent,
        uploadedAttachmentId,
        projectId: application.project_id,
        transaction
      });
    } catch (error) {
      return { error: { status: 400, message: error.message } };
    }

    const contract = await Contract.create({
      application_id: application.id,
      project_id: application.project_id,
      nonprofit_user_id: actorUser.id,
      researcher_user_id: application.researcher_id,
      template_type: templateType,
      source_kind: sourcePayload.sourceKind,
      template_version_id: `${templateType}:v1`,
      uploaded_attachment_id: sourcePayload.uploadedAttachmentId,
      title,
      status: 'draft',
      review_required: reviewRequired,
      contains_sensitive_data: containsSensitiveData,
      data_classification: dataClassification,
      retention_period_days: retentionPeriodDays,
      destruction_required: destructionRequired,
      variables: sourcePayload.variables,
      rendered_content: sourcePayload.renderedContent,
      content_snapshot: sourcePayload.contentSnapshot,
      version_number: 1,
      is_current_version: true,
      metadata: agreementMetadata || null
    }, { transaction });

    if (!contract.root_contract_id) {
      contract.root_contract_id = contract.id;
      await contract.save({ transaction });
    }

    return {
      agreement: sanitizeContractResponse(contract),
      applicationId: application.id,
      projectId: application.project_id,
      templateType
    };
  }));
}

async function submitAgreementForReviewTransition({ agreementId, actorId, feedback }) {
  return observeTransition({
    transition: 'submit_for_review',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (contract.nonprofit_user_id !== actorId) {
      return { error: { status: 403, message: 'Only the agreement creator can submit for review' } };
    }

    if (!['draft', 'changes_requested'].includes(contract.status)) {
      return { error: { status: 400, message: 'Only draft or changes-requested agreements can be submitted for review' } };
    }

    const previousStatus = contract.status;
    const nextStatus = contract.review_required ? 'internal_review' : 'counterparty_review';

    contract.status = nextStatus;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actorId,
      reviewStage: 'submission',
      action: 'submitted',
      previousStatus,
      newStatus: nextStatus,
      feedback,
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract),
      nextStatus,
      previousStatus
    };
  }));
}

async function reviewAgreementTransition({ agreementId, actor, action, feedback, changesRequested }) {
  return observeTransition({
    transition: action === 'approve' ? 'internal_review_approve' : 'internal_review_changes_requested',
    actorId: actor?.id,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (!isAdminReviewer(actor)) {
      return { error: { status: 403, message: 'Admin access required' } };
    }

    if (contract.status !== 'internal_review') {
      return { error: { status: 400, message: 'Agreement must be in internal_review status' } };
    }

    const previousStatus = contract.status;
    const nextStatus = action === 'approve' ? 'counterparty_review' : 'changes_requested';
    contract.status = nextStatus;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actor.id,
      reviewStage: 'internal_review',
      action: action === 'approve' ? 'approved' : 'changes_requested',
      previousStatus,
      newStatus: nextStatus,
      feedback,
      changesRequested,
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract),
      nextStatus,
      previousStatus
    };
  }));
}

async function counterpartyReviewAgreementTransition({ agreementId, actorId, action, feedback, changesRequested }) {
  return observeTransition({
    transition: action === 'approve' ? 'counterparty_review_approve' : 'counterparty_review_changes_requested',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (contract.researcher_user_id !== actorId) {
      return { error: { status: 403, message: 'Only the counterparty researcher can review this agreement' } };
    }

    if (contract.status !== 'counterparty_review') {
      return { error: { status: 400, message: 'Agreement must be in counterparty_review status' } };
    }

    const previousStatus = contract.status;
    const nextStatus = action === 'approve' ? 'approved_for_signature' : 'changes_requested';
    contract.status = nextStatus;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actorId,
      reviewStage: 'counterparty_review',
      action: action === 'approve' ? 'counterparty_approved' : 'counterparty_changes_requested',
      previousStatus,
      newStatus: nextStatus,
      feedback,
      changesRequested,
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract),
      nextStatus,
      previousStatus
    };
  }));
}

async function terminateAgreementTransition({ agreementId, actorId, reason }) {
  return observeTransition({
    transition: 'terminate_agreement',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (!isAgreementParty(contract, actorId)) {
      return { error: { status: 403, message: 'You are not authorized to terminate this agreement' } };
    }

    if (contract.status === 'terminated') {
      return { error: { status: 409, message: 'Agreement is already terminated' } };
    }

    if (!TERMINABLE_STATUSES.includes(contract.status)) {
      return { error: { status: 400, message: 'Only executed, effective, or active agreements can be terminated' } };
    }

    const previousStatus = contract.status;
    contract.status = 'terminated';
    contract.terminated_at = new Date();
    contract.terminated_by = actorId;
    contract.termination_reason = reason;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actorId,
      reviewStage: 'post_execution',
      action: 'changes_requested',
      previousStatus,
      newStatus: 'terminated',
      feedback: reason,
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract),
      previousStatus,
      otherPartyId: contract.nonprofit_user_id === actorId
        ? contract.researcher_user_id
        : contract.nonprofit_user_id
    };
  }));
}

async function createAmendmentTransition({ agreementId, actorId, reason }) {
  return observeTransition({
    transition: 'create_amendment',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (!isAgreementParty(contract, actorId)) {
      return { error: { status: 403, message: 'You are not authorized to amend this agreement' } };
    }

    if (!AMENDABLE_STATUSES.includes(contract.status)) {
      return { error: { status: 400, message: 'Only executed, effective, active, or completed agreements can be amended' } };
    }

    if (contract.is_current_version === false) {
      return { error: { status: 409, message: 'Only the current agreement version can be amended' } };
    }

    const existingAmendment = await Contract.findOne({
      where: {
        supersedes_contract_id: contract.id,
        status: {
          [Op.in]: CONFLICTING_CURRENT_STATUSES
        }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (existingAmendment) {
      return { error: { status: 409, message: 'An amendment is already in progress for this agreement' } };
    }

    const amendment = await Contract.create({
      application_id: contract.application_id,
      project_id: contract.project_id,
      nonprofit_user_id: contract.nonprofit_user_id,
      researcher_user_id: contract.researcher_user_id,
      template_type: contract.template_type,
      template_version_id: contract.template_version_id,
      source_kind: contract.source_kind,
      uploaded_attachment_id: contract.uploaded_attachment_id,
      title: `${contract.title} Amendment v${(contract.version_number || 1) + 1}`,
      status: 'draft',
      review_required: contract.review_required,
      contains_sensitive_data: contract.contains_sensitive_data,
      data_classification: contract.data_classification,
      retention_period_days: contract.retention_period_days,
      destruction_required: contract.destruction_required,
      variables: contract.variables || {},
      rendered_content: contract.rendered_content,
      content_snapshot: contract.content_snapshot,
      parent_contract_id: contract.id,
      root_contract_id: contract.root_contract_id || contract.id,
      supersedes_contract_id: contract.id,
      version_number: (contract.version_number || 1) + 1,
      is_current_version: false,
      metadata: {
        ...(contract.metadata || {}),
        amendment_reason: reason || null,
        amendment_initiated_by: actorId
      }
    }, { transaction });

    return {
      agreement: sanitizeContractResponse(amendment),
      supersededAgreementId: contract.id,
      otherPartyId: contract.nonprofit_user_id === actorId
        ? contract.researcher_user_id
        : contract.nonprofit_user_id
    };
  }));
}

async function makeAgreementEffectiveTransition({ agreementId, actorId, validateOperationalPrerequisites }) {
  return observeTransition({
    transition: 'make_effective',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (contract.nonprofit_user_id !== actorId) {
      return { error: { status: 403, message: 'Only nonprofit owner can mark this agreement effective' } };
    }

    if (contract.status !== 'executed') {
      return { error: { status: 400, message: 'Only executed agreements can become effective' } };
    }

    const prerequisiteError = validateOperationalPrerequisites(contract);
    if (prerequisiteError) {
      return { error: { status: 400, message: prerequisiteError } };
    }

    contract.status = 'effective';
    contract.effective_at = new Date();
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actorId,
      reviewStage: 'post_execution',
      action: 'effective',
      previousStatus: 'executed',
      newStatus: 'effective',
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract)
    };
  }));
}

async function activateAgreementTransition({ agreementId, actorId }) {
  return observeTransition({
    transition: 'activate_agreement',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (contract.nonprofit_user_id !== actorId) {
      return { error: { status: 403, message: 'Only nonprofit owner can activate this agreement' } };
    }

    if (contract.status !== 'effective') {
      return { error: { status: 400, message: 'Only effective agreements can be activated' } };
    }

    await Contract.update(
      { is_current_version: false },
      {
        where: {
          application_id: contract.application_id,
          template_type: contract.template_type,
          id: {
            [Op.ne]: contract.id
          }
        },
        transaction
      }
    );

    contract.status = 'active';
    contract.is_current_version = true;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actorId,
      reviewStage: 'post_execution',
      action: 'activated',
      previousStatus: 'effective',
      newStatus: 'active',
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract)
    };
  }));
}

async function completeAgreementTransition({ agreementId, actorId }) {
  return observeTransition({
    transition: 'complete_agreement',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (contract.nonprofit_user_id !== actorId) {
      return { error: { status: 403, message: 'Only nonprofit owner can complete this agreement' } };
    }

    if (!COMPLETABLE_STATUSES.includes(contract.status)) {
      return { error: { status: 400, message: 'Only effective or active agreements can be completed' } };
    }

    const previousStatus = contract.status;
    contract.status = 'completed';
    contract.completed_at = new Date();
    contract.is_current_version = false;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actorId,
      reviewStage: 'post_execution',
      action: 'completed',
      previousStatus,
      newStatus: 'completed',
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract)
    };
  }));
}

async function archiveAgreementTransition({ agreementId, actor }) {
  return observeTransition({
    transition: 'archive_agreement',
    actorId: actor?.id,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    const isOwner = contract.nonprofit_user_id === actor.id;
    if (!isOwner && !isAdminReviewer(actor)) {
      return { error: { status: 403, message: 'Only the nonprofit owner or an admin can archive this agreement' } };
    }

    if (!ARCHIVABLE_STATUSES.includes(contract.status)) {
      return { error: { status: 400, message: 'Only completed, terminated, or expired agreements can be archived' } };
    }

    const previousStatus = contract.status;
    contract.status = 'archived';
    contract.archived_at = new Date();
    contract.is_current_version = false;
    await contract.save({ transaction });

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: actor.id,
      reviewStage: 'post_execution',
      action: 'archived',
      previousStatus,
      newStatus: 'archived',
      transaction
    });

    return {
      agreement: sanitizeContractResponse(contract)
    };
  }));
}

async function signAgreementTransition({ agreementId, actorId, signIp, executeArtifact }) {
  return observeTransition({
    transition: 'sign_agreement',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (!isAgreementParty(contract, actorId)) {
      return { error: { status: 403, message: 'You are not authorized to sign this agreement' } };
    }

    if (!['approved_for_signature', 'pending_signature'].includes(contract.status)) {
      return { error: { status: 400, message: 'Agreement must be approved_for_signature before signing' } };
    }

    if (['terminated', 'expired', 'archived', 'completed'].includes(contract.status)) {
      return { error: { status: 400, message: `Cannot sign a ${contract.status} agreement` } };
    }

    const now = new Date();

    if (contract.nonprofit_user_id === actorId) {
      if (contract.nonprofit_signed_at) {
        return { error: { status: 409, message: 'You have already signed this agreement' } };
      }
      contract.nonprofit_signed_at = now;
      contract.nonprofit_sign_ip = signIp;
    }

    if (contract.researcher_user_id === actorId) {
      if (contract.researcher_signed_at) {
        return { error: { status: 409, message: 'You have already signed this agreement' } };
      }
      contract.researcher_signed_at = now;
      contract.researcher_sign_ip = signIp;
    }

    const bothSigned = Boolean(contract.nonprofit_signed_at && contract.researcher_signed_at);

    if (!bothSigned) {
      contract.status = 'pending_signature';
      await contract.save({ transaction });

      return {
        transition: 'pending_signature',
        otherPartyId: contract.nonprofit_user_id === actorId
          ? contract.researcher_user_id
          : contract.nonprofit_user_id,
        agreement: sanitizeContractResponse(contract)
      };
    }

    const executedArtifact = await executeArtifact(contract);
    contract.storage_key = executedArtifact.storageKey;
    contract.checksum = executedArtifact.checksum;
    contract.executed_filename = executedArtifact.filename;
    contract.executed_mimetype = executedArtifact.mimetype;
    contract.status = 'executed';
    await contract.save({ transaction });

    return {
      transition: 'executed',
      agreement: sanitizeContractResponse(contract)
    };
  }));
}

async function updateAgreementDraftTransition({
  agreementId,
  actorId,
  nextTemplateType,
  nextTitle,
  nextSourceKind,
  nextVariables,
  nextFreeTextContent,
  nextUploadedAttachmentId,
  nextReviewRequired,
  nextContainsSensitiveData,
  nextDataClassification,
  nextRetentionPeriodDays,
  nextDestructionRequired,
  nextMetadata,
  resolveAgreementSource
}) {
  return observeTransition({
    transition: 'update_draft_agreement',
    actorId,
    agreementId
  }, async () => sequelize.transaction(async (transaction) => {
    const contract = await Contract.findByPk(agreementId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!contract) {
      return { error: { status: 404, message: 'Agreement not found' } };
    }

    if (contract.nonprofit_user_id !== actorId) {
      return { error: { status: 403, message: 'Only the agreement creator can update this agreement' } };
    }

    if (!['draft', 'changes_requested'].includes(contract.status)) {
      return { error: { status: 400, message: 'Only draft or changes-requested agreements can be updated' } };
    }

    let sourcePayload;
    try {
      sourcePayload = await resolveAgreementSource({
        sourceKind: nextSourceKind,
        templateType: nextTemplateType,
        variables: nextVariables,
        freeTextContent: nextFreeTextContent,
        uploadedAttachmentId: nextUploadedAttachmentId,
        projectId: contract.project_id,
        transaction
      });
    } catch (error) {
      return { error: { status: 400, message: error.message } };
    }

    const before = {
      source_kind: contract.source_kind,
      uploaded_attachment_id: contract.uploaded_attachment_id,
      template_type: contract.template_type,
      title: contract.title,
      variables: contract.variables,
      review_required: contract.review_required,
      contains_sensitive_data: contract.contains_sensitive_data,
      data_classification: contract.data_classification,
      retention_period_days: contract.retention_period_days,
      destruction_required: contract.destruction_required,
      metadata: contract.metadata || null
    };

    contract.source_kind = sourcePayload.sourceKind;
    contract.uploaded_attachment_id = sourcePayload.uploadedAttachmentId;
    contract.template_type = nextTemplateType;
    contract.template_version_id = `${nextTemplateType}:v1`;
    contract.title = nextTitle;
    contract.review_required = nextReviewRequired;
    contract.contains_sensitive_data = nextContainsSensitiveData;
    contract.data_classification = nextDataClassification;
    contract.retention_period_days = nextRetentionPeriodDays;
    contract.destruction_required = nextDestructionRequired;
    if (nextMetadata !== undefined) {
      contract.metadata = nextMetadata;
    }
    contract.variables = sourcePayload.variables;
    contract.rendered_content = sourcePayload.renderedContent;
    contract.content_snapshot = sourcePayload.contentSnapshot;
    await contract.save({ transaction });

    const agreement = sanitizeContractResponse(contract);
    return {
      agreement,
      before,
      after: {
        source_kind: agreement.source_kind,
        uploaded_attachment_id: agreement.uploaded_attachment_id,
        template_type: agreement.template_type,
        title: agreement.title,
        variables: agreement.variables,
        review_required: agreement.review_required,
        contains_sensitive_data: agreement.contains_sensitive_data,
        data_classification: agreement.data_classification,
        retention_period_days: agreement.retention_period_days,
        destruction_required: agreement.destruction_required,
        metadata: agreement.metadata || null
      }
    };
  }));
}

module.exports = {
  createAgreementTransition,
  submitAgreementForReviewTransition,
  reviewAgreementTransition,
  counterpartyReviewAgreementTransition,
  terminateAgreementTransition,
  createAmendmentTransition,
  makeAgreementEffectiveTransition,
  activateAgreementTransition,
  completeAgreementTransition,
  archiveAgreementTransition,
  signAgreementTransition,
  updateAgreementDraftTransition
};
