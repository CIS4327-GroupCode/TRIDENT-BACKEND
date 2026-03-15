const express = require('express');
const router = express.Router();
const agreementController = require('../controllers/agreementController');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const signRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20
});

router.use(authenticate);

router.get('/templates', agreementController.getTemplates);
router.get('/', agreementController.listAgreements);
router.post('/', agreementController.createAgreement);
router.get('/:id', agreementController.getAgreement);
router.put('/:id', agreementController.updateAgreement);
router.get('/:id/preview', agreementController.previewAgreement);
router.post('/:id/sign', signRateLimiter, agreementController.signAgreement);
router.get('/:id/download', agreementController.downloadAgreement);
router.post('/:id/activate', agreementController.activateAgreement);
router.post('/:id/terminate', agreementController.terminateAgreement);

module.exports = router;
