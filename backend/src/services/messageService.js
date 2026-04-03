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

function safeDecrypt(body) {
  if (!process.env.MSG_SECRET) {
    throw new Error('MSG_SECRET_MISSING');
  }

  if (typeof body !== 'string' || body.trim() === '') {
    return '';
  }

  try {
    return decryptMessage(body, process.env.MSG_SECRET);
  } catch (err) {
    console.warn('Decrypt failed, fallback to plain text');
    return body;
  }
}

function getAvailableUserColumns() {
  try {
    const attributes = User.getAttributes ? User.getAttributes() : User.rawAttributes || {};
    return Object.keys(attributes);
  } catch (err) {
    return [];
  }
}

function getSelectableUserAttributes() {
  const availableColumns = getAvailableUserColumns();
  const selected = ['id'];

  for (const column of ['name', 'email', 'role', 'first_name', 'last_name']) {
    if (availableColumns.includes(column)) {
      selected.push(column);
    }
  }

  return selected;
}

function getUserDisplayName(user) {
  if (!user) return 'Unknown User';

  const firstName = typeof user.first_name === 'string' ? user.first_name.trim() : '';
  const lastName = typeof user.last_name === 'string' ? user.last_name.trim() : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  if (typeof user.name === 'string' && user.name.trim()) return user.name.trim();
  if (fullName) return fullName;
  if (typeof user.email === 'string' && user.email.trim()) return user.email.trim();

  return `User #${user.id}`;
}

async function isUserInThread(threadId, userId) {
  const normalizedThreadId = Number(threadId);
  const normalizedUserId = Number(userId);

  if (!normalizedThreadId || !normalizedUserId) {
    return false;
  }

  const participant = await ThreadParticipant.findOne({
    where: {
      thread_id: normalizedThreadId,
      user_id: normalizedUserId,
    },
  });

  return !!participant;
}

async function getOrCreateDirectThread({ userAId, userBId, isSensitive = false }) {
  const normalizedUserAId = Number(userAId);
  const normalizedUserBId = Number(userBId);

  if (!normalizedUserAId || !normalizedUserBId) {
    throw new Error('INVALID_USER_IDS');
  }

  if (normalizedUserAId === normalizedUserBId) {
    throw new Error('CANNOT_MESSAGE_SELF');
  }

  const sortedIds = [normalizedUserAId, normalizedUserBId].sort((a, b) => a - b);
  const directKey = `${sortedIds[0]}:${sortedIds[1]}`;

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
        created_by: normalizedUserAId,
        is_sensitive: Boolean(isSensitive),
        last_message_at: null,
      },
      { transaction }
    );

    await ThreadParticipant.bulkCreate(
      [
        {
          thread_id: thread.id,
          user_id: normalizedUserAId,
          unread_count: 0,
          last_read_message_id: null,
          joined_at: new Date(),
        },
        {
          thread_id: thread.id,
          user_id: normalizedUserBId,
          unread_count: 0,
          last_read_message_id: null,
          joined_at: new Date(),
        },
      ],
      { transaction }
    );

    return thread;
  });
}

async function createDirectThread({ creatorId, otherUserId, isSensitive = false }) {
  const normalizedCreatorId = Number(creatorId);
  const normalizedOtherUserId = Number(otherUserId);

  if (!normalizedCreatorId || !normalizedOtherUserId) {
    throw new Error('INVALID_USER_IDS');
  }

  const otherUser = await User.findByPk(normalizedOtherUserId, {
    attributes: getSelectableUserAttributes(),
  });

  if (!otherUser) {
    throw new Error('USER_NOT_FOUND');
  }

  const thread = await getOrCreateDirectThread({
    userAId: normalizedCreatorId,
    userBId: normalizedOtherUserId,
    isSensitive,
  });

  return {
    thread: {
      id: thread.id,
      thread_type: thread.thread_type,
      name: thread.name,
      display_name: getUserDisplayName(otherUser),
      project_id: thread.project_id,
      nonprofit_id: thread.nonprofit_id,
      is_sensitive: thread.is_sensitive,
      last_message_at: thread.last_message_at,
    },
  };
}

async function createGroupThread({ creatorId, name, participantIds = [], isSensitive = false }) {
  const normalizedCreatorId = Number(creatorId);
  const safeName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedCreatorId) {
    throw new Error('CREATOR_ID_REQUIRED');
  }

  const normalizedParticipantIds = Array.from(
    new Set(
      (Array.isArray(participantIds) ? participantIds : [])
        .map((id) => Number(id))
        .filter(Boolean)
        .filter((id) => id !== normalizedCreatorId)
    )
  );

  if (normalizedParticipantIds.length < 2) {
    throw new Error('GROUP_NEEDS_AT_LEAST_2_PARTICIPANTS');
  }

  const foundUsers = await User.findAll({
    where: {
      id: normalizedParticipantIds,
    },
    attributes: ['id'],
  });

  if (foundUsers.length !== normalizedParticipantIds.length) {
    throw new Error('USER_NOT_FOUND');
  }

  return sequelize.transaction(async (transaction) => {
    const thread = await Thread.create(
      {
        thread_type: 'group',
        direct_key: null,
        name: safeName || null,
        created_by: normalizedCreatorId,
        is_sensitive: Boolean(isSensitive),
        last_message_at: null,
      },
      { transaction }
    );

    const allParticipantIds = [normalizedCreatorId, ...normalizedParticipantIds];

    await ThreadParticipant.bulkCreate(
      allParticipantIds.map((userId) => ({
        thread_id: thread.id,
        user_id: userId,
        unread_count: 0,
        last_read_message_id: null,
        joined_at: new Date(),
      })),
      { transaction }
    );

    return {
      thread: {
        id: thread.id,
        thread_type: thread.thread_type,
        name: thread.name,
        display_name: thread.name || `Group #${thread.id}`,
        project_id: thread.project_id,
        nonprofit_id: thread.nonprofit_id,
        is_sensitive: thread.is_sensitive,
        last_message_at: thread.last_message_at,
      },
    };
  });
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
    order: [[{ model: Thread, as: 'thread' }, 'last_message_at', 'DESC']],
  });

  if (memberships.length === 0) {
    return [];
  }

  const threadIds = memberships.map((membership) => membership.thread.id);

  const lastMessages = await Message.findAll({
    where: {
      thread_id: threadIds,
      id: {
        [Op.in]: sequelize.literal(`
          (
            SELECT MAX(m2.id)
            FROM messages m2
            WHERE m2.thread_id = "Message".thread_id
          )
        `),
      },
    },
    order: [['created_at', 'DESC']],
  });

  const lastMessageMap = new Map();

  for (const msg of lastMessages) {
    lastMessageMap.set(msg.thread_id, {
      id: msg.id,
      sender_id: msg.sender_id,
      body: safeDecrypt(msg.body),
      created_at: msg.created_at,
    });
  }

  const directThreadIds = memberships
    .filter((membership) => membership.thread.thread_type === 'direct')
    .map((membership) => membership.thread.id);

  const participantRows = directThreadIds.length > 0
    ? await ThreadParticipant.findAll({
        where: {
          thread_id: directThreadIds,
        },
        attributes: ['thread_id', 'user_id'],
      })
    : [];

  const directOtherUserIds = Array.from(
    new Set(
      participantRows
        .filter((row) => Number(row.user_id) !== normalizedUserId)
        .map((row) => Number(row.user_id))
    )
  );

  const otherUsers = directOtherUserIds.length > 0
    ? await User.findAll({
        where: {
          id: directOtherUserIds,
        },
        attributes: getSelectableUserAttributes(),
      })
    : [];

  const userMap = new Map();
  for (const user of otherUsers) {
    userMap.set(Number(user.id), getUserDisplayName(user));
  }

  const directDisplayNameMap = new Map();
  for (const row of participantRows) {
    const threadId = Number(row.thread_id);
    const participantUserId = Number(row.user_id);

    if (participantUserId === normalizedUserId) continue;

    if (!directDisplayNameMap.has(threadId)) {
      directDisplayNameMap.set(
        threadId,
        userMap.get(participantUserId) || `User #${participantUserId}`
      );
    }
  }

  return memberships.map((membership) => {
    const thread = membership.thread;
    const isDirect = thread.thread_type === 'direct';

    const displayName = isDirect
      ? directDisplayNameMap.get(thread.id) || thread.name || `Direct chat #${thread.id}`
      : thread.name || `Group #${thread.id}`;

    return {
      id: thread.id,
      thread_type: thread.thread_type,
      name: thread.name,
      display_name: displayName,
      project_id: thread.project_id,
      nonprofit_id: thread.nonprofit_id,
      is_sensitive: thread.is_sensitive,
      unread_count: membership.unread_count,
      last_read_message_id: membership.last_read_message_id,
      joined_at: membership.joined_at,
      last_message_at: thread.last_message_at,
      last_message: lastMessageMap.get(thread.id) || null,
    };
  });
}

async function getThreadMessages({ threadId, userId, limit = 50, before = null }) {
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

  const where = {
    thread_id: normalizedThreadId,
  };

  if (before) {
    where.created_at = {
      [Op.lt]: new Date(before),
    };
  }

  const messages = await Message.findAll({
    where,
    include: [
      {
        model: User,
        as: 'sender',
        attributes: getSelectableUserAttributes(),
      },
      {
        model: MessageAttachment,
        as: 'attachments',
        attributes: [
          'id',
          'message_id',
          'file_name',
          'file_url',
          'created_at',
        ],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
  });

  const normalizedMessages = messages
    .slice()
    .reverse()
    .map((message) => ({
      id: message.id,
      thread_id: message.thread_id,
      sender_id: message.sender_id,
      body: safeDecrypt(message.body),
      created_at: message.created_at,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: getUserDisplayName(message.sender),
            email: message.sender.email || '',
            role: message.sender.role || null,
          }
        : null,
      attachments: message.attachments || [],
    }));

  const nextCursor =
    messages.length === safeLimit
      ? messages[messages.length - 1].created_at
      : null;

  return {
    messages: normalizedMessages,
    nextCursor,
  };
}

async function sendMessage({ threadId, senderId, body, attachments = [] }) {
  const normalizedThreadId = Number(threadId);
  const normalizedSenderId = Number(senderId);
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  if (!normalizedThreadId || !normalizedSenderId) {
    throw new Error('INVALID_THREAD_OR_SENDER');
  }

  const trimmedBody = typeof body === 'string' ? body.trim() : '';

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
    const createdMessage = await Message.create(
      {
        thread_id: normalizedThreadId,
        sender_id: normalizedSenderId,
        body: encryptedBody,
      },
      { transaction }
    );

    await Thread.update(
      { last_message_at: createdMessage.created_at },
      {
        where: { id: normalizedThreadId },
        transaction,
      }
    );

    let createdAttachments = [];

    if (safeAttachments.length > 0) {
      createdAttachments = await MessageAttachment.bulkCreate(
        safeAttachments.map((file) => ({
          message_id: createdMessage.id,
          file_name: file.file_name,
          file_url: file.file_url || null,
        })),
        {
          transaction,
          returning: true,
        }
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
        last_read_message_id: createdMessage.id,
        unread_count: 0,
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
      message: {
        id: createdMessage.id,
        thread_id: createdMessage.thread_id,
        sender_id: createdMessage.sender_id,
        body: trimmedBody,
        created_at: createdMessage.created_at,
        attachments: createdAttachments.map((file) => ({
          id: file.id,
          message_id: file.message_id,
          file_name: file.file_name,
          file_url: file.file_url,
          created_at: file.created_at,
        })),
      },
    };
  });
}

async function markThreadRead(threadId, userId) {
  const normalizedThreadId = Number(threadId);
  const normalizedUserId = Number(userId);

  const allowed = await isUserInThread(normalizedThreadId, normalizedUserId);

  if (!allowed) {
    throw new Error('NOT_THREAD_MEMBER');
  }

  const latestMessage = await Message.findOne({
    where: { thread_id: normalizedThreadId },
    order: [['created_at', 'DESC']],
  });

  await ThreadParticipant.update(
    {
      unread_count: 0,
      last_read_message_id: latestMessage ? latestMessage.id : null,
    },
    {
      where: {
        thread_id: normalizedThreadId,
        user_id: normalizedUserId,
      },
    }
  );

  return { success: true };
}

async function getUnreadTotal(userId) {
  const normalizedUserId = Number(userId);

  const total = await ThreadParticipant.sum('unread_count', {
    where: { user_id: normalizedUserId },
  });

  return {
    unreadTotal: total || 0,
  };
}

module.exports = {
  isUserInThread,
  getOrCreateDirectThread,
  createDirectThread,
  createGroupThread,
  getUserThreads,
  getThreadMessages,
  sendMessage,
  markThreadRead,
  getUnreadTotal,
};