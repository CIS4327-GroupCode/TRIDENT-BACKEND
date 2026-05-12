const { Op } = require('sequelize');

const {
  MessageUploadAsset,
  MessageAttachment,
  Message,
  Thread,
  ThreadParticipant
} = require('../database/models');
const { getStorageAdapter } = require('./storage');
const { evaluateUploadSecurity } = require('./uploadSecurityService');

const MESSAGE_UPLOAD_URL_PREFIX = '/messages/uploads';

function buildMessageUploadUrl(assetId) {
  return `${MESSAGE_UPLOAD_URL_PREFIX}/${assetId}`;
}

function extractAssetId(fileUrl) {
  if (typeof fileUrl !== 'string') {
    return null;
  }

  const normalizedUrl = fileUrl.trim().replace(/\?.*$/, '').replace(/#.*$/, '');
  const match = normalizedUrl.match(/^\/(?:api\/)?messages\/uploads\/(\d+)$/i);
  if (!match) {
    return null;
  }

  const assetId = Number.parseInt(match[1], 10);
  return Number.isInteger(assetId) ? assetId : null;
}

async function createMessageUploadAsset({ user, file, route }) {
  const securityEvaluation = await evaluateUploadSecurity({
    user,
    file,
    surface: 'message_attachment',
    route,
    metadata: {
      upload_scope: 'messages'
    }
  });

  if (!securityEvaluation.accepted) {
    return securityEvaluation;
  }

  const storageAdapter = getStorageAdapter();
  const { storageKey } = await storageAdapter.save({
    storagePrefix: `messages/user-${user.id}`,
    filename: file.originalname,
    buffer: file.buffer,
    mimetype: file.mimetype
  });

  const asset = await MessageUploadAsset.create({
    uploaded_by: user.id,
    file_name: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    storage_key: storageKey,
    status: 'uploaded'
  });

  return {
    accepted: true,
    asset,
    fileUrl: buildMessageUploadUrl(asset.id)
  };
}

async function normalizeMessageAttachments({ attachments, senderId, transaction }) {
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  if (safeAttachments.length === 0) {
    return [];
  }

  const resolvedAssets = [];

  for (const attachment of safeAttachments) {
    const assetId = extractAssetId(attachment?.file_url);
    if (!assetId) {
      throw new Error('INVALID_INPUT');
    }

    const asset = await MessageUploadAsset.findOne({
      where: {
        id: assetId,
        uploaded_by: senderId,
        status: {
          [Op.in]: ['uploaded', 'attached']
        }
      },
      transaction
    });

    if (!asset) {
      throw new Error('INVALID_INPUT');
    }

    resolvedAssets.push(asset);
  }

  const uniqueAssetIds = Array.from(new Set(resolvedAssets.map((asset) => asset.id)));
  await MessageUploadAsset.update(
    { status: 'attached' },
    {
      where: { id: uniqueAssetIds },
      transaction
    }
  );

  return resolvedAssets.map((asset) => ({
    file_name: asset.file_name,
    file_url: buildMessageUploadUrl(asset.id)
  }));
}

async function getMessageUploadAssetForUser({ assetId, userId }) {
  const numericAssetId = Number.parseInt(assetId, 10);
  if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
    return null;
  }

  const asset = await MessageUploadAsset.findByPk(numericAssetId);
  if (!asset || asset.status === 'deleted') {
    return null;
  }

  if (Number(asset.uploaded_by) === Number(userId)) {
    return asset;
  }

  const authorizedAttachment = await MessageAttachment.findOne({
    where: {
      file_url: buildMessageUploadUrl(asset.id)
    },
    include: [
      {
        model: Message,
        as: 'message',
        required: true,
        include: [
          {
            model: Thread,
            as: 'thread',
            required: true,
            include: [
              {
                model: ThreadParticipant,
                as: 'participants',
                required: true,
                where: {
                  user_id: userId
                },
                attributes: []
              }
            ]
          }
        ]
      }
    ]
  });

  if (!authorizedAttachment) {
    return null;
  }

  return asset;
}

module.exports = {
  buildMessageUploadUrl,
  createMessageUploadAsset,
  extractAssetId,
  getMessageUploadAssetForUser,
  normalizeMessageAttachments
};