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
router.get('/:id/history', agreementController.listAgreementHistory);
router.get('/:id/reviews', agreementController.listAgreementReviews);
router.get('/:id', agreementController.getAgreement);
router.put('/:id', agreementController.updateAgreement);
router.post('/:id/submit', agreementController.submitAgreementForReview);
router.post('/:id/internal-review', agreementController.reviewAgreement);
router.post('/:id/counterparty-review', agreementController.counterpartyReviewAgreement);
router.get('/:id/preview', agreementController.previewAgreement);
router.post('/:id/sign', signRateLimiter, agreementController.signAgreement);
router.get('/:id/download', agreementController.downloadAgreement);
router.post('/:id/effective', agreementController.makeAgreementEffective);
router.post('/:id/activate', agreementController.activateAgreement);
router.post('/:id/complete', agreementController.completeAgreement);
router.post('/:id/archive', agreementController.archiveAgreement);
router.post('/:id/amend', agreementController.createAmendment);
router.post('/:id/terminate', agreementController.terminateAgreement);
router.get('/:id/removal-requests', agreementController.listAgreementRemovalRequests);
router.post('/:id/removal-requests', agreementController.requestAgreementRemoval);
router.post('/:id/removal-requests/:requestId/approve', agreementController.approveAgreementRemovalRequest);
router.post('/:id/removal-requests/:requestId/reject', agreementController.rejectAgreementRemovalRequest);

module.exports = router;
