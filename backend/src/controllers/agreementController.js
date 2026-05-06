const crypto = require('crypto');
const path = require('path');
const { Op } = require('sequelize');
const {
  Contract,
  ContractReview,
  Application,
  Attachment,
  Project,
  User
} = require('../database/models');
const notificationService = require('../services/notificationService');
const pdfService = require('../services/pdfService');
const { getStorageAdapter } = require('../services/storage');
const {
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
} = require('../services/agreementWorkflowService');
const { getAgreementObservabilitySnapshot } = require('../utils/agreementObservability');
const { AUDIT_ACTIONS, logAudit } = require('../utils/auditLogger');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ALLOWED_SOURCE_KINDS = ['template', 'attachment', 'free_text'];
const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const DOWNLOADABLE_STATUSES = ['executed', 'effective', 'active', 'completed', 'terminated', 'expired', 'archived'];

function deriveAgreementErrorMetadata(status, message) {
  if (status === 409) {
    return { code: 'AGREEMENT_STATE_CONFLICT', category: 'conflict' };
  }
  if (status === 403) {
    return { code: 'AGREEMENT_PERMISSION_DENIED', category: 'permission' };
  }
  if (status === 404) {
    return { code: 'AGREEMENT_NOT_FOUND', category: 'not_found' };
  }
  if (status === 400 || status === 422) {
    const normalized = String(message || '').toLowerCase();
    const code = normalized.includes('invalid')
      ? 'AGREEMENT_INVALID_REQUEST'
      : 'AGREEMENT_VALIDATION_FAILED';
    return { code, category: 'validation' };
  }
  if (status >= 500) {
    return { code: 'AGREEMENT_INTERNAL_ERROR', category: 'server' };
  }
  return { code: 'AGREEMENT_REQUEST_FAILED', category: 'unknown' };
}

function sendAgreementError(res, status, message, metadata = {}) {
  const mapped = deriveAgreementErrorMetadata(status, message);
  return res.status(status).json({
    error: message,
    code: metadata.code || mapped.code,
    category: metadata.category || mapped.category
  });
}

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function isAgreementParty(contract, userId) {
  return contract.nonprofit_user_id === userId || contract.researcher_user_id === userId;
}

function isAdminReviewer(user) {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

function parseBooleanInput(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('retention_period_days must be a positive integer');
  }

  return parsed;
}

function normalizeDataClassification(value, containsSensitiveData) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return containsSensitiveData ? 'confidential' : 'internal';
  }

  if (!DATA_CLASSIFICATIONS.includes(normalized)) {
    throw new Error(`Unsupported data_classification. Allowed values: ${DATA_CLASSIFICATIONS.join(', ')}`);
  }

  return normalized;
}

function determineReviewRequired({ sourceKind, containsSensitiveData, explicitValue }) {
  if (explicitValue !== undefined) {
    return parseBooleanInput(explicitValue, false);
  }

  return containsSensitiveData || sourceKind === 'attachment' || sourceKind === 'free_text';
}

function ensureOperationalPrerequisites(contract) {
  if (!contract.contains_sensitive_data) {
    return null;
  }

  if (!contract.retention_period_days) {
    return 'Sensitive-data agreements require retention_period_days before becoming effective';
  }

  if (!contract.data_classification) {
    return 'Sensitive-data agreements require data_classification before becoming effective';
  }

  return null;
}

async function notifyAdminsForAgreement(contract, notification) {
  const admins = await User.findAll({
    where: {
      role: {
        [Op.in]: ['admin', 'super_admin']
      }
    },
    attributes: ['id']
  });

  const adminIds = admins.map((admin) => admin.id).filter(Boolean);
  if (!adminIds.length) {
    return;
  }

  await notificationService.createBulkNotifications(adminIds, {
    ...notification,
    link: notification.link || `/agreements/${contract.id}`
  });
}

function normalizeSourceKind(value) {
  const normalized = String(value || 'template').trim().toLowerCase();
  if (!ALLOWED_SOURCE_KINDS.includes(normalized)) {
    throw new Error(`Unsupported source_kind. Allowed values: ${ALLOWED_SOURCE_KINDS.join(', ')}`);
  }
  return normalized;
}

function buildAttachmentPreview(attachment) {
  return [
    'UPLOADED SOURCE DOCUMENT',
    '',
    `Filename: ${attachment.filename}`,
    `MIME Type: ${attachment.mimetype}`,
    `Size: ${attachment.size} bytes`,
    '',
    'This agreement uses the uploaded file as the authoritative source document.',
    'The executed artifact will be generated from the uploaded source file after both parties sign.'
  ].join('\n');
}

function parsePagination(req, options = {}) {
  const query = req.query || {};
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
  const page = Math.max(Number.parseInt(query.page || DEFAULT_PAGE, 10), 1);
  const requestedLimit = Number.parseInt(query.limit || defaultLimit, 10);
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

async function resolveAcceptedApplication(applicationId, options = {}) {
  const application = await Application.findByPk(applicationId, options);

  if (!application) {
    return { error: { status: 404, message: 'Accepted application not found' } };
  }

  if (application.status !== 'accepted') {
    return { error: { status: 400, message: 'Agreement can only be created from an accepted application' } };
  }

  if (!application.project_id || !application.org_id || !application.researcher_id) {
    return { error: { status: 400, message: 'Application is missing required project linkage' } };
  }

  return { application };
}

function sanitizeContractResponse(contract) {
  const plain = contract.toJSON();
  if (plain.variables && typeof plain.variables === 'object') {
    plain.variables = { ...plain.variables };
  }
  return plain;
}

async function resolveSourceAttachment(uploadedAttachmentId, projectId, options = {}) {
  const attachmentId = Number.parseInt(uploadedAttachmentId, 10);
  if (!Number.isInteger(attachmentId)) {
    throw new Error('uploaded_attachment_id must be a valid attachment id');
  }

  const attachment = await Attachment.findByPk(attachmentId, options);
  if (!attachment || attachment.project_id !== projectId) {
    throw new Error('Uploaded agreement source attachment was not found for this project');
  }

  if (attachment.status !== 'active') {
    throw new Error('Uploaded agreement source attachment is not available for use');
  }

  return attachment;
}

async function resolveAgreementSource({
  sourceKind,
  templateType,
  variables,
  freeTextContent,
  uploadedAttachmentId,
  projectId,
  transaction
}) {
  if (sourceKind === 'template') {
    const renderedContent = pdfService.renderTemplatePreview(templateType, variables);
    return {
      sourceKind,
      variables,
      renderedContent,
      contentSnapshot: renderedContent,
      uploadedAttachmentId: null
    };
  }

  if (sourceKind === 'free_text') {
    const normalizedContent = String(freeTextContent || '').trim();
    if (!normalizedContent) {
      throw new Error('free_text_content is required when source_kind is free_text');
    }

    return {
      sourceKind,
      variables: {},
      renderedContent: normalizedContent,
      contentSnapshot: normalizedContent,
      uploadedAttachmentId: null
    };
  }

  const attachment = await resolveSourceAttachment(uploadedAttachmentId, projectId, { transaction });
  const preview = buildAttachmentPreview(attachment);

  return {
    sourceKind,
    variables: {},
    renderedContent: preview,
    contentSnapshot: preview,
    uploadedAttachmentId: attachment.id
  };
}

async function buildExecutedAgreementArtifact(contract) {
  if (contract.source_kind === 'attachment') {
    const attachment = await resolveSourceAttachment(contract.uploaded_attachment_id, contract.project_id);
    const adapter = getStorageAdapter();
    const stream = await adapter.getReadStream(attachment.storage_key);
    const buffer = await streamToBuffer(stream);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const extension = path.extname(attachment.filename || '') || '.bin';

    return {
      buffer,
      checksum,
      filename: `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_') || 'agreement'}-${contract.id}${extension}`,
      mimetype: attachment.mimetype || 'application/octet-stream'
    };
  }

  if (contract.source_kind === 'free_text') {
    const generated = await pdfService.generatePdfFromText(contract.title, contract.content_snapshot || contract.rendered_content);
    return {
      buffer: generated.buffer,
      checksum: generated.checksum,
      filename: `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_') || 'agreement'}-${contract.id}.pdf`,
      mimetype: 'application/pdf'
    };
  }

  const generated = await pdfService.generatePdf(contract.template_type, contract.variables || {});
  return {
    buffer: generated.buffer,
    checksum: generated.checksum,
    filename: `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_') || 'agreement'}-${contract.id}.pdf`,
    mimetype: 'application/pdf'
  };
}

async function createAgreement(req, res) {
  try {
    if (req.user.role !== 'nonprofit') {
      return res.status(403).json({ error: 'Only nonprofit users can create agreements' });
    }

    const applicationId = Number.parseInt(req.body.application_id, 10);
    if (!Number.isInteger(applicationId)) {
      return res.status(400).json({ error: 'Invalid application_id' });
    }

    const templateType = String(req.body.template_type || '').trim().toUpperCase();
    const sourceKind = normalizeSourceKind(req.body.source_kind);
    const title = String(req.body.title || '').trim();
    const variables = req.body.variables && typeof req.body.variables === 'object'
      ? req.body.variables
      : {};
    const freeTextContent = req.body.free_text_content;
    const uploadedAttachmentId = req.body.uploaded_attachment_id;
    const containsSensitiveData = parseBooleanInput(req.body.contains_sensitive_data, false);
    const reviewRequired = determineReviewRequired({
      sourceKind,
      containsSensitiveData,
      explicitValue: req.body.review_required
    });
    const dataClassification = normalizeDataClassification(req.body.data_classification, containsSensitiveData);
    const retentionPeriodDays = parseOptionalPositiveInt(req.body.retention_period_days);
    const destructionRequired = parseBooleanInput(req.body.destruction_required, containsSensitiveData);

    if (!templateType || !title) {
      return res.status(400).json({ error: 'template_type and title are required' });
    }

    const result = await createAgreementTransition({
      applicationId,
      actorUser: req.user,
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
      resolveAcceptedApplication,
      resolveAgreementSource
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_CREATED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        application_id: result.applicationId,
        project_id: result.projectId,
        template_type: result.templateType,
        source_kind: result.agreement.source_kind,
        review_required: reviewRequired,
        contains_sensitive_data: containsSensitiveData
      }
    });

    await notificationService.createNotification({
      userId: result.agreement.researcher_user_id,
      type: 'agreement_created',
      title: 'New Agreement Ready for Review',
      message: `A new ${result.templateType} agreement has been created for your project collaboration.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id,
        project_id: result.projectId
      }
    });

    return res.status(201).json({
      message: 'Agreement created successfully',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Create agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to create agreement');
  }
}

async function listAgreements(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 100 });

    const where = {
      [Op.or]: [
        { nonprofit_user_id: req.user.id },
        { researcher_user_id: req.user.id }
      ]
    };

    if (req.query.status) {
      where.status = String(req.query.status).trim();
    }

    if (req.query.template_type) {
      where.template_type = String(req.query.template_type).trim().toUpperCase();
    }

    if (req.query.project_id) {
      const projectId = Number.parseInt(req.query.project_id, 10);
      if (!Number.isInteger(projectId)) {
        return res.status(400).json({ error: 'Invalid project_id filter' });
      }
      where.project_id = projectId;
    }

    const { count, rows } = await Contract.findAndCountAll({
      where,
      order: [['updated_at', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title', 'status']
        },
        {
          model: Attachment,
          as: 'sourceAttachment',
          attributes: ['id', 'filename', 'mimetype', 'size', 'status']
        },
        {
          model: User,
          as: 'nonprofitUser',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'researcherUser',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    return res.json({
      page,
      limit,
      total: count,
      agreements: rows.map(sanitizeContractResponse)
    });
  } catch (error) {
    console.error('List agreements error:', error);
    return res.status(500).json({ error: 'Failed to list agreements' });
  }
}

async function getAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title', 'status', 'org_id']
        },
        {
          model: Attachment,
          as: 'sourceAttachment',
          attributes: ['id', 'filename', 'mimetype', 'size', 'status']
        },
        {
          model: User,
          as: 'nonprofitUser',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'researcherUser',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id) && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'You are not authorized to view this agreement' });
    }

    return res.json({ agreement: sanitizeContractResponse(contract) });
  } catch (error) {
    console.error('Get agreement error:', error);
    return res.status(500).json({ error: 'Failed to retrieve agreement' });
  }
}

async function updateAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (contract.nonprofit_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the agreement creator can update this agreement' });
    }

    if (!['draft', 'changes_requested'].includes(contract.status)) {
      return res.status(400).json({ error: 'Only draft or changes-requested agreements can be updated' });
    }

    const nextTemplateType = req.body.template_type
      ? String(req.body.template_type).trim().toUpperCase()
      : contract.template_type;
    const nextTitle = req.body.title ? String(req.body.title).trim() : contract.title;
    const nextSourceKind = req.body.source_kind ? normalizeSourceKind(req.body.source_kind) : contract.source_kind;
    const nextVariables = req.body.variables && typeof req.body.variables === 'object'
      ? req.body.variables
      : contract.variables;
    const nextFreeTextContent = req.body.free_text_content !== undefined
      ? req.body.free_text_content
      : contract.source_kind === 'free_text'
        ? contract.content_snapshot
        : '';
    const nextUploadedAttachmentId = req.body.uploaded_attachment_id !== undefined
      ? req.body.uploaded_attachment_id
      : contract.uploaded_attachment_id;
    const nextContainsSensitiveData = req.body.contains_sensitive_data !== undefined
      ? parseBooleanInput(req.body.contains_sensitive_data, false)
      : contract.contains_sensitive_data;
    const nextReviewRequired = req.body.review_required !== undefined
      ? parseBooleanInput(req.body.review_required, false)
      : determineReviewRequired({
        sourceKind: nextSourceKind,
        containsSensitiveData: nextContainsSensitiveData,
        explicitValue: contract.review_required
      });
    let nextRetentionPeriodDays;
    try {
      nextRetentionPeriodDays = req.body.retention_period_days !== undefined
        ? parseOptionalPositiveInt(req.body.retention_period_days)
        : contract.retention_period_days;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    let nextDataClassification;
    try {
      nextDataClassification = normalizeDataClassification(req.body.data_classification || contract.data_classification, nextContainsSensitiveData);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const nextDestructionRequired = req.body.destruction_required !== undefined
      ? parseBooleanInput(req.body.destruction_required, false)
      : contract.destruction_required;

    if (!nextTitle) {
      return res.status(400).json({ error: 'title cannot be empty' });
    }

    const result = await updateAgreementDraftTransition({
      agreementId,
      actorId: req.user.id,
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
      resolveAgreementSource
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_UPDATED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        before: result.before,
        after: result.after
      }
    });

    return res.json({
      message: 'Agreement updated successfully',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Update agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to update agreement');
  }
}

async function submitAgreementForReview(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }
    const feedback = String(req.body.feedback || '').trim();

    const result = await submitAgreementForReviewTransition({
      agreementId,
      actorId: req.user.id,
      feedback
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_SUBMITTED_FOR_REVIEW,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        previous_status: result.previousStatus,
        new_status: result.nextStatus
      }
    });

    if (result.nextStatus === 'internal_review') {
      await notifyAdminsForAgreement(result.agreement, {
        type: 'agreement_submitted_for_review',
        title: 'Agreement Submitted For Review',
        message: `${result.agreement.title} is awaiting internal compliance review.`
      });
    } else {
      await notificationService.createNotification({
        userId: result.agreement.researcher_user_id,
        type: 'agreement_submitted_for_review',
        title: 'Agreement Ready For Your Review',
        message: `${result.agreement.title} is ready for counterparty review.`,
        link: `/agreements/${result.agreement.id}`,
        metadata: {
          agreement_id: result.agreement.id,
          project_id: result.agreement.project_id
        }
      });
    }

    return res.json({
      message: 'Agreement submitted for review',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Submit agreement for review error:', error);
    return sendAgreementError(res, 500, 'Failed to submit agreement for review');
  }
}

async function reviewAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const action = String(req.body.action || '').trim().toLowerCase();
    const feedback = String(req.body.feedback || '').trim();
    const changesRequested = String(req.body.changes_requested || '').trim();
    if (!['approve', 'changes_requested'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or changes_requested' });
    }

    if (action === 'changes_requested' && !changesRequested) {
      return res.status(400).json({ error: 'changes_requested is required when requesting changes' });
    }

    const result = await reviewAgreementTransition({
      agreementId,
      actor: req.user,
      action,
      feedback,
      changesRequested
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: action === 'approve' ? AUDIT_ACTIONS.AGREEMENT_REVIEW_APPROVED : AUDIT_ACTIONS.AGREEMENT_CHANGES_REQUESTED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        previous_status: result.previousStatus,
        new_status: result.nextStatus,
        feedback,
        changes_requested: changesRequested || null
      }
    });

    await notificationService.createNotification({
      userId: result.agreement.nonprofit_user_id,
      type: action === 'approve' ? 'agreement_review_approved' : 'agreement_changes_requested',
      title: action === 'approve' ? 'Agreement Passed Internal Review' : 'Agreement Changes Requested',
      message: action === 'approve'
        ? `${result.agreement.title} passed internal review and is ready for counterparty review.`
        : `${result.agreement.title} requires changes before it can move forward.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id,
        changes_requested: changesRequested || null
      }
    });

    if (action === 'approve') {
      await notificationService.createNotification({
        userId: result.agreement.researcher_user_id,
        type: 'agreement_review_approved',
        title: 'Agreement Ready For Counterparty Review',
        message: `${result.agreement.title} is ready for your review.`,
        link: `/agreements/${result.agreement.id}`,
        metadata: {
          agreement_id: result.agreement.id
        }
      });
    }

    return res.json({
      message: action === 'approve' ? 'Agreement approved for counterparty review' : 'Agreement changes requested',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Review agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to review agreement');
  }
}

async function counterpartyReviewAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const action = String(req.body.action || '').trim().toLowerCase();
    const feedback = String(req.body.feedback || '').trim();
    const changesRequested = String(req.body.changes_requested || '').trim();
    if (!['approve', 'changes_requested'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or changes_requested' });
    }

    if (action === 'changes_requested' && !changesRequested) {
      return res.status(400).json({ error: 'changes_requested is required when requesting changes' });
    }

    const result = await counterpartyReviewAgreementTransition({
      agreementId,
      actorId: req.user.id,
      action,
      feedback,
      changesRequested
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: action === 'approve' ? AUDIT_ACTIONS.AGREEMENT_APPROVED_FOR_SIGNATURE : AUDIT_ACTIONS.AGREEMENT_CHANGES_REQUESTED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        previous_status: result.previousStatus,
        new_status: result.nextStatus,
        feedback,
        changes_requested: changesRequested || null
      }
    });

    await notificationService.createNotification({
      userId: result.agreement.nonprofit_user_id,
      type: action === 'approve' ? 'agreement_approved_for_signature' : 'agreement_changes_requested',
      title: action === 'approve' ? 'Agreement Approved For Signature' : 'Agreement Changes Requested',
      message: action === 'approve'
        ? `${result.agreement.title} is approved for signature.`
        : `${result.agreement.title} needs changes before signature.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id,
        changes_requested: changesRequested || null
      }
    });

    return res.json({
      message: action === 'approve' ? 'Agreement approved for signature' : 'Agreement changes requested',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Counterparty review agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to review agreement');
  }
}

async function listAgreementReviews(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id) && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'You are not authorized to view agreement reviews' });
    }

    const reviews = await ContractReview.findAll({
      where: { contract_id: agreementId },
      order: [['created_at', 'ASC']],
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    return res.json({ reviews: reviews.map((review) => review.toSafeObject()) });
  } catch (error) {
    console.error('List agreement reviews error:', error);
    return res.status(500).json({ error: 'Failed to list agreement reviews' });
  }
}

async function listAgreementHistory(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const { page, limit, offset } = parsePagination(req, { defaultLimit: 100 });

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id) && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'You are not authorized to view agreement history' });
    }

    const rootId = contract.root_contract_id || contract.id;
    const { count, rows } = await Contract.findAndCountAll({
      where: {
        [Op.or]: [
          { id: rootId },
          { root_contract_id: rootId }
        ]
      },
      order: [['version_number', 'ASC'], ['created_at', 'ASC']],
      limit,
      offset
    });

    return res.json({
      page,
      limit,
      total: count,
      history: rows.map(sanitizeContractResponse)
    });
  } catch (error) {
    console.error('List agreement history error:', error);
    return res.status(500).json({ error: 'Failed to list agreement history' });
  }
}

async function signAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }
    const signIp = getRequestIp(req);
    const result = await signAgreementTransition({
      agreementId,
      actorId: req.user.id,
      signIp,
      executeArtifact: async (contract) => {
        const generated = await buildExecutedAgreementArtifact(contract);
        const adapter = getStorageAdapter();
        const storageResult = await adapter.save({
          projectId: contract.project_id,
          filename: generated.filename,
          buffer: generated.buffer,
          mimetype: generated.mimetype
        });

        return {
          storageKey: storageResult.storageKey,
          checksum: generated.checksum,
          filename: generated.filename,
          mimetype: generated.mimetype
        };
      }
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    if (result.transition === 'pending_signature') {
      await notificationService.createNotification({
        userId: result.otherPartyId,
        type: 'agreement_pending_signature',
        title: 'Agreement Needs Your Signature',
        message: `Agreement ${result.agreement.title} has been signed by the other party and is awaiting your signature.`,
        link: `/agreements/${result.agreement.id}`,
        metadata: {
          agreement_id: result.agreement.id,
          signer_id: req.user.id
        }
      });

      await logAudit({
        actorId: req.user.id,
        action: AUDIT_ACTIONS.AGREEMENT_PARTY_SIGNED,
        entityType: 'contract',
        entityId: result.agreement.id,
        metadata: {
          status: result.agreement.status
        }
      });

      return res.json({
        message: 'Agreement signed. Waiting for counterparty signature.',
        agreement: result.agreement
      });
    }

    await notificationService.createBulkNotifications(
      [result.agreement.nonprofit_user_id, result.agreement.researcher_user_id],
      {
        type: 'agreement_executed',
        title: 'Agreement Executed',
        message: `Agreement ${result.agreement.title} has been fully signed and executed.`,
        link: `/agreements/${result.agreement.id}`,
        metadata: {
          agreement_id: result.agreement.id,
          project_id: result.agreement.project_id
        }
      }
    );

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_EXECUTED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        storage_key: result.agreement.storage_key,
        checksum: result.agreement.checksum
      }
    });

    return res.json({
      message: 'Agreement fully signed and executed',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Sign agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to sign agreement');
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id) && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'You are not authorized to download this agreement' });
    }

    if (!DOWNLOADABLE_STATUSES.includes(contract.status)) {
      return res.status(400).json({ error: 'Agreement can only be downloaded after execution' });
    }

    if (!contract.storage_key || !contract.checksum) {
      return res.status(404).json({ error: 'Signed agreement document is unavailable' });
    }

    const adapter = getStorageAdapter();
    const exists = await adapter.exists(contract.storage_key);
    if (!exists) {
      return res.status(404).json({ error: 'Agreement document not found in storage' });
    }

    const stream = await adapter.getReadStream(contract.storage_key);
    const buffer = await streamToBuffer(stream);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    if (checksum !== contract.checksum) {
      return sendAgreementError(res, 409, 'Agreement checksum verification failed');
    }

    const safeFilename = contract.executed_filename
      || `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_') || 'agreement'}-${contract.id}.pdf`;
    res.setHeader('Content-Type', contract.executed_mimetype || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Download agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to download agreement');
  }
}

async function makeAgreementEffective(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const result = await makeAgreementEffectiveTransition({
      agreementId,
      actorId: req.user.id,
      validateOperationalPrerequisites: ensureOperationalPrerequisites
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_EFFECTIVE,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        effective_at: result.agreement.effective_at
      }
    });

    await notificationService.createNotification({
      userId: result.agreement.researcher_user_id,
      type: 'agreement_effective',
      title: 'Agreement Effective',
      message: `Agreement ${result.agreement.title} is now effective.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id
      }
    });

    return res.json({ message: 'Agreement marked effective', agreement: result.agreement });
  } catch (error) {
    console.error('Make agreement effective error:', error);
    return sendAgreementError(res, 500, 'Failed to mark agreement effective');
  }
}

async function activateAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const result = await activateAgreementTransition({
      agreementId,
      actorId: req.user.id
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_ACTIVATED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        status: result.agreement.status
      }
    });

    await notificationService.createNotification({
      userId: result.agreement.researcher_user_id,
      type: 'agreement_activated',
      title: 'Agreement Activated',
      message: `Agreement ${result.agreement.title} is now active.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id
      }
    });

    return res.json({ message: 'Agreement activated', agreement: result.agreement });
  } catch (error) {
    console.error('Activate agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to activate agreement');
  }
}

async function terminateAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Termination reason is required' });
    }

    const result = await terminateAgreementTransition({
      agreementId,
      actorId: req.user.id,
      reason
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_TERMINATED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        reason
      }
    });

    await notificationService.createNotification({
      userId: result.otherPartyId,
      type: 'agreement_terminated',
      title: 'Agreement Terminated',
      message: `Agreement ${result.agreement.title} has been terminated.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id,
        terminated_by: req.user.id
      }
    });

    return res.json({
      message: 'Agreement terminated',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Terminate agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to terminate agreement');
  }
}

async function completeAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const result = await completeAgreementTransition({
      agreementId,
      actorId: req.user.id
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_COMPLETED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        completed_at: result.agreement.completed_at
      }
    });

    await notificationService.createBulkNotifications(
      [result.agreement.nonprofit_user_id, result.agreement.researcher_user_id],
      {
        type: 'agreement_completed',
        title: 'Agreement Completed',
        message: `Agreement ${result.agreement.title} has been marked completed.`,
        link: `/agreements/${result.agreement.id}`,
        metadata: {
          agreement_id: result.agreement.id,
          project_id: result.agreement.project_id
        }
      }
    );

    return res.json({ message: 'Agreement completed', agreement: result.agreement });
  } catch (error) {
    console.error('Complete agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to complete agreement');
  }
}

async function archiveAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const result = await archiveAgreementTransition({
      agreementId,
      actor: req.user
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_ARCHIVED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        archived_at: result.agreement.archived_at
      }
    });

    await notificationService.createBulkNotifications(
      [result.agreement.nonprofit_user_id, result.agreement.researcher_user_id],
      {
        type: 'agreement_archived',
        title: 'Agreement Archived',
        message: `Agreement ${result.agreement.title} has been archived.`,
        link: `/agreements/${result.agreement.id}`,
        metadata: {
          agreement_id: result.agreement.id,
          project_id: result.agreement.project_id
        }
      }
    );

    return res.json({ message: 'Agreement archived', agreement: result.agreement });
  } catch (error) {
    console.error('Archive agreement error:', error);
    return sendAgreementError(res, 500, 'Failed to archive agreement');
  }
}

async function createAmendment(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }
    const reason = String(req.body.reason || '').trim();

    const result = await createAmendmentTransition({
      agreementId,
      actorId: req.user.id,
      reason
    });

    if (result.error) {
      return sendAgreementError(res, result.error.status, result.error.message);
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_CREATED,
      entityType: 'contract',
      entityId: result.agreement.id,
      metadata: {
        amendment_of: result.supersededAgreementId,
        root_contract_id: result.agreement.root_contract_id,
        version_number: result.agreement.version_number,
        reason: reason || null
      }
    });

    await notificationService.createNotification({
      userId: result.otherPartyId,
      type: 'agreement_amendment_created',
      title: 'Agreement Amendment Drafted',
      message: `An amendment draft has been created for ${result.agreement.title}.`,
      link: `/agreements/${result.agreement.id}`,
      metadata: {
        agreement_id: result.agreement.id,
        supersedes_contract_id: result.supersededAgreementId,
        project_id: result.agreement.project_id
      }
    });

    return res.status(201).json({
      message: 'Agreement amendment created',
      agreement: result.agreement
    });
  } catch (error) {
    console.error('Create amendment error:', error);
    return sendAgreementError(res, 500, 'Failed to create agreement amendment');
  }
}

async function getTemplates(req, res) {
  try {
    return res.json({ templates: pdfService.getAvailableTemplates() });
  } catch (error) {
    console.error('Get templates error:', error);
    return res.status(500).json({ error: 'Failed to load agreement templates' });
  }
}

async function previewAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id) && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'You are not authorized to view this agreement preview' });
    }

    return res.json({
      agreement_id: contract.id,
      template_type: contract.template_type,
      source_kind: contract.source_kind,
      preview: contract.rendered_content
    });
  } catch (error) {
    console.error('Preview agreement error:', error);
    return res.status(500).json({ error: 'Failed to generate agreement preview' });
  }
}

async function adminListAgreements(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req);

    const where = {};
    if (req.query.status) {
      where.status = String(req.query.status).trim();
    }
    if (req.query.template_type) {
      where.template_type = String(req.query.template_type).trim().toUpperCase();
    }

    const { count, rows } = await Contract.findAndCountAll({
      where,
      order: [['updated_at', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title', 'status']
        },
        {
          model: Attachment,
          as: 'sourceAttachment',
          attributes: ['id', 'filename', 'mimetype', 'size', 'status']
        },
        {
          model: User,
          as: 'nonprofitUser',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'researcherUser',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    return res.json({
      page,
      limit,
      total: count,
      agreements: rows.map(sanitizeContractResponse)
    });
  } catch (error) {
    console.error('Admin list agreements error:', error);
    return res.status(500).json({ error: 'Failed to list agreements' });
  }
}

async function adminAgreementStats(req, res) {
  try {
    const [
      total,
      draftCount,
      pendingSignatureCount,
      executedCount,
      effectiveCount,
      activeCount,
      completedCount,
      terminatedCount
    ] = await Promise.all([
      Contract.count(),
      Contract.count({ where: { status: 'draft' } }),
      Contract.count({ where: { status: 'pending_signature' } }),
      Contract.count({ where: { status: 'executed' } }),
      Contract.count({ where: { status: 'effective' } }),
      Contract.count({ where: { status: 'active' } }),
      Contract.count({ where: { status: 'completed' } }),
      Contract.count({ where: { status: 'terminated' } })
    ]);

    return res.json({
      total,
      by_status: {
        draft: draftCount,
        pending_signature: pendingSignatureCount,
        executed: executedCount,
        effective: effectiveCount,
        active: activeCount,
        completed: completedCount,
        terminated: terminatedCount
      }
    });
  } catch (error) {
    console.error('Admin agreement stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch agreement stats' });
  }
}

async function adminAgreementObservability(req, res) {
  try {
    return res.json(getAgreementObservabilitySnapshot());
  } catch (error) {
    console.error('Admin agreement observability error:', error);
    return res.status(500).json({ error: 'Failed to fetch agreement observability snapshot' });
  }
}

module.exports = {
  createAgreement,
  listAgreements,
  getAgreement,
  updateAgreement,
  submitAgreementForReview,
  reviewAgreement,
  counterpartyReviewAgreement,
  listAgreementReviews,
  listAgreementHistory,
  signAgreement,
  downloadAgreement,
  makeAgreementEffective,
  activateAgreement,
  completeAgreement,
  archiveAgreement,
  terminateAgreement,
  createAmendment,
  getTemplates,
  previewAgreement,
  adminListAgreements,
  adminAgreementStats,
  adminAgreementObservability
};
