const multer = require('multer');
const { Op } = require('sequelize');
const {
  Attachment,
  Project,
  Application,
  Match,
  User,
  Milestone,
  sequelize
} = require('../database/models');
const { getStorageAdapter } = require('../services/storage');
const { scanAttachment } = require('../services/scanService');
const {
  canResearcherAccessMilestone,
  getResearcherMilestoneAccess
} = require('../services/milestoneAccessService');

const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg'
];

const maxFileSizeBytes = Number.parseInt(process.env.ATTACHMENT_MAX_FILE_SIZE || '', 10) || 5 * 1024 * 1024;
const signedUrlDownloadExpiresInSeconds = Number.parseInt(process.env.ATTACHMENT_SIGNED_URL_EXPIRES_IN || '', 10) || 300;
const useSignedUrlDownloads = String(process.env.ATTACHMENT_USE_SIGNED_URL_DOWNLOADS || '').toLowerCase() === 'true';
const retentionDays = Number.parseInt(process.env.ATTACHMENT_RETENTION_DAYS || '', 10) || 30;
const allowedMimeTypes = (process.env.ATTACHMENT_ALLOWED_MIME_TYPES || DEFAULT_ALLOWED_MIME_TYPES.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

async function getNextVersion(projectId, filename, milestoneId = null, useMilestoneScope = false) {
  const where = {
    project_id: projectId,
    filename
  };

  if (useMilestoneScope) {
    where.milestone_id = milestoneId;
  }

  const latest = await Attachment.findOne({
    where,
    order: [['version', 'DESC']]
  });

  return latest ? latest.version + 1 : 1;
}

let attachmentFeatureCache = null;

async function getAttachmentFeatureSupport() {
  if (attachmentFeatureCache) {
    return attachmentFeatureCache;
  }

  try {
    const table = await sequelize.getQueryInterface().describeTable('project_attachments');
    attachmentFeatureCache = {
      versioning: Boolean(table.version && table.is_latest),
      scanColumns: Boolean(table.scan_status && table.scanned_at && table.quarantine_reason),
      retention: Boolean(table.retention_expires_at),
      milestoneScope: Boolean(table.milestone_id)
    };
  } catch (error) {
    attachmentFeatureCache = {
      versioning: false,
      scanColumns: false,
      retention: false,
      milestoneScope: false
    };
  }

  return attachmentFeatureCache;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeBytes
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    return cb(null, true);
  }
});

const attachmentUploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File exceeds size limit of ${maxFileSizeBytes} bytes` });
    }

    if (error.message === 'Unsupported file type') {
      return res.status(400).json({ error: `Unsupported file type. Allowed types: ${allowedMimeTypes.join(', ')}` });
    }

    return res.status(400).json({ error: 'Invalid upload request' });
  });
};

async function getProject(projectId) {
  return Project.findByPk(projectId);
}

async function canNonprofitAccessProject(user, project) {
  if (!user || user.role !== 'nonprofit') {
    return false;
  }
  return project.org_id === user.org_id;
}

async function canResearcherAccessProject(user, projectId) {
  if (!user || user.role !== 'researcher') {
    return false;
  }

  const [application, match] = await Promise.all([
    Application.findOne({
      where: {
        researcher_id: user.id,
        project_id: projectId,
        status: {
          [Op.in]: ['pending', 'accepted']
        }
      }
    }),
    Match.findOne({
      where: {
        researcher_id: user.id,
        brief_id: projectId
      }
    })
  ]);

  return Boolean(application || match);
}

async function getMilestoneForProject(projectId, milestoneId) {
  return Milestone.findOne({
    where: {
      id: milestoneId,
      project_id: projectId
    }
  });
}

async function getAssignedMilestoneIdsForResearcher(userId, projectId) {
  try {
    const access = await getResearcherMilestoneAccess({
      researcherId: userId,
      projectId
    });
    return access.milestoneIds;
  } catch (error) {
    console.warn('Assigned milestone lookup failed:', error.message);
    return [];
  }
}

function parseOptionalMilestoneId(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { milestoneId: null };
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: 'milestone_id must be a valid positive integer' };
  }

  return { milestoneId: parsed };
}

async function getAuthorizedProjectForRead(req, res, options = {}) {
  const { milestoneId = null, featureSupport = null } = options;
  const projectId = Number.parseInt(req.params.projectId, 10);
  if (!Number.isInteger(projectId)) {
    res.status(400).json({ error: 'Invalid project id' });
    return null;
  }

  const project = await getProject(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }

  const nonprofitAccess = await canNonprofitAccessProject(req.user, project);
  const researcherAccess = await canResearcherAccessProject(req.user, projectId);
  if (req.user.role === 'researcher' && milestoneId !== null) {
    if (!featureSupport?.milestoneScope) {
      res.status(400).json({ error: 'Milestone-scoped attachments are not enabled yet' });
      return null;
    }

    const milestone = await getMilestoneForProject(projectId, milestoneId);
    if (!milestone) {
      res.status(404).json({ error: 'Milestone not found' });
      return null;
    }

    const researcherMilestoneAccess = await canResearcherAccessMilestone({
      researcherId: req.user.id,
      projectId,
      milestoneId
    });
    if (!researcherMilestoneAccess) {
      res.status(403).json({ error: 'Unauthorized for milestone access' });
      return null;
    }
  }

  if (!nonprofitAccess && !researcherAccess) {
    res.status(403).json({ error: 'Unauthorized' });
    return null;
  }

  return project;
}

async function getAuthorizedProjectForWrite(req, res, options = {}) {
  const { milestoneId = null, featureSupport = null } = options;
  const projectId = Number.parseInt(req.params.projectId, 10);
  if (!Number.isInteger(projectId)) {
    res.status(400).json({ error: 'Invalid project id' });
    return null;
  }

  const project = await getProject(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }

  const nonprofitAccess = await canNonprofitAccessProject(req.user, project);
  if (nonprofitAccess) {
    if (milestoneId !== null) {
      if (!featureSupport?.milestoneScope) {
        res.status(400).json({ error: 'Milestone-scoped attachments are not enabled yet' });
        return null;
      }

      const milestone = await getMilestoneForProject(projectId, milestoneId);
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return null;
      }
    }

    return project;
  }

  if (req.user?.role === 'researcher') {
    if (milestoneId === null) {
      res.status(403).json({ error: 'Researchers can only upload files to assigned milestones' });
      return null;
    }

    if (!featureSupport?.milestoneScope) {
      res.status(400).json({ error: 'Milestone-scoped attachments are not enabled yet' });
      return null;
    }

    const milestone = await getMilestoneForProject(projectId, milestoneId);
    if (!milestone) {
      res.status(404).json({ error: 'Milestone not found' });
      return null;
    }

    const researcherMilestoneAccess = await canResearcherAccessMilestone({
      researcherId: req.user.id,
      projectId,
      milestoneId
    });
    if (!researcherMilestoneAccess) {
      res.status(403).json({ error: 'Unauthorized for milestone uploads' });
      return null;
    }

    return project;
  }

  res.status(403).json({ error: 'Unauthorized' });
  return null;
}

const uploadAttachment = async (req, res) => {
  try {
    const storageAdapter = getStorageAdapter();
    const featureSupport = await getAttachmentFeatureSupport();
    const milestoneScopeInput = req.body?.milestone_id ?? req.query?.milestone_id;
    const milestoneParsing = parseOptionalMilestoneId(milestoneScopeInput);
    if (milestoneParsing.error) {
      return res.status(400).json({ error: milestoneParsing.error });
    }

    const milestoneId = milestoneParsing.milestoneId;

    const project = await getAuthorizedProjectForWrite(req, res, { milestoneId, featureSupport });
    if (!project) {
      return;
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const nextVersion = featureSupport.versioning
      ? await getNextVersion(project.project_id, req.file.originalname, milestoneId, featureSupport.milestoneScope)
      : 1;

    const scanResult = await scanAttachment({
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      buffer: req.file.buffer
    });

    const scanStatus = scanResult.clean ? 'clean' : (scanResult.scanStatus || 'infected');
    const finalStatus = scanResult.clean ? 'active' : 'quarantined';

    const { storageKey } = await storageAdapter.save({
      projectId: project.project_id,
      filename: req.file.originalname,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype
    });

    const attachmentPayload = {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      storage_key: storageKey,
      project_id: project.project_id,
      uploaded_by: req.user.id,
      status: finalStatus
    };

    if (featureSupport.milestoneScope) {
      attachmentPayload.milestone_id = milestoneId;
    }

    if (featureSupport.versioning) {
      attachmentPayload.version = nextVersion;
      attachmentPayload.is_latest = true;
    }

    if (featureSupport.scanColumns) {
      attachmentPayload.scan_status = scanStatus;
      attachmentPayload.scanned_at = new Date();
      attachmentPayload.quarantine_reason = scanResult.reason || null;
    }

    const attachment = await Attachment.create(attachmentPayload);

    if (featureSupport.versioning) {
      const versionWhere = {
        project_id: project.project_id,
        filename: req.file.originalname,
        id: {
          [Op.ne]: attachment.id
        }
      };

      if (featureSupport.milestoneScope) {
        versionWhere.milestone_id = milestoneId;
      }

      await Attachment.update(
        { is_latest: false },
        {
          where: versionWhere
        }
      );
    }

    if (finalStatus === 'quarantined') {
      return res.status(422).json({
        error: 'Attachment failed malware/security scan and was quarantined',
        reason: scanResult.reason || 'Suspicious file detected',
        attachment: attachment.toSafeObject()
      });
    }

    return res.status(201).json({ attachment: attachment.toSafeObject() });
  } catch (error) {
    console.error('Upload attachment error:', error);
    return res.status(500).json({ error: 'Failed to upload attachment' });
  }
};

const listProjectAttachments = async (req, res) => {
  try {
    const featureSupport = await getAttachmentFeatureSupport();
    const milestoneParsing = parseOptionalMilestoneId(req.query?.milestone_id);
    if (milestoneParsing.error) {
      return res.status(400).json({ error: milestoneParsing.error });
    }

    const milestoneId = milestoneParsing.milestoneId;

    const project = await getAuthorizedProjectForRead(req, res, { milestoneId, featureSupport });
    if (!project) {
      return;
    }

    const includeAllVersions = String(req.query.includeAllVersions || '').toLowerCase() === 'true';

    const where = {
      project_id: project.project_id,
      status: 'active'
    };

    if (featureSupport.milestoneScope && milestoneId !== null) {
      where.milestone_id = milestoneId;
    }

    if (featureSupport.milestoneScope && req.user.role === 'researcher' && milestoneId === null) {
      const assignedMilestoneIds = await getAssignedMilestoneIdsForResearcher(req.user.id, project.project_id);
      where[Op.or] = [
        { milestone_id: null },
        { milestone_id: { [Op.in]: assignedMilestoneIds.length > 0 ? assignedMilestoneIds : [-1] } }
      ];
    }

    if (!includeAllVersions && featureSupport.versioning) {
      where.is_latest = true;
    }

    const attachments = await Attachment.findAll({
      where,
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({ attachments: attachments.map((item) => item.toSafeObject()) });
  } catch (error) {
    console.error('List attachments error:', error);
    return res.status(500).json({ error: 'Failed to list attachments' });
  }
};

const deleteAttachment = async (req, res) => {
  try {
    const featureSupport = await getAttachmentFeatureSupport();
    const project = await getAuthorizedProjectForWrite(req, res, { featureSupport });
    if (!project) {
      return;
    }

    const attachmentId = Number.parseInt(req.params.attachmentId, 10);
    if (!Number.isInteger(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachment id' });
    }

    const attachment = await Attachment.findOne({
      where: {
        id: attachmentId,
        project_id: project.project_id,
        status: {
          [Op.in]: ['active', 'quarantined']
        }
      }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    attachment.status = 'deleted';
    if (featureSupport.versioning) {
      attachment.is_latest = false;
    }
    if (featureSupport.retention) {
      attachment.retention_expires_at = new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000));
    }
    await attachment.save();

    if (featureSupport.versioning) {
      const previousVersionWhere = {
        project_id: project.project_id,
        filename: attachment.filename,
        status: 'active'
      };

      if (featureSupport.milestoneScope) {
        previousVersionWhere.milestone_id = attachment.milestone_id || null;
      }

      const previousVersion = await Attachment.findOne({
        where: previousVersionWhere,
        order: [['version', 'DESC']]
      });

      if (previousVersion) {
        previousVersion.is_latest = true;
        await previousVersion.save();
      }
    }

    return res.status(200).json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Delete attachment error:', error);
    return res.status(500).json({ error: 'Failed to delete attachment' });
  }
};

const downloadAttachment = async (req, res) => {
  try {
    const featureSupport = await getAttachmentFeatureSupport();
    const project = await getAuthorizedProjectForRead(req, res, { featureSupport });
    if (!project) {
      return;
    }

    const attachmentId = Number.parseInt(req.params.attachmentId, 10);
    if (!Number.isInteger(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachment id' });
    }

    const attachment = await Attachment.findOne({
      where: {
        id: attachmentId,
        project_id: project.project_id,
        status: 'active'
      }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (
      featureSupport.milestoneScope
      && req.user.role === 'researcher'
      && attachment.milestone_id !== null
    ) {
      const researcherMilestoneAccess = await canResearcherAccessMilestone({
        researcherId: req.user.id,
        projectId: project.project_id,
        milestoneId: attachment.milestone_id
      });

      if (!researcherMilestoneAccess) {
        return res.status(403).json({ error: 'Unauthorized for milestone access' });
      }
    }

    const storageAdapter = getStorageAdapter();

    if (useSignedUrlDownloads && typeof storageAdapter.getSignedUrl === 'function') {
      try {
        const signedUrl = await storageAdapter.getSignedUrl({
          storageKey: attachment.storage_key,
          expiresInSeconds: signedUrlDownloadExpiresInSeconds
        });

        if (signedUrl) {
          return res.redirect(signedUrl);
        }
      } catch (signedUrlError) {
        console.warn('Signed URL download failed, falling back to stream:', signedUrlError.message);
      }
    }

    const stream = await storageAdapter.getReadStream(attachment.storage_key);

    res.setHeader('Content-Type', attachment.mimetype);
    res.setHeader('Content-Length', attachment.size.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);

    return stream.pipe(res);
  } catch (error) {
    console.error('Download attachment error:', error);
    return res.status(500).json({ error: 'Failed to download attachment' });
  }
};

module.exports = {
  attachmentUploadMiddleware,
  uploadAttachment,
  listProjectAttachments,
  deleteAttachment,
  downloadAttachment
};