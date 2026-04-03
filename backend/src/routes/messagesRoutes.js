const express = require('express');
const router = express.Router();


const messageService = require('../services/messageService');
const { authenticate } = require('../middleware/auth'); // adjust if your export is different

function handleServiceError(res, error) {
  console.error(error);

  switch (error.message) {
    case 'INVALID_USER_IDS':
    case 'CANNOT_MESSAGE_SELF':
    case 'CREATOR_ID_REQUIRED':
    case 'GROUP_NEEDS_AT_LEAST_2_PARTICIPANTS':
    case 'INVALID_INPUT':
    case 'INVALID_THREAD_OR_SENDER':
    case 'MESSAGE_OR_ATTACHMENT_REQUIRED':
    case 'ONLY_GROUP_THREADS_CAN_ADD_PARTICIPANTS':
      return res.status(400).json({
        success: false,
        error: error.message,
      });

    case 'NOT_THREAD_MEMBER':
      return res.status(403).json({
        success: false,
        error: error.message,
      });

    case 'THREAD_NOT_FOUND':
      return res.status(404).json({
        success: false,
        error: error.message,
      });

    case 'PARTICIPANT_ALREADY_EXISTS':
      return res.status(409).json({
        success: false,
        error: error.message,
      });

    case 'MSG_SECRET_MISSING':
      return res.status(500).json({
        success: false,
        error: error.message,
      });

    default:
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
      });
  }
}

router.use(authenticate);

// Create or get direct thread
router.post('/threads/direct', async (req, res) => {
  try {
    const { otherUserId, isSensitive } = req.body;

    const thread = await messageService.getOrCreateDirectThread(
      req.user.id,
      otherUserId,
      { isSensitive }
    );

    return res.status(200).json({
      success: true,
      thread,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Create group thread
router.post('/threads/group', async (req, res) => {
  try {
    const { participantIds, name, projectId, nonprofitId, isSensitive } = req.body;

    const thread = await messageService.createGroupThread({
      creatorId: req.user.id,
      participantIds,
      name,
      projectId,
      nonprofitId,
      isSensitive,
    });

    return res.status(201).json({
      success: true,
      thread,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Get all threads for current user
router.get('/threads', async (req, res) => {
  try {
    const threads = await messageService.getUserThreads(req.user.id);

    return res.status(200).json({
      success: true,
      threads,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Add participant to group thread
router.post('/threads/:threadId/participants', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { userIdToAdd } = req.body;

    const participant = await messageService.addParticipantToThread({
      actorId: req.user.id,
      threadId,
      userIdToAdd,
    });

    return res.status(201).json({
      success: true,
      participant,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Send message
router.post('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { body, attachments } = req.body;

    const message = await messageService.sendMessage({
      threadId,
      senderId: req.user.id,
      body,
      attachments,
    });

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Get messages in thread
router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { limit } = req.query;

    const messages = await messageService.getThreadMessages({
      threadId,
      userId: req.user.id,
      limit,
    });

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Mark thread read
router.post('/threads/:threadId/read', async (req, res) => {
  try {
    const { threadId } = req.params;

    const membership = await messageService.markThreadRead({
      threadId,
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      membership,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Get unread total
router.get('/unread', async (req, res) => {
  try {
    const unreadTotal = await messageService.getUnreadTotal(req.user.id);

    return res.status(200).json({
      success: true,
      unreadTotal,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

module.exports = router;