const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const messageService = require('../services/messageService');
const { authenticate } = require('../middleware/auth');

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
    case 'USER_NOT_FOUND':
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

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: function (req, file, cb) {
    const safeOriginalName = file.originalname.replace(/\s+/g, '_');
    const uniqueName = `${Date.now()}-${safeOriginalName}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.use(authenticate);

// Upload a file for later message attachment
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_UPLOADED',
      });
    }

    return res.status(201).json({
      success: true,
      file_name: req.file.originalname,
      file_url: `/uploads/${req.file.filename}`,
    });
  } catch (error) {
    console.error('UPLOAD ERROR:', error);
    return res.status(500).json({
      success: false,
      error: 'UPLOAD_FAILED',
    });
  }
});

// Create or get direct thread
router.post('/threads/direct', async (req, res) => {
  try {
    const { otherUserId, isSensitive = false } = req.body;

    const result = await messageService.createDirectThread({
      creatorId: req.user.id,
      otherUserId,
      isSensitive,
    });

    return res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Create group thread
router.post('/threads/group', async (req, res) => {
  try {
    const {
      name,
      participantIds = [],
      isSensitive = false,
    } = req.body;

    const result = await messageService.createGroupThread({
      creatorId: req.user.id,
      name,
      participantIds,
      isSensitive,
    });

    return res.status(201).json({
      success: true,
      ...result,
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

// Send message
router.post('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { body, attachments = [] } = req.body;

    const result = await messageService.sendMessage({
      threadId,
      senderId: req.user.id,
      body,
      attachments,
    });

    return res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Get paginated messages in thread
router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { limit, before = null } = req.query;

    const result = await messageService.getThreadMessages({
      threadId,
      userId: req.user.id,
      limit,
      before,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Mark thread read
router.post('/threads/:threadId/read', async (req, res) => {
  try {
    const { threadId } = req.params;

    const result = await messageService.markThreadRead(
      threadId,
      req.user.id
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Get unread total
router.get('/unread', async (req, res) => {
  try {
    const result = await messageService.getUnreadTotal(req.user.id);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

module.exports = router;