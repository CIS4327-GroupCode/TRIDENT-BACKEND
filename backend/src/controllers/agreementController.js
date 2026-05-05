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
const { AUDIT_ACTIONS, logAudit } = require('../utils/auditLogger');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ALLOWED_SOURCE_KINDS = ['template', 'attachment', 'free_text'];
const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
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
const DOWNLOADABLE_STATUSES = ['executed', 'effective', 'active', 'completed', 'terminated', 'expired', 'archived'];
const TERMINABLE_STATUSES = ['executed', 'effective', 'active'];
const AMENDABLE_STATUSES = ['executed', 'effective', 'active', 'completed'];

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

async function createContractReviewRecord({
  contractId,
  reviewerId,
  reviewStage,
  action,
  previousStatus,
  newStatus,
  feedback,
  changesRequested
}) {
  return ContractReview.create({
    contract_id: contractId,
    reviewer_id: reviewerId,
    review_stage: reviewStage,
    action,
    previous_status: previousStatus,
    new_status: newStatus,
    feedback: feedback || null,
    changes_requested: changesRequested || null,
    reviewed_at: new Date()
  });
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

function parsePagination(req) {
  const page = Math.max(Number.parseInt(req.query.page || DEFAULT_PAGE, 10), 1);
  const requestedLimit = Number.parseInt(req.query.limit || DEFAULT_LIMIT, 10);
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

async function resolveAcceptedApplication(applicationId) {
  const application = await Application.findByPk(applicationId);

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

async function resolveSourceAttachment(uploadedAttachmentId, projectId) {
  const attachmentId = Number.parseInt(uploadedAttachmentId, 10);
  if (!Number.isInteger(attachmentId)) {
    throw new Error('uploaded_attachment_id must be a valid attachment id');
  }

  const attachment = await Attachment.findByPk(attachmentId);
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
  projectId
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

  const attachment = await resolveSourceAttachment(uploadedAttachmentId, projectId);
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

    const appResult = await resolveAcceptedApplication(applicationId);
    if (appResult.error) {
      return res.status(appResult.error.status).json({ error: appResult.error.message });
    }

    const { application } = appResult;

    if (application.org_id !== req.user.org_id) {
      return res.status(403).json({ error: 'You are not authorized to create agreements for this application' });
    }

    const existingOpenContract = await Contract.findOne({
      where: {
        application_id: application.id,
        template_type: templateType,
        is_current_version: true,
        status: {
          [Op.in]: CONFLICTING_CURRENT_STATUSES
        }
      }
    });

    if (existingOpenContract) {
      return res.status(409).json({ error: 'A current agreement of this type already exists for this accepted application or invitation' });
    }

    let sourcePayload;
    try {
      sourcePayload = await resolveAgreementSource({
        sourceKind,
        templateType,
        variables,
        freeTextContent,
        uploadedAttachmentId,
        projectId: application.project_id
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const contract = await Contract.create({
      application_id: application.id,
      project_id: application.project_id,
      nonprofit_user_id: req.user.id,
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
      is_current_version: true
    });

    if (!contract.root_contract_id) {
      contract.root_contract_id = contract.id;
      await contract.save();
    }

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_CREATED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        application_id: application.id,
        project_id: application.project_id,
        template_type: templateType,
        source_kind: sourcePayload.sourceKind,
        review_required: reviewRequired,
        contains_sensitive_data: containsSensitiveData
      }
    });

    await notificationService.createNotification({
      userId: application.researcher_id,
      type: 'agreement_created',
      title: 'New Agreement Ready for Review',
      message: `A new ${templateType} agreement has been created for your project collaboration.`,
      link: `/agreements/${contract.id}`,
      metadata: {
        agreement_id: contract.id,
        project_id: application.project_id
      }
    });

    return res.status(201).json({
      message: 'Agreement created successfully',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Create agreement error:', error);
    return res.status(500).json({ error: 'Failed to create agreement' });
  }
}

async function listAgreements(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req);

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

    let sourcePayload;
    try {
      sourcePayload = await resolveAgreementSource({
        sourceKind: nextSourceKind,
        templateType: nextTemplateType,
        variables: nextVariables,
        freeTextContent: nextFreeTextContent,
        uploadedAttachmentId: nextUploadedAttachmentId,
        projectId: contract.project_id
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
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
      destruction_required: contract.destruction_required
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
    contract.variables = sourcePayload.variables;
    contract.rendered_content = sourcePayload.renderedContent;
    contract.content_snapshot = sourcePayload.contentSnapshot;
    await contract.save();

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_UPDATED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        before,
        after: {
          source_kind: contract.source_kind,
          uploaded_attachment_id: contract.uploaded_attachment_id,
          template_type: contract.template_type,
          title: contract.title,
          variables: contract.variables,
          review_required: contract.review_required,
          contains_sensitive_data: contract.contains_sensitive_data,
          data_classification: contract.data_classification,
          retention_period_days: contract.retention_period_days,
          destruction_required: contract.destruction_required
        }
      }
    });

    return res.json({
      message: 'Agreement updated successfully',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Update agreement error:', error);
    return res.status(500).json({ error: 'Failed to update agreement' });
  }
}

async function submitAgreementForReview(req, res) {
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
      return res.status(403).json({ error: 'Only the agreement creator can submit for review' });
    }

    if (!['draft', 'changes_requested'].includes(contract.status)) {
      return res.status(400).json({ error: 'Only draft or changes-requested agreements can be submitted for review' });
    }

    const previousStatus = contract.status;
    const nextStatus = contract.review_required ? 'internal_review' : 'counterparty_review';
    const feedback = String(req.body.feedback || '').trim();

    contract.status = nextStatus;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'submission',
      action: 'submitted',
      previousStatus,
      newStatus: nextStatus,
      feedback
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_SUBMITTED_FOR_REVIEW,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        previous_status: previousStatus,
        new_status: nextStatus
      }
    });

    if (nextStatus === 'internal_review') {
      await notifyAdminsForAgreement(contract, {
        type: 'agreement_submitted_for_review',
        title: 'Agreement Submitted For Review',
        message: `${contract.title} is awaiting internal compliance review.`
      });
    } else {
      await notificationService.createNotification({
        userId: contract.researcher_user_id,
        type: 'agreement_submitted_for_review',
        title: 'Agreement Ready For Your Review',
        message: `${contract.title} is ready for counterparty review.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id,
          project_id: contract.project_id
        }
      });
    }

    return res.json({
      message: 'Agreement submitted for review',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Submit agreement for review error:', error);
    return res.status(500).json({ error: 'Failed to submit agreement for review' });
  }
}

async function reviewAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (contract.status !== 'internal_review') {
      return res.status(400).json({ error: 'Agreement must be in internal_review status' });
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

    const previousStatus = contract.status;
    const nextStatus = action === 'approve' ? 'counterparty_review' : 'changes_requested';
    contract.status = nextStatus;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'internal_review',
      action: action === 'approve' ? 'approved' : 'changes_requested',
      previousStatus,
      newStatus: nextStatus,
      feedback,
      changesRequested
    });

    await logAudit({
      actorId: req.user.id,
      action: action === 'approve' ? AUDIT_ACTIONS.AGREEMENT_REVIEW_APPROVED : AUDIT_ACTIONS.AGREEMENT_CHANGES_REQUESTED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        previous_status: previousStatus,
        new_status: nextStatus,
        feedback,
        changes_requested: changesRequested || null
      }
    });

    await notificationService.createNotification({
      userId: contract.nonprofit_user_id,
      type: action === 'approve' ? 'agreement_review_approved' : 'agreement_changes_requested',
      title: action === 'approve' ? 'Agreement Passed Internal Review' : 'Agreement Changes Requested',
      message: action === 'approve'
        ? `${contract.title} passed internal review and is ready for counterparty review.`
        : `${contract.title} requires changes before it can move forward.`,
      link: `/agreements/${contract.id}`,
      metadata: {
        agreement_id: contract.id,
        changes_requested: changesRequested || null
      }
    });

    if (action === 'approve') {
      await notificationService.createNotification({
        userId: contract.researcher_user_id,
        type: 'agreement_review_approved',
        title: 'Agreement Ready For Counterparty Review',
        message: `${contract.title} is ready for your review.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id
        }
      });
    }

    return res.json({
      message: action === 'approve' ? 'Agreement approved for counterparty review' : 'Agreement changes requested',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Review agreement error:', error);
    return res.status(500).json({ error: 'Failed to review agreement' });
  }
}

async function counterpartyReviewAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (contract.researcher_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the counterparty researcher can review this agreement' });
    }

    if (contract.status !== 'counterparty_review') {
      return res.status(400).json({ error: 'Agreement must be in counterparty_review status' });
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

    const previousStatus = contract.status;
    const nextStatus = action === 'approve' ? 'approved_for_signature' : 'changes_requested';
    contract.status = nextStatus;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'counterparty_review',
      action: action === 'approve' ? 'counterparty_approved' : 'counterparty_changes_requested',
      previousStatus,
      newStatus: nextStatus,
      feedback,
      changesRequested
    });

    await logAudit({
      actorId: req.user.id,
      action: action === 'approve' ? AUDIT_ACTIONS.AGREEMENT_APPROVED_FOR_SIGNATURE : AUDIT_ACTIONS.AGREEMENT_CHANGES_REQUESTED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        previous_status: previousStatus,
        new_status: nextStatus,
        feedback,
        changes_requested: changesRequested || null
      }
    });

    await notificationService.createNotification({
      userId: contract.nonprofit_user_id,
      type: action === 'approve' ? 'agreement_approved_for_signature' : 'agreement_changes_requested',
      title: action === 'approve' ? 'Agreement Approved For Signature' : 'Agreement Changes Requested',
      message: action === 'approve'
        ? `${contract.title} is approved for signature.`
        : `${contract.title} needs changes before signature.`,
      link: `/agreements/${contract.id}`,
      metadata: {
        agreement_id: contract.id,
        changes_requested: changesRequested || null
      }
    });

    return res.json({
      message: action === 'approve' ? 'Agreement approved for signature' : 'Agreement changes requested',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Counterparty review agreement error:', error);
    return res.status(500).json({ error: 'Failed to review agreement' });
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

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id) && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'You are not authorized to view agreement history' });
    }

    const rootId = contract.root_contract_id || contract.id;
    const history = await Contract.findAll({
      where: {
        [Op.or]: [
          { id: rootId },
          { root_contract_id: rootId }
        ]
      },
      order: [['version_number', 'ASC'], ['created_at', 'ASC']]
    });

    return res.json({ history: history.map(sanitizeContractResponse) });
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

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id)) {
      return res.status(403).json({ error: 'You are not authorized to sign this agreement' });
    }

    if (!['approved_for_signature', 'pending_signature'].includes(contract.status)) {
      return res.status(400).json({ error: 'Agreement must be approved_for_signature before signing' });
    }

    if (['terminated', 'expired', 'archived', 'completed'].includes(contract.status)) {
      return res.status(400).json({ error: `Cannot sign a ${contract.status} agreement` });
    }

    const signIp = getRequestIp(req);
    const now = new Date();

    if (contract.nonprofit_user_id === req.user.id) {
      if (contract.nonprofit_signed_at) {
        return res.status(409).json({ error: 'You have already signed this agreement' });
      }
      contract.nonprofit_signed_at = now;
      contract.nonprofit_sign_ip = signIp;
    }

    if (contract.researcher_user_id === req.user.id) {
      if (contract.researcher_signed_at) {
        return res.status(409).json({ error: 'You have already signed this agreement' });
      }
      contract.researcher_signed_at = now;
      contract.researcher_sign_ip = signIp;
    }

    const bothSigned = Boolean(contract.nonprofit_signed_at && contract.researcher_signed_at);

    if (!bothSigned) {
      contract.status = 'pending_signature';
      await contract.save();

      const otherPartyId = contract.nonprofit_user_id === req.user.id
        ? contract.researcher_user_id
        : contract.nonprofit_user_id;

      await notificationService.createNotification({
        userId: otherPartyId,
        type: 'agreement_pending_signature',
        title: 'Agreement Needs Your Signature',
        message: `Agreement ${contract.title} has been signed by the other party and is awaiting your signature.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id,
          signer_id: req.user.id
        }
      });

      await logAudit({
        actorId: req.user.id,
        action: AUDIT_ACTIONS.AGREEMENT_PARTY_SIGNED,
        entityType: 'contract',
        entityId: contract.id,
        metadata: {
          status: contract.status
        }
      });

      return res.json({
        message: 'Agreement signed. Waiting for counterparty signature.',
        agreement: sanitizeContractResponse(contract)
      });
    }

    const generated = await buildExecutedAgreementArtifact(contract);
    const adapter = getStorageAdapter();
    const storageResult = await adapter.save({
      projectId: contract.project_id,
      filename: generated.filename,
      buffer: generated.buffer,
      mimetype: generated.mimetype
    });

    contract.storage_key = storageResult.storageKey;
    contract.checksum = generated.checksum;
    contract.executed_filename = generated.filename;
    contract.executed_mimetype = generated.mimetype;
    contract.status = 'executed';
    await contract.save();

    await notificationService.createBulkNotifications(
      [contract.nonprofit_user_id, contract.researcher_user_id],
      {
        type: 'agreement_executed',
        title: 'Agreement Executed',
        message: `Agreement ${contract.title} has been fully signed and executed.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id,
          project_id: contract.project_id
        }
      }
    );

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_EXECUTED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        storage_key: contract.storage_key,
        checksum: contract.checksum
      }
    });

    return res.json({
      message: 'Agreement fully signed and executed',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Sign agreement error:', error);
    return res.status(500).json({ error: 'Failed to sign agreement' });
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
      return res.status(409).json({ error: 'Agreement checksum verification failed' });
    }

    const safeFilename = contract.executed_filename
      || `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_') || 'agreement'}-${contract.id}.pdf`;
    res.setHeader('Content-Type', contract.executed_mimetype || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Download agreement error:', error);
    return res.status(500).json({ error: 'Failed to download agreement' });
  }
}

async function makeAgreementEffective(req, res) {
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
      return res.status(403).json({ error: 'Only nonprofit owner can mark this agreement effective' });
    }

    if (contract.status !== 'executed') {
      return res.status(400).json({ error: 'Only executed agreements can become effective' });
    }

    const prerequisiteError = ensureOperationalPrerequisites(contract);
    if (prerequisiteError) {
      return res.status(400).json({ error: prerequisiteError });
    }

    contract.status = 'effective';
    contract.effective_at = new Date();
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'post_execution',
      action: 'effective',
      previousStatus: 'executed',
      newStatus: 'effective'
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_EFFECTIVE,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        effective_at: contract.effective_at
      }
    });

    await notificationService.createNotification({
      userId: contract.researcher_user_id,
      type: 'agreement_effective',
      title: 'Agreement Effective',
      message: `Agreement ${contract.title} is now effective.`,
      link: `/agreements/${contract.id}`,
      metadata: {
        agreement_id: contract.id
      }
    });

    return res.json({ message: 'Agreement marked effective', agreement: sanitizeContractResponse(contract) });
  } catch (error) {
    console.error('Make agreement effective error:', error);
    return res.status(500).json({ error: 'Failed to mark agreement effective' });
  }
}

async function activateAgreement(req, res) {
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
      return res.status(403).json({ error: 'Only nonprofit owner can activate this agreement' });
    }

    if (contract.status !== 'effective') {
      return res.status(400).json({ error: 'Only effective agreements can be activated' });
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
        }
      }
    );

    contract.status = 'active';
    contract.is_current_version = true;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'post_execution',
      action: 'activated',
      previousStatus: 'effective',
      newStatus: 'active'
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_ACTIVATED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        status: contract.status
      }
    });

    await notificationService.createNotification({
      userId: contract.researcher_user_id,
      type: 'agreement_activated',
      title: 'Agreement Activated',
      message: `Agreement ${contract.title} is now active.`,
      link: `/agreements/${contract.id}`,
      metadata: {
        agreement_id: contract.id
      }
    });

    return res.json({ message: 'Agreement activated', agreement: sanitizeContractResponse(contract) });
  } catch (error) {
    console.error('Activate agreement error:', error);
    return res.status(500).json({ error: 'Failed to activate agreement' });
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

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id)) {
      return res.status(403).json({ error: 'You are not authorized to terminate this agreement' });
    }

    if (contract.status === 'terminated') {
      return res.status(409).json({ error: 'Agreement is already terminated' });
    }

    if (!TERMINABLE_STATUSES.includes(contract.status)) {
      return res.status(400).json({ error: 'Only executed, effective, or active agreements can be terminated' });
    }

    const previousStatus = contract.status;
    contract.status = 'terminated';
    contract.terminated_at = new Date();
    contract.terminated_by = req.user.id;
    contract.termination_reason = reason;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'post_execution',
      action: 'changes_requested',
      previousStatus,
      newStatus: 'terminated',
      feedback: reason
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_TERMINATED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        reason
      }
    });

    const otherPartyId = contract.nonprofit_user_id === req.user.id
      ? contract.researcher_user_id
      : contract.nonprofit_user_id;

    await notificationService.createNotification({
      userId: otherPartyId,
      type: 'agreement_terminated',
      title: 'Agreement Terminated',
      message: `Agreement ${contract.title} has been terminated.`,
      link: `/agreements/${contract.id}`,
      metadata: {
        agreement_id: contract.id,
        terminated_by: req.user.id
      }
    });

    return res.json({
      message: 'Agreement terminated',
      agreement: sanitizeContractResponse(contract)
    });
  } catch (error) {
    console.error('Terminate agreement error:', error);
    return res.status(500).json({ error: 'Failed to terminate agreement' });
  }
}

async function completeAgreement(req, res) {
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
      return res.status(403).json({ error: 'Only nonprofit owner can complete this agreement' });
    }

    if (!['effective', 'active'].includes(contract.status)) {
      return res.status(400).json({ error: 'Only effective or active agreements can be completed' });
    }

    const previousStatus = contract.status;
    contract.status = 'completed';
    contract.completed_at = new Date();
    contract.is_current_version = false;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'post_execution',
      action: 'completed',
      previousStatus,
      newStatus: 'completed'
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_COMPLETED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        completed_at: contract.completed_at
      }
    });

    await notificationService.createBulkNotifications(
      [contract.nonprofit_user_id, contract.researcher_user_id],
      {
        type: 'agreement_completed',
        title: 'Agreement Completed',
        message: `Agreement ${contract.title} has been marked completed.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id,
          project_id: contract.project_id
        }
      }
    );

    return res.json({ message: 'Agreement completed', agreement: sanitizeContractResponse(contract) });
  } catch (error) {
    console.error('Complete agreement error:', error);
    return res.status(500).json({ error: 'Failed to complete agreement' });
  }
}

async function archiveAgreement(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    const isOwner = contract.nonprofit_user_id === req.user.id;
    if (!isOwner && !isAdminReviewer(req.user)) {
      return res.status(403).json({ error: 'Only the nonprofit owner or an admin can archive this agreement' });
    }

    if (!['completed', 'terminated', 'expired'].includes(contract.status)) {
      return res.status(400).json({ error: 'Only completed, terminated, or expired agreements can be archived' });
    }

    const previousStatus = contract.status;
    contract.status = 'archived';
    contract.archived_at = new Date();
    contract.is_current_version = false;
    await contract.save();

    await createContractReviewRecord({
      contractId: contract.id,
      reviewerId: req.user.id,
      reviewStage: 'post_execution',
      action: 'archived',
      previousStatus,
      newStatus: 'archived'
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_ARCHIVED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        archived_at: contract.archived_at
      }
    });

    await notificationService.createBulkNotifications(
      [contract.nonprofit_user_id, contract.researcher_user_id],
      {
        type: 'agreement_archived',
        title: 'Agreement Archived',
        message: `Agreement ${contract.title} has been archived.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id,
          project_id: contract.project_id
        }
      }
    );

    return res.json({ message: 'Agreement archived', agreement: sanitizeContractResponse(contract) });
  } catch (error) {
    console.error('Archive agreement error:', error);
    return res.status(500).json({ error: 'Failed to archive agreement' });
  }
}

async function createAmendment(req, res) {
  try {
    const agreementId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement id' });
    }

    const contract = await Contract.findByPk(agreementId);
    if (!contract) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (!isAgreementParty(contract, req.user.id)) {
      return res.status(403).json({ error: 'You are not authorized to amend this agreement' });
    }

    if (!AMENDABLE_STATUSES.includes(contract.status)) {
      return res.status(400).json({ error: 'Only executed, effective, active, or completed agreements can be amended' });
    }

    const existingAmendment = await Contract.findOne({
      where: {
        supersedes_contract_id: contract.id,
        status: {
          [Op.in]: CONFLICTING_CURRENT_STATUSES
        }
      }
    });

    if (existingAmendment) {
      return res.status(409).json({ error: 'An amendment is already in progress for this agreement' });
    }

    const reason = String(req.body.reason || '').trim();

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
        amendment_initiated_by: req.user.id
      }
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_CREATED,
      entityType: 'contract',
      entityId: amendment.id,
      metadata: {
        amendment_of: contract.id,
        root_contract_id: amendment.root_contract_id,
        version_number: amendment.version_number,
        reason: reason || null
      }
    });

    const otherPartyId = contract.nonprofit_user_id === req.user.id
      ? contract.researcher_user_id
      : contract.nonprofit_user_id;

    await notificationService.createNotification({
      userId: otherPartyId,
      type: 'agreement_amendment_created',
      title: 'Agreement Amendment Drafted',
      message: `An amendment draft has been created for ${contract.title}.`,
      link: `/agreements/${amendment.id}`,
      metadata: {
        agreement_id: amendment.id,
        supersedes_contract_id: contract.id,
        project_id: contract.project_id
      }
    });

    return res.status(201).json({
      message: 'Agreement amendment created',
      agreement: sanitizeContractResponse(amendment)
    });
  } catch (error) {
    console.error('Create amendment error:', error);
    return res.status(500).json({ error: 'Failed to create agreement amendment' });
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
  adminAgreementStats
};
