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
const Match = require('../database/models/Match');
const ResearcherProfile = require('../database/models/ResearcherProfile');
const User = require('../database/models/User');

const canAccessProject = (user, project) => {
  if (!user || !project) return false;
  if (user.role === 'admin') return true;
  return user.role === 'nonprofit' && user.org_id && Number(user.org_id) === Number(project.org_id);
};

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
    const {
      limit = 20,
      offset = 0,
      minScore = 10,
      requireCompliance = 'false',
      complianceFilter = ''
    } = req.query;
    
    // Validate parameters
    const validLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const validOffset = Math.max(parseInt(offset) || 0, 0);
    const validMinScore = Math.max(Math.min(parseFloat(minScore) ?? 10, 100), 0);
    const validRequireCompliance = String(requireCompliance).toLowerCase() === 'true';
    const validComplianceFilter = String(complianceFilter || '');

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
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!canAccessProject(req.user, project)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view matches for this project'
      });
    }
    
    // Find matches using matching service
    const result = await matchingService.findMatchesForProject(projectId, {
      limit: validLimit,
      offset: validOffset,
      minScore: validMinScore,
      requireCompliance: validRequireCompliance,
      complianceFilter: validComplianceFilter
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
    const { limit = 20, offset = 0, minScore = 10 } = req.query;
    
    // Validate parameters
    const validLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const validOffset = Math.max(parseInt(offset) || 0, 0);
    const validMinScore = Math.max(Math.min(parseFloat(minScore) ?? 10, 100), 0);

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

    const parsedProjectId = Number(projectId);
    const parsedResearcherId = Number(researcherId);
    if (!Number.isInteger(parsedProjectId) || !Number.isInteger(parsedResearcherId)) {
      return res.status(400).json({
        success: false,
        error: 'projectId and researcherId must be valid integers'
      });
    }
    
    // Fetch project and researcher
    const project = await Project.findByPk(parsedProjectId, {
      include: [{
        model: Organization,
        as: 'organization',
        required: false
      }]
    });
    
    const researcher = await ResearcherProfile.findOne({
      where: { user_id: parsedResearcherId }
    });
    
    if (!project || !researcher) {
      return res.status(404).json({
        success: false,
        error: 'Project or researcher not found'
      });
    }

    const isResearcherSelf = Number(req.user.id) === parsedResearcherId;
    const canViewAsProjectOwner = canAccessProject(req.user, project);

    if (!isResearcherSelf && !canViewAsProjectOwner) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view this match explanation'
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
  try {
    const { matchId, projectId, researcherId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    let match = null;

    if (matchId) {
      match = await Match.findByPk(matchId);
    } else if (projectId && researcherId) {
      match = await Match.findOne({
        where: {
          brief_id: Number(projectId),
          researcher_id: Number(researcherId)
        }
      });

      if (!match) {
        match = await Match.create({
          brief_id: Number(projectId),
          researcher_id: Number(researcherId),
          dismissed: true,
          calculated_at: new Date()
        });

        return res.status(200).json({
          success: true,
          message: 'Match dismissed',
          match: match.toSafeObject()
        });
      }
    }

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    const project = await Project.findByPk(match.brief_id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found for match'
      });
    }

    const isResearcherOwner = req.user.role === 'researcher' && Number(req.user.id) === Number(match.researcher_id);
    const isProjectOwner = canAccessProject(req.user, project);

    if (!isResearcherOwner && !isProjectOwner) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to dismiss this match'
      });
    }

    match.dismissed = true;
    match.calculated_at = new Date();
    await match.save();

    return res.status(200).json({
      success: true,
      message: 'Match dismissed',
      match: match.toSafeObject()
    });
  } catch (error) {
    console.error('Error in dismissMatch:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to dismiss match',
      message: error.message
    });
  }
};

/**
 * Recalculate all matches (admin only - for testing)
 * POST /api/matches/recalculate
 * 
 * Future: Batch recalculation for all projects
 * Phase 1: Returns not implemented
 */
const recalculateAllMatches = async (req, res) => {
  try {
    const projects = await Project.findAll({
      where: {
        status: 'open'
      }
    });

    const researchers = await ResearcherProfile.findAll({
      where: {
        user_id: {
          [require('sequelize').Op.ne]: null
        }
      }
    });

    const users = await User.findAll({
      where: {
        id: researchers.map(r => r.user_id),
        account_status: 'active',
        deleted_at: null
      },
      attributes: ['id']
    });

    const activeUserIds = new Set(users.map(u => u.id));
    const activeResearchers = researchers.filter(r => activeUserIds.has(r.user_id));

    let matchesCreated = 0;
    let matchesUpdated = 0;

    for (const project of projects) {
      const organization = await Organization.findByPk(project.org_id);
      const projectData = project.toJSON();
      projectData.organization = organization ? organization.toJSON() : null;

      for (const researcher of activeResearchers) {
        const scoreData = matchingService.calculateMatchScore(projectData, researcher.toJSON());

        const existing = await Match.findOne({
          where: {
            brief_id: project.project_id,
            researcher_id: researcher.user_id
          }
        });

        if (existing) {
          existing.score = scoreData.totalScore;
          existing.score_breakdown = scoreData.breakdown;
          existing.calculated_at = new Date();
          await existing.save();
          matchesUpdated += 1;
        } else {
          await Match.create({
            brief_id: project.project_id,
            researcher_id: researcher.user_id,
            score: scoreData.totalScore,
            score_breakdown: scoreData.breakdown,
            dismissed: false,
            calculated_at: new Date()
          });
          matchesCreated += 1;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Match recalculation complete',
      summary: {
        projectsProcessed: projects.length,
        researchersProcessed: activeResearchers.length,
        matchesCreated,
        matchesUpdated
      }
    });
  } catch (error) {
    console.error('Error in recalculateAllMatches:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to recalculate matches',
      message: error.message
    });
  }
};

module.exports = {
  getProjectMatches,
  getResearcherMatches,
  explainMatch,
  dismissMatch,
  recalculateAllMatches
};
