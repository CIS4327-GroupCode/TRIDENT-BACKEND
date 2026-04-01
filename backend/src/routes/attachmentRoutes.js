const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  attachmentUploadMiddleware,
  uploadAttachment,
  listProjectAttachments,
  deleteAttachment,
  downloadAttachment
} = require('../controllers/attachmentController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, attachmentUploadMiddleware, uploadAttachment);
router.get('/', authenticate, listProjectAttachments);
router.get('/:attachmentId/download', authenticate, downloadAttachment);
router.delete('/:attachmentId', authenticate, deleteAttachment);

module.exports = router;