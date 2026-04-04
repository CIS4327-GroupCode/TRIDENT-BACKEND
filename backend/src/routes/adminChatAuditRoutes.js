const express = require('express');
const router = express.Router();

const { authenticate, requireAdmin } = require('../middleware/auth');
const adminChatAuditService = require('../services/adminChatAuditService');

function handleServiceError(res, error) {
  console.error(error);

  switch (error.message) {
    case 'THREAD_NOT_FOUND':
      return res.status(404).json({
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
router.use(requireAdmin);

// Search threads by participant name/email or thread name/id
router.get('/threads', async (req, res) => {
  try {
    const { q = '', sensitive = 'all', limit = 50, offset = 0 } = req.query;

    const threads = await adminChatAuditService.searchAuditThreads({
      query: q,
      sensitive,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      threads,
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

// Open and audit a thread
router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { limit = 50, before = null } = req.query;

    const result = await adminChatAuditService.getAuditThreadMessages({
      adminUserId: req.user.id,
      threadId,
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

module.exports = router;