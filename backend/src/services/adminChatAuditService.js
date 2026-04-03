const { Op } = require('sequelize');
const sequelize = require('../database');
const {
  Thread,
  ThreadParticipant,
  Message,
  MessageAttachment,
  User,
  AuditLog,
} = require('../database/models');
const { decryptMessage } = require('../utils/encryption');

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
    console.warn('Decrypt failed in admin audit, fallback to plain text');
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

function buildUserSearchConditions(rawQuery) {
  const availableColumns = getAvailableUserColumns();
  const q = typeof rawQuery === 'string' ? rawQuery.trim() : '';

  if (!q) return [];

  const conditions = [];

  if (availableColumns.includes('name')) {
    conditions.push({ name: { [Op.iLike]: `%${q}%` } });
  }

  if (availableColumns.includes('email')) {
    conditions.push({ email: { [Op.iLike]: `%${q}%` } });
  }

  if (availableColumns.includes('first_name')) {
    conditions.push({ first_name: { [Op.iLike]: `%${q}%` } });
  }

  if (availableColumns.includes('last_name')) {
    conditions.push({ last_name: { [Op.iLike]: `%${q}%` } });
  }

  return conditions;
}

async function getThreadParticipants(threadIds) {
  if (!threadIds.length) return [];

  return ThreadParticipant.findAll({
    where: {
      thread_id: threadIds,
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: getSelectableUserAttributes(),
      },
    ],
    order: [['thread_id', 'ASC'], ['joined_at', 'ASC']],
  });
}

async function getLastMessagesForThreads(threadIds) {
  if (!threadIds.length) return new Map();

  const rows = await Message.findAll({
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

  const map = new Map();

  for (const row of rows) {
    map.set(Number(row.thread_id), {
      id: row.id,
      sender_id: row.sender_id,
      body: safeDecrypt(row.body),
      created_at: row.created_at,
    });
  }

  return map;
}

function buildThreadDisplayName(thread, participants, currentSearchQuery = '') {
  if (thread.thread_type === 'group') {
    return thread.name || `Group #${thread.id}`;
  }

  const q = (currentSearchQuery || '').trim().toLowerCase();

  if (!participants.length) {
    return thread.name || `Direct chat #${thread.id}`;
  }

  if (q) {
    const matched = participants.find((participant) => {
      const name = (participant.name || '').toLowerCase();
      const email = (participant.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    if (matched) return matched.name;
  }

  return participants[0].name || `Direct chat #${thread.id}`;
}

async function searchAuditThreads({
  query = '',
  sensitive = 'all',
  limit = 50,
  offset = 0,
}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';

  const threadWhere = {};

  if (sensitive === 'true') {
    threadWhere.is_sensitive = true;
  } else if (sensitive === 'false') {
    threadWhere.is_sensitive = false;
  }

  let matchingThreadIdsFromUsers = [];
  let nameBasedThreadCondition = null;

  if (trimmedQuery) {
    const userConditions = buildUserSearchConditions(trimmedQuery);

    if (userConditions.length > 0) {
      const matchingUsers = await User.findAll({
        where: {
          [Op.or]: userConditions,
        },
        attributes: ['id'],
      });

      const matchingUserIds = matchingUsers.map((user) => user.id);

      if (matchingUserIds.length > 0) {
        const participantRows = await ThreadParticipant.findAll({
          where: {
            user_id: matchingUserIds,
          },
          attributes: ['thread_id'],
          group: ['thread_id'],
        });

        matchingThreadIdsFromUsers = participantRows.map((row) => row.thread_id);
      }
    }

    nameBasedThreadCondition = [
      { name: { [Op.iLike]: `%${trimmedQuery}%` } },
    ];

    if (!Number.isNaN(Number(trimmedQuery)) && trimmedQuery.trim() !== '') {
      nameBasedThreadCondition.push({ id: Number(trimmedQuery) });
    }

    const threadOr = [];

    if (matchingThreadIdsFromUsers.length > 0) {
      threadOr.push({ id: { [Op.in]: matchingThreadIdsFromUsers } });
    }

    if (nameBasedThreadCondition.length > 0) {
      threadOr.push(...nameBasedThreadCondition);
    }

    if (threadOr.length === 0) {
      return [];
    }

    threadWhere[Op.and] = [
      ...(threadWhere[Op.and] || []),
      { [Op.or]: threadOr },
    ];
  }

  const threads = await Thread.findAll({
    where: threadWhere,
    order: [['last_message_at', 'DESC'], ['created_at', 'DESC'], ['id', 'DESC']],
    limit: safeLimit,
    offset: safeOffset,
  });

  if (!threads.length) {
    return [];
  }

  const threadIds = threads.map((thread) => thread.id);
  const [participantsRows, lastMessageMap] = await Promise.all([
    getThreadParticipants(threadIds),
    getLastMessagesForThreads(threadIds),
  ]);

  const participantsByThread = new Map();

  for (const row of participantsRows) {
    const threadId = Number(row.thread_id);

    if (!participantsByThread.has(threadId)) {
      participantsByThread.set(threadId, []);
    }

    participantsByThread.get(threadId).push({
      user_id: row.user_id,
      name: getUserDisplayName(row.user),
      email: row.user?.email || '',
      role: row.user?.role || null,
      joined_at: row.joined_at,
      unread_count: row.unread_count,
    });
  }

  return threads.map((thread) => {
    const participants = participantsByThread.get(Number(thread.id)) || [];
    const displayName = buildThreadDisplayName(thread, participants, trimmedQuery);

    return {
      id: thread.id,
      thread_type: thread.thread_type,
      name: thread.name,
      display_name: displayName,
      direct_key: thread.direct_key,
      project_id: thread.project_id,
      nonprofit_id: thread.nonprofit_id,
      is_sensitive: thread.is_sensitive,
      created_by: thread.created_by,
      created_at: thread.created_at,
      last_message_at: thread.last_message_at,
      participant_count: participants.length,
      participants,
      last_message: lastMessageMap.get(Number(thread.id)) || null,
    };
  });
}

async function logSensitiveThreadAccess({ adminUserId, thread, participants }) {
  if (!thread?.is_sensitive) return;
  if (!AuditLog) return;

  await AuditLog.create({
    actor_id: adminUserId,
    action: 'ADMIN_SENSITIVE_THREAD_VIEWED',
    entity_type: 'thread',
    entity_id: thread.id,
    metadata: {
      thread_id: thread.id,
      thread_type: thread.thread_type,
      thread_name: thread.name,
      participant_ids: participants.map((participant) => participant.user_id),
      participant_names: participants.map((participant) => participant.name),
      viewed_at: new Date().toISOString(),
    },
    timestamp: new Date(),
  });
}

async function getAuditThreadMessages({
  adminUserId,
  threadId,
  limit = 50,
  before = null,
}) {
  const normalizedThreadId = Number(threadId);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const thread = await Thread.findByPk(normalizedThreadId);

  if (!thread) {
    throw new Error('THREAD_NOT_FOUND');
  }

  const participantRows = await ThreadParticipant.findAll({
    where: {
      thread_id: normalizedThreadId,
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: getSelectableUserAttributes(),
      },
    ],
    order: [['joined_at', 'ASC']],
  });

  const participants = participantRows.map((row) => ({
    user_id: row.user_id,
    name: getUserDisplayName(row.user),
    email: row.user?.email || '',
    role: row.user?.role || null,
    joined_at: row.joined_at,
    unread_count: row.unread_count,
  }));

  await logSensitiveThreadAccess({
    adminUserId,
    thread,
    participants,
  });

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
        attributes: ['id', 'message_id', 'file_name', 'file_url', 'created_at'],
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
      attachments: (message.attachments || []).map((attachment) => ({
        id: attachment.id,
        message_id: attachment.message_id,
        file_name: attachment.file_name,
        file_url: attachment.file_url,
        created_at: attachment.created_at,
      })),
    }));

  const nextCursor =
    messages.length === safeLimit
      ? messages[messages.length - 1].created_at
      : null;

  const displayName =
    thread.thread_type === 'group'
      ? thread.name || `Group #${thread.id}`
      : participants[0]?.name || thread.name || `Direct chat #${thread.id}`;

  return {
    thread: {
      id: thread.id,
      thread_type: thread.thread_type,
      name: thread.name,
      display_name: displayName,
      direct_key: thread.direct_key,
      project_id: thread.project_id,
      nonprofit_id: thread.nonprofit_id,
      is_sensitive: thread.is_sensitive,
      created_by: thread.created_by,
      created_at: thread.created_at,
      last_message_at: thread.last_message_at,
    },
    participants,
    messages: normalizedMessages,
    nextCursor,
    sensitiveAccessLogged: Boolean(thread.is_sensitive),
  };
}

module.exports = {
  searchAuditThreads,
  getAuditThreadMessages,
};