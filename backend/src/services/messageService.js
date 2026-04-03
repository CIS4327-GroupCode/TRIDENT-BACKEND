const { Op } = require('sequelize');
const sequelize = require('../database');
const {
  Thread,
  ThreadParticipant,
  Message,
  MessageAttachment,
  User,
} = require('../database/models');
const { encryptMessage, decryptMessage } = require('../utils/encryption');

function buildDirectKey(userId1, userId2) {
  const [a, b] = [Number(userId1), Number(userId2)].sort((x, y) => x - y);
  return `${a}:${b}`;
}

async function isUserInThread(threadId, userId) {
  const membership = await ThreadParticipant.findOne({
    where: {
      thread_id: Number(threadId),
      user_id: Number(userId),
    },
  });

  return !!membership;
}

async function getOrCreateDirectThread(currentUserId, otherUserId, options = {}) {
  const userA = Number(currentUserId);
  const userB = Number(otherUserId);

  if (!userA || !userB) {
    throw new Error('INVALID_USER_IDS');
  }

  if (userA === userB) {
    throw new Error('CANNOT_MESSAGE_SELF');
  }

  const directKey = buildDirectKey(userA, userB);

  let thread = await Thread.findOne({
    where: {
      thread_type: 'direct',
      direct_key: directKey,
    },
  });

  if (thread) {
    return thread;
  }

  return sequelize.transaction(async (transaction) => {
    thread = await Thread.create(
      {
        thread_type: 'direct',
        direct_key: directKey,
        name: null,
        is_sensitive: !!options.isSensitive,
        created_by: userA,
      },
      { transaction }
    );

    await ThreadParticipant.bulkCreate(
      [
        {
          thread_id: thread.id,
          user_id: userA,
          unread_count: 0,
        },
        {
          thread_id: thread.id,
          user_id: userB,
          unread_count: 0,
        },
      ],
      { transaction }
    );

    return thread;
  });
}

async function createGroupThread({
  creatorId,
  participantIds = [],
  name = null,
  projectId = null,
  nonprofitId = null,
  isSensitive = false,
}) {
  const creator = Number(creatorId);

  if (!creator) {
    throw new Error('CREATOR_ID_REQUIRED');
  }

  const uniqueParticipantIds = [
    ...new Set([creator, ...participantIds.map(Number).filter(Boolean)]),
  ];

  if (uniqueParticipantIds.length < 2) {
    throw new Error('GROUP_NEEDS_AT_LEAST_2_PARTICIPANTS');
  }

  return sequelize.transaction(async (transaction) => {
    const thread = await Thread.create(
      {
        thread_type: 'group',
        direct_key: null,
        project_id: projectId,
        nonprofit_id: nonprofitId,
        name,
        is_sensitive: !!isSensitive,
        created_by: creator,
      },
      { transaction }
    );

    await ThreadParticipant.bulkCreate(
      uniqueParticipantIds.map((userId) => ({
        thread_id: thread.id,
        user_id: userId,
        unread_count: 0,
      })),
      { transaction }
    );

    return thread;
  });
}

async function addParticipantToThread({ actorId, threadId, userIdToAdd }) {
  const normalizedActorId = Number(actorId);
  const normalizedThreadId = Number(threadId);
  const normalizedUserIdToAdd = Number(userIdToAdd);

  if (!normalizedActorId || !normalizedThreadId || !normalizedUserIdToAdd) {
    throw new Error('INVALID_INPUT');
  }

  const thread = await Thread.findByPk(normalizedThreadId);

  if (!thread) {
    throw new Error('THREAD_NOT_FOUND');
  }

  const actorIsParticipant = await isUserInThread(normalizedThreadId, normalizedActorId);

  if (!actorIsParticipant) {
    throw new Error('NOT_THREAD_MEMBER');
  }

  if (thread.thread_type !== 'group') {
    throw new Error('ONLY_GROUP_THREADS_CAN_ADD_PARTICIPANTS');
  }

  const existing = await ThreadParticipant.findOne({
    where: {
      thread_id: normalizedThreadId,
      user_id: normalizedUserIdToAdd,
    },
  });

  if (existing) {
    throw new Error('PARTICIPANT_ALREADY_EXISTS');
  }

  return ThreadParticipant.create({
    thread_id: normalizedThreadId,
    user_id: normalizedUserIdToAdd,
    unread_count: 0,
  });
}

async function sendMessage({ threadId, senderId, body, attachments = [] }) {
  const normalizedThreadId = Number(threadId);
  const normalizedSenderId = Number(senderId);
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  if (!normalizedThreadId || !normalizedSenderId) {
    throw new Error('INVALID_THREAD_OR_SENDER');
  }

  const trimmedBody = body ? body.trim() : '';

  if (!trimmedBody && safeAttachments.length === 0) {
    throw new Error('MESSAGE_OR_ATTACHMENT_REQUIRED');
  }

  if (!process.env.MSG_SECRET) {
    throw new Error('MSG_SECRET_MISSING');
  }

  const thread = await Thread.findByPk(normalizedThreadId);

  if (!thread) {
    throw new Error('THREAD_NOT_FOUND');
  }

  const senderIsParticipant = await isUserInThread(normalizedThreadId, normalizedSenderId);

  if (!senderIsParticipant) {
    throw new Error('NOT_THREAD_MEMBER');
  }

  const encryptedBody = trimmedBody
    ? encryptMessage(trimmedBody, process.env.MSG_SECRET)
    : '';

  return sequelize.transaction(async (transaction) => {
    const message = await Message.create(
      {
        thread_id: normalizedThreadId,
        sender_id: normalizedSenderId,
        body: encryptedBody,
      },
      { transaction }
    );

    let createdAttachments = [];

    if (safeAttachments.length > 0) {
      createdAttachments = await MessageAttachment.bulkCreate(
        safeAttachments.map((file) => ({
          message_id: message.id,
          file_name: file.file_name,
          storage_key: file.storage_key,
          file_url: file.file_url || null,
          mime_type: file.mime_type || null,
          file_size: file.file_size || null,
        })),
        { transaction }
      );
    }

    await ThreadParticipant.increment(
      { unread_count: 1 },
      {
        where: {
          thread_id: normalizedThreadId,
          user_id: { [Op.ne]: normalizedSenderId },
        },
        transaction,
      }
    );

    await ThreadParticipant.update(
      {
        last_read_message_id: message.id,
      },
      {
        where: {
          thread_id: normalizedThreadId,
          user_id: normalizedSenderId,
        },
        transaction,
      }
    );

    return {
      id: message.id,
      thread_id: message.thread_id,
      sender_id: message.sender_id,
      body: trimmedBody,
      created_at: message.created_at,
      attachments: createdAttachments.map((file) => ({
        id: file.id,
        message_id: file.message_id,
        file_name: file.file_name,
        storage_key: file.storage_key,
        file_url: file.file_url,
        mime_type: file.mime_type,
        file_size: file.file_size,
        uploaded_at: file.uploaded_at,
      })),
    };
  });
}

async function getThreadMessages({ threadId, userId, limit = 50 }) {
  const normalizedThreadId = Number(threadId);
  const normalizedUserId = Number(userId);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const thread = await Thread.findByPk(normalizedThreadId);

  if (!thread) {
    throw new Error('THREAD_NOT_FOUND');
  }

  const allowed = await isUserInThread(normalizedThreadId, normalizedUserId);

  if (!allowed) {
    throw new Error('NOT_THREAD_MEMBER');
  }

  if (!process.env.MSG_SECRET) {
    throw new Error('MSG_SECRET_MISSING');
  }

  const messages = await Message.findAll({
    where: { thread_id: normalizedThreadId },
    include: [
      {
        model: User,
        as: 'sender',
        attributes: ['id', 'email', 'role'],
      },
      {
        model: MessageAttachment,
        as: 'attachments',
        attributes: [
          'id',
          'message_id',
          'file_name',
          'storage_key',
          'file_url',
          'mime_type',
          'file_size',
          'uploaded_at',
        ],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
  });

  return messages.reverse().map((message) => ({
    id: message.id,
    thread_id: message.thread_id,
    sender_id: message.sender_id,
    body: message.body ? decryptMessage(message.body, process.env.MSG_SECRET) : '',
    created_at: message.created_at,
    sender: message.sender,
    attachments: message.attachments || [],
  }));
}

async function markThreadRead({ threadId, userId }) {
  const normalizedThreadId = Number(threadId);
  const normalizedUserId = Number(userId);

  const thread = await Thread.findByPk(normalizedThreadId);

  if (!thread) {
    throw new Error('THREAD_NOT_FOUND');
  }

  const membership = await ThreadParticipant.findOne({
    where: {
      thread_id: normalizedThreadId,
      user_id: normalizedUserId,
    },
  });

  if (!membership) {
    throw new Error('NOT_THREAD_MEMBER');
  }

  const latestMessage = await Message.findOne({
    where: { thread_id: normalizedThreadId },
    order: [['id', 'DESC']],
  });

  membership.unread_count = 0;
  membership.last_read_message_id = latestMessage ? latestMessage.id : null;
  await membership.save();

  return membership;
}

async function getUnreadTotal(userId) {
  const total = await ThreadParticipant.sum('unread_count', {
    where: {
      user_id: Number(userId),
    },
  });

  return total || 0;
}

async function getUserThreads(userId) {
  const normalizedUserId = Number(userId);

  const memberships = await ThreadParticipant.findAll({
    where: { user_id: normalizedUserId },
    include: [
      {
        model: Thread,
        as: 'thread',
      },
    ],
    order: [['joined_at', 'DESC']],
  });

  const threadsWithDetails = await Promise.all(
    memberships.map(async (membership) => {
      const lastMessage = await Message.findOne({
        where: { thread_id: membership.thread.id },
        order: [['created_at', 'DESC']],
      });

      let lastMessagePreview = null;

      if (lastMessage && process.env.MSG_SECRET) {
        try {
          lastMessagePreview = decryptMessage(lastMessage.body, process.env.MSG_SECRET);
        } catch (err) {
          lastMessagePreview = '[Unable to decrypt message preview]';
        }
      }

      return {
        id: membership.thread.id,
        thread_type: membership.thread.thread_type,
        name: membership.thread.name,
        project_id: membership.thread.project_id,
        nonprofit_id: membership.thread.nonprofit_id,
        is_sensitive: membership.thread.is_sensitive,
        unread_count: membership.unread_count,
        last_read_message_id: membership.last_read_message_id,
        joined_at: membership.joined_at,
        last_message: lastMessage
          ? {
              id: lastMessage.id,
              sender_id: lastMessage.sender_id,
              body: lastMessagePreview,
              created_at: lastMessage.created_at,
            }
          : null,
      };
    })
  );

  return threadsWithDetails;
}

module.exports = {
  buildDirectKey,
  isUserInThread,
  getOrCreateDirectThread,
  createGroupThread,
  addParticipantToThread,
  sendMessage,
  getThreadMessages,
  markThreadRead,
  getUnreadTotal,
  getUserThreads,
};