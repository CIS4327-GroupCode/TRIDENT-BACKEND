const express = require('express');
const router = express.Router({ mergeParams: true });
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');

// Project-scoped review routes mounted under /projects/:projectId/reviews
router.get('/', reviewController.getProjectReviews);
router.get('/summary', reviewController.getProjectReviewSummary);
router.post('/', authenticate, reviewController.submitProjectReview);
router.put('/:reviewId', authenticate, reviewController.updateProjectReview);
router.delete('/:reviewId', authenticate, reviewController.deleteProjectReview);

module.exports = router;