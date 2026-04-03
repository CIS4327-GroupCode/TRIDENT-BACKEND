const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const messageService = require('../services/messageService');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function handleServiceError(res, error) {
  console.error(error);

  switch (error.message) {
    case 'INVALID_USER_IDS':
    case 'CANNOT_MESSAGE_SELF':
    case 'CREATOR_ID_REQUIRED':
    case 'GROUP_NEEDS_AT_LEAST_2_PARTICIPANTS':
    case 'INVALID_INPUT':
    case 'INVALID_PAGINATION':
    case 'INVALID_THREAD_OR_SENDER':
    case 'MESSAGE_OR_ATTACHMENT_REQUIRED':
    case 'MESSAGE_BODY_TOO_LONG':
    case 'FILE_TOO_LARGE':
    case 'UNSUPPORTED_FILE_TYPE':
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
    const uploadsDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeOriginalName = file.originalname.replace(/\s+/g, '_');
    const uniqueName = `${Date.now()}-${safeOriginalName}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('UNSUPPORTED_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

const messageUploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keySelector: (req) => `message-upload:${req.user?.id || req.ip || 'unknown'}`,
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      handleServiceError(res, new Error('FILE_TOO_LARGE'));
      return;
    }

    if (err.message === 'UNSUPPORTED_FILE_TYPE') {
      handleServiceError(res, new Error('UNSUPPORTED_FILE_TYPE'));
      return;
    }

    console.error('UPLOAD MIDDLEWARE ERROR:', err);
    handleServiceError(res, new Error('INVALID_INPUT'));
  });
}

function validatePaginationQuery(limit, before) {
  if (limit !== undefined) {
    const numericLimit = Number(limit);

    if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 100) {
      throw new Error('INVALID_PAGINATION');
    }
  }

  if (before) {
    const parsedDate = new Date(before);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('INVALID_PAGINATION');
    }
  }
}

router.use(authenticate);

// Upload a file for later message attachment
router.post('/upload', messageUploadRateLimiter, handleUpload, async (req, res) => {
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

    validatePaginationQuery(limit, before);

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