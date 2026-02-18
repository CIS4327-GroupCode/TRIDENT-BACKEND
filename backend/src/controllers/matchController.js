/**
 * Match Controller - Phase 1
 * 
 * API endpoints for researcher-project matching:
 * - GET /api/matches/project/:projectId - Get matches for a project
 * - GET /api/matches/researcher/me - Get matches for logged-in researcher
 * - GET /api/matches/explain - Get detailed score explanation
 * - POST /api/matches/:matchId/dismiss - Dismiss a match (future)
 */

const matchingService = require('../services/matchingService');
const Project = require('../database/models/Project');
const Organization = require('../database/models/Organization');

/**
 * Get matching researchers for a specific project
 * GET /api/matches/project/:projectId
 * 
 * Query params:
 * - limit: Number of results (default 20, max 100)
 * - offset: Pagination offset (default 0)
 * - minScore: Minimum match score (default 50, range 0-100)
 * 
 * Auth: User must be project owner, org member, or admin
 */
const getProjectMatches = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 20, offset = 0, minScore = 50 } = req.query;
    
    // Validate parameters
    const validLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const validOffset = Math.max(parseInt(offset) || 0, 0);
    const validMinScore = Math.max(Math.min(parseFloat(minScore) || 50, 100), 0);
    
    // Verify project exists and user has access
    const project = await Project.findByPk(projectId, {
      include: [{
        model: Organization,
        as: 'organization'
      }]
    });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Check authorization - TODO: Verify user is project owner or org member
    // For now, require authentication only
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Find matches using matching service
    const result = await matchingService.findMatchesForProject(projectId, {
      limit: validLimit,
      offset: validOffset,
      minScore: validMinScore
    });
    
    return res.status(200).json({
      success: true,
      matches: result.matches,
      pagination: result.pagination,
      project: {
        project_id: project.project_id,
        title: project.title,
        status: project.status
      }
    });
    
  } catch (error) {
    console.error('Error in getProjectMatches:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate matches',
      message: error.message
    });
  }
};

/**
 * Get matching projects for logged-in researcher
 * GET /api/matches/researcher/me
 * 
 * Query params:
 * - limit: Number of results (default 20, max 100)
 * - offset: Pagination offset (default 0)
 * - minScore: Minimum match score (default 50, range 0-100)
 * 
 * Auth: Must be authenticated researcher
 */
const getResearcherMatches = async (req, res) => {
  try {
    const { limit = 20, offset = 0, minScore = 50 } = req.query;
    
    // Validate parameters
    const validLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const validOffset = Math.max(parseInt(offset) || 0, 0);
    const validMinScore = Math.max(Math.min(parseFloat(minScore) || 50, 100), 0);
    
    // Check authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Find matches using matching service
    const result = await matchingService.findMatchesForResearcher(req.user.id, {
      limit: validLimit,
      offset: validOffset,
      minScore: validMinScore
    });
    
    return res.status(200).json({
      success: true,
      matches: result.matches,
      pagination: result.pagination,
      researcher: {
        user_id: req.user.id,
        name: `${req.user.first_name} ${req.user.last_name}`
      }
    });
    
  } catch (error) {
    console.error('Error in getResearcherMatches:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate matches',
      message: error.message
    });
  }
};

/**
 * Get detailed match score explanation between project and researcher
 * GET /api/matches/explain?projectId=X&researcherId=Y
 * 
 * Query params:
 * - projectId: Project ID (required)
 * - researcherId: Researcher user ID (required)
 * 
 * Auth: Must be involved party or admin
 */
const explainMatch = async (req, res) => {
  try {
    const { projectId, researcherId } = req.query;
    
    if (!projectId || !researcherId) {
      return res.status(400).json({
        success: false,
        error: 'Both projectId and researcherId are required'
      });
    }
    
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Fetch project and researcher
    const Project = require('../database/models/Project');
    const ResearcherProfile = require('../database/models/ResearcherProfile');
    const Organization = require('../database/models/Organization');
    
    const project = await Project.findByPk(projectId, {
      include: [{
        model: Organization,
        as: 'organization',
        required: false
      }]
    });
    
    const researcher = await ResearcherProfile.findOne({
      where: { user_id: researcherId }
    });
    
    if (!project || !researcher) {
      return res.status(404).json({
        success: false,
        error: 'Project or researcher not found'
      });
    }
    
    // Calculate match score with detailed breakdown
    const scoreData = matchingService.calculateMatchScore(
      project.toJSON(),
      researcher.toJSON()
    );
    
    // Add detailed explanations for each factor
    const detailedBreakdown = {
      expertise: {
        score: scoreData.breakdown.expertise,
        max: 30,
        percentage: Math.round((scoreData.breakdown.expertise / 30) * 100),
        explanation: `Expertise overlap based on Jaccard similarity`
      },
      methods: {
        score: scoreData.breakdown.methods,
        max: 25,
        percentage: Math.round((scoreData.breakdown.methods / 25) * 100),
        explanation: `Required methods coverage`
      },
      budget: {
        score: scoreData.breakdown.budget,
        max: 15,
        percentage: Math.round((scoreData.breakdown.budget / 15) * 100),
        explanation: `Budget compatibility based on hourly rate and estimated hours`
      },
      availability: {
        score: scoreData.breakdown.availability,
        max: 10,
        percentage: Math.round((scoreData.breakdown.availability / 10) * 100),
        explanation: `Start date alignment and capacity check`
      },
      experience: {
        score: scoreData.breakdown.experience,
        max: 10,
        percentage: Math.round((scoreData.breakdown.experience / 10) * 100),
        explanation: `Based on ${researcher.projects_completed} completed projects`
      },
      domain: {
        score: scoreData.breakdown.domain,
        max: 10,
        percentage: Math.round((scoreData.breakdown.domain / 10) * 100),
        explanation: `Research domain alignment with organization focus`
      }
    };
    
    return res.status(200).json({
      success: true,
      totalScore: scoreData.totalScore,
      breakdown: detailedBreakdown,
      strengths: scoreData.strengths,
      concerns: scoreData.concerns,
      project: {
        project_id: project.project_id,
        title: project.title
      },
      researcher: {
        user_id: researcher.user_id,
        title: researcher.title,
        institution: researcher.institution
      }
    });
    
  } catch (error) {
    console.error('Error in explainMatch:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to explain match',
      message: error.message
    });
  }
};

/**
 * Dismiss a match (placeholder for future implementation)
 * POST /api/matches/:matchId/dismiss
 * 
 * Future: Store dismissed matches to prevent showing again
 * Phase 1: Returns not implemented
 */
const dismissMatch = async (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Dismiss functionality will be implemented in Phase 3'
  });
};

/**
 * Recalculate all matches (admin only - for testing)
 * POST /api/matches/recalculate
 * 
 * Future: Batch recalculation for all projects
 * Phase 1: Returns not implemented
 */
const recalculateAllMatches = async (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Batch recalculation will be implemented in Phase 3'
  });
};

module.exports = {
  getProjectMatches,
  getResearcherMatches,
  explainMatch,
  dismissMatch,
  recalculateAllMatches
};
