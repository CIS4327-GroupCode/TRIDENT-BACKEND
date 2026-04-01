const express = require('express');
const router = express.Router({ mergeParams: true });
const ratingController = require('../controllers/ratingController');
const { authenticate } = require('../middleware/auth');

// Project-scoped rating routes mounted under /projects/:projectId/ratings
router.get('/', ratingController.getProjectRatings);
router.get('/summary', ratingController.getProjectRatingSummary);
router.post('/', authenticate, ratingController.submitProjectRating);
router.put('/:ratingId', authenticate, ratingController.updateProjectRating);
router.delete('/:ratingId', authenticate, ratingController.deleteProjectRating);

module.exports = router;