/**
 * Match Routes - Phase 1
 * 
 * Routes for researcher-project matching functionality
 * All routes require authentication
 */

const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { authenticate } = require('../middleware/auth');

/**
 * All match routes require authentication
 * Specific authorization checks are handled in controllers
 */
router.use(authenticate);

/**
 * GET /api/matches/project/:projectId
 * Get matching researchers for a specific project
 * Auth: Project owner, org member, or admin
 * Query params: limit, offset, minScore
 */
router.get('/project/:projectId', matchController.getProjectMatches);

/**
 * GET /api/matches/researcher/me
 * Get matching projects for logged-in researcher
 * Auth: Authenticated researcher
 * Query params: limit, offset, minScore
 */
router.get('/researcher/me', matchController.getResearcherMatches);

/**
 * GET /api/matches/explain
 * Get detailed score explanation for a specific match
 * Auth: Involved party or admin
 * Query params: projectId, researcherId
 */
router.get('/explain', matchController.explainMatch);

/**
 * POST /api/matches/:matchId/dismiss
 * Dismiss a match (future implementation - Phase 3)
 * Auth: Match owner
 */
router.post('/:matchId/dismiss', matchController.dismissMatch);

/**
 * POST /api/matches/recalculate
 * Batch recalculate all matches (future implementation - Phase 3)
 * Auth: Admin only
 */
router.post('/recalculate', matchController.recalculateAllMatches);

module.exports = router;
