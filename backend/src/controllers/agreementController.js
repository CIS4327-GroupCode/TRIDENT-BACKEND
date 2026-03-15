const { Op } = require('sequelize');
const {
  Contract,
  Application,
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
    const title = String(req.body.title || '').trim();
    const variables = req.body.variables && typeof req.body.variables === 'object'
      ? req.body.variables
      : {};

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
        status: {
          [Op.in]: ['draft', 'pending_signature', 'signed', 'active']
        }
      }
    });

    if (existingOpenContract) {
      return res.status(409).json({ error: 'An active agreement already exists for this application' });
    }

    let renderedContent;
    try {
      renderedContent = pdfService.renderTemplatePreview(templateType, variables);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const contract = await Contract.create({
      application_id: application.id,
      project_id: application.project_id,
      nonprofit_user_id: req.user.id,
      researcher_user_id: application.researcher_id,
      template_type: templateType,
      title,
      status: 'draft',
      variables,
      rendered_content: renderedContent
    });

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_CREATED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        application_id: application.id,
        project_id: application.project_id,
        template_type: templateType
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

    if (!isAgreementParty(contract, req.user.id) && req.user.role !== 'admin') {
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

    if (contract.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft agreements can be updated' });
    }

    const nextTemplateType = req.body.template_type
      ? String(req.body.template_type).trim().toUpperCase()
      : contract.template_type;
    const nextTitle = req.body.title ? String(req.body.title).trim() : contract.title;
    const nextVariables = req.body.variables && typeof req.body.variables === 'object'
      ? req.body.variables
      : contract.variables;

    if (!nextTitle) {
      return res.status(400).json({ error: 'title cannot be empty' });
    }

    let renderedContent;
    try {
      renderedContent = pdfService.renderTemplatePreview(nextTemplateType, nextVariables);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const before = {
      template_type: contract.template_type,
      title: contract.title,
      variables: contract.variables
    };

    contract.template_type = nextTemplateType;
    contract.title = nextTitle;
    contract.variables = nextVariables;
    contract.rendered_content = renderedContent;
    await contract.save();

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_UPDATED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        before,
        after: {
          template_type: contract.template_type,
          title: contract.title,
          variables: contract.variables
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

    if (['terminated', 'expired'].includes(contract.status)) {
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

    const generated = await pdfService.generatePdf(contract.template_type, contract.variables || {});
    const adapter = getStorageAdapter();
    const filename = `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_')}-${contract.id}.pdf`;
    const storageResult = await adapter.save({
      projectId: contract.project_id,
      filename,
      buffer: generated.buffer,
      mimetype: 'application/pdf'
    });

    contract.storage_key = storageResult.storageKey;
    contract.checksum = generated.checksum;
    contract.status = 'signed';
    await contract.save();

    await notificationService.createBulkNotifications(
      [contract.nonprofit_user_id, contract.researcher_user_id],
      {
        type: 'agreement_signed',
        title: 'Agreement Fully Signed',
        message: `Agreement ${contract.title} has been signed by all required parties.`,
        link: `/agreements/${contract.id}`,
        metadata: {
          agreement_id: contract.id,
          project_id: contract.project_id
        }
      }
    );

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.AGREEMENT_SIGNED,
      entityType: 'contract',
      entityId: contract.id,
      metadata: {
        storage_key: contract.storage_key,
        checksum: contract.checksum
      }
    });

    return res.json({
      message: 'Agreement fully signed',
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

    if (!isAgreementParty(contract, req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not authorized to download this agreement' });
    }

    if (!['signed', 'active'].includes(contract.status)) {
      return res.status(400).json({ error: 'Agreement can only be downloaded when signed or active' });
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
    const checksum = require('crypto').createHash('sha256').update(buffer).digest('hex');

    if (checksum !== contract.checksum) {
      return res.status(409).json({ error: 'Agreement checksum verification failed' });
    }

    const safeFilename = `${contract.title.replace(/[^a-zA-Z0-9._-]/g, '_') || 'agreement'}-${contract.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Download agreement error:', error);
    return res.status(500).json({ error: 'Failed to download agreement' });
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

    if (contract.status !== 'signed') {
      return res.status(400).json({ error: 'Only signed agreements can be activated' });
    }

    contract.status = 'active';
    await contract.save();

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

    contract.status = 'terminated';
    contract.terminated_at = new Date();
    contract.terminated_by = req.user.id;
    contract.termination_reason = reason;
    await contract.save();

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

    if (!isAgreementParty(contract, req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not authorized to view this agreement preview' });
    }

    return res.json({
      agreement_id: contract.id,
      template_type: contract.template_type,
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
      signedCount,
      activeCount,
      terminatedCount
    ] = await Promise.all([
      Contract.count(),
      Contract.count({ where: { status: 'draft' } }),
      Contract.count({ where: { status: 'pending_signature' } }),
      Contract.count({ where: { status: 'signed' } }),
      Contract.count({ where: { status: 'active' } }),
      Contract.count({ where: { status: 'terminated' } })
    ]);

    return res.json({
      total,
      by_status: {
        draft: draftCount,
        pending_signature: pendingSignatureCount,
        signed: signedCount,
        active: activeCount,
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
  signAgreement,
  downloadAgreement,
  activateAgreement,
  terminateAgreement,
  getTemplates,
  previewAgreement,
  adminListAgreements,
  adminAgreementStats
};
