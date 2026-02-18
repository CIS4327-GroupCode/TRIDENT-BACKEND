/**
 * Matching Algorithm Service - Phase 1
 * 
 * Calculates match scores between researchers and projects based on:
 * - Expertise alignment (30 pts)
 * - Research methods (25 pts)
 * - Budget compatibility (15 pts)
 * - Availability (10 pts)
 * - Experience (10 pts)
 * - Domain match (10 pts)
 * 
 * Total: 100 points
 */

const { Op } = require('sequelize');
const Project = require('../database/models/Project');
const ResearcherProfile = require('../database/models/ResearcherProfile');
const Organization = require('../database/models/Organization');
const User = require('../database/models/User');

/**
 * Parse comma-separated string into array of lowercase trimmed values
 * @param {string} str - Comma-separated string
 * @returns {string[]} Array of values
 */
function parseCommaSeparated(str) {
  if (!str || typeof str !== 'string') return [];
  return str
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length > 0);
}

/**
 * Calculate Jaccard similarity between two sets
 * @param {string[]|Set} set1 - First set
 * @param {string[]|Set} set2 - Second set
 * @returns {number} Similarity coefficient (0-1)
 */
function calculateJaccardSimilarity(set1, set2) {
  const s1 = new Set(Array.isArray(set1) ? set1 : Array.from(set1));
  const s2 = new Set(Array.isArray(set2) ? set2 : Array.from(set2));
  
  if (s1.size === 0 && s2.size === 0) return 0;
  if (s1.size === 0 || s2.size === 0) return 0;
  
  const intersection = new Set([...s1].filter(x => s2.has(x)));
  const union = new Set([...s1, ...s2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate range overlap percentage
 * @param {Object} range1 - {min, max}
 * @param {Object} range2 - {min, max}
 * @returns {number} Overlap percentage (0-1)
 */
function checkRangeOverlap(range1, range2) {
  if (!range1.min || !range1.max || !range2.min || !range2.max) return 0;
  
  const overlapMin = Math.max(range1.min, range2.min);
  const overlapMax = Math.min(range1.max, range2.max);
  
  if (overlapMin >= overlapMax) return 0;
  
  const overlapSize = overlapMax - overlapMin;
  const range1Size = range1.max - range1.min;
  const range2Size = range2.max - range2.min;
  const avgRangeSize = (range1Size + range2Size) / 2;
  
  return Math.min(overlapSize / avgRangeSize, 1);
}

/**
 * Calculate expertise alignment score (max 30 points)
 * Uses Jaccard similarity between project needs and researcher expertise
 * @param {string} projectExpertise - Comma-separated expertise from project
 * @param {string} researcherExpertise - Comma-separated expertise from researcher
 * @returns {number} Score 0-30
 */
function calculateExpertiseScore(projectExpertise, researcherExpertise) {
  const projectTags = parseCommaSeparated(projectExpertise);
  const researcherTags = parseCommaSeparated(researcherExpertise);
  
  if (projectTags.length === 0 || researcherTags.length === 0) return 0;
  
  const similarity = calculateJaccardSimilarity(projectTags, researcherTags);
  return Math.round(similarity * 30 * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate methods alignment score (max 25 points)
 * Checks if researcher has required methods with partial credit
 * @param {string} requiredMethods - Comma-separated methods from project
 * @param {string} researcherMethods - Comma-separated methods from researcher
 * @returns {number} Score 0-25
 */
function calculateMethodsScore(requiredMethods, researcherMethods) {
  const required = parseCommaSeparated(requiredMethods);
  const available = parseCommaSeparated(researcherMethods);
  
  if (required.length === 0) return 25; // No specific requirements
  if (available.length === 0) return 0;
  
  const matchedMethods = required.filter(method => available.includes(method));
  const matchPercentage = matchedMethods.length / required.length;
  
  return Math.round(matchPercentage * 25 * 10) / 10;
}

/**
 * Calculate budget compatibility score (max 15 points)
 * Compares researcher rate range with project budget
 * @param {Object} project - {budget_min, budget_max, estimated_hours}
 * @param {Object} researcher - {rate_min, rate_max}
 * @returns {number} Score 0-15
 */
function calculateBudgetScore(project, researcher) {
  const projectMin = parseFloat(project.budget_min) || 0;
  const projectMax = parseFloat(project.budget_max) || parseFloat(project.budget_min) || 0;
  const estimatedHours = parseInt(project.estimated_hours) || 100; // Default 100 hours
  
  const rateMin = parseFloat(researcher.rate_min) || parseFloat(researcher.hourly_rate_min) || 0;
  const rateMax = parseFloat(researcher.rate_max) || parseFloat(researcher.hourly_rate_max) || 0;
  
  if (projectMin === 0 || rateMin === 0) return 0;
  
  // Calculate researcher cost range
  const researcherCostMin = rateMin * estimatedHours;
  const researcherCostMax = rateMax * estimatedHours;
  
  // Check overlap
  const overlapPercentage = checkRangeOverlap(
    { min: projectMin, max: projectMax },
    { min: researcherCostMin, max: researcherCostMax }
  );
  
  return Math.round(overlapPercentage * 15 * 10) / 10;
}

/**
 * Calculate availability score (max 10 points)
 * Checks if researcher can start on time and has capacity
 * @param {Object} project - {start_date}
 * @param {Object} researcher - {available_start_date, current_projects_count, max_concurrent_projects}
 * @returns {number} Score 0-10
 */
function calculateAvailabilityScore(project, researcher) {
  let score = 0;
  
  // Check capacity (5 points)
  const currentProjects = parseInt(researcher.current_projects_count) || 0;
  const maxProjects = parseInt(researcher.max_concurrent_projects) || 3;
  
  if (currentProjects < maxProjects) {
    score += 5;
  }
  
  // Check start date alignment (5 points)
  if (project.start_date && researcher.available_start_date) {
    const projectStart = new Date(project.start_date);
    const researcherAvailable = new Date(researcher.available_start_date);
    
    if (researcherAvailable <= projectStart) {
      score += 5;
    }
  } else if (!project.start_date) {
    // No specific start date requirement
    score += 5;
  }
  
  return score;
}

/**
 * Calculate experience score (max 10 points)
 * Uses logarithmic scale based on completed projects
 * @param {number} projectsCompleted - Number of completed projects
 * @returns {number} Score 0-10
 */
function calculateExperienceScore(projectsCompleted) {
  const count = parseInt(projectsCompleted) || 0;
  
  if (count === 0) return 0;
  if (count <= 2) return 3;
  if (count <= 5) return 5;
  if (count <= 10) return 7;
  if (count <= 20) return 9;
  return 10;
}

/**
 * Calculate domain alignment score (max 10 points)
 * Compares researcher domains with organization focus areas
 * @param {string} orgFocusAreas - Comma-separated domains from organization
 * @param {string} researcherDomains - Comma-separated domains from researcher
 * @returns {number} Score 0-10
 */
function calculateDomainScore(orgFocusAreas, researcherDomains) {
  const orgDomains = parseCommaSeparated(orgFocusAreas);
  const resDomains = parseCommaSeparated(researcherDomains);
  
  if (orgDomains.length === 0 || resDomains.length === 0) return 0;
  
  const similarity = calculateJaccardSimilarity(orgDomains, resDomains);
  return Math.round(similarity * 10 * 10) / 10;
}

/**
 * Calculate overall match score between project and researcher
 * @param {Object} project - Project with organization
 * @param {Object} researcher - Researcher profile with user
 * @returns {Object} {totalScore, breakdown, strengths, concerns}
 */
function calculateMatchScore(project, researcher) {
  const breakdown = {
    expertise: calculateExpertiseScore(project.problem || project.outcomes || '', researcher.expertise),
    methods: calculateMethodsScore(project.methods_required, researcher.methods),
    budget: calculateBudgetScore(project, researcher),
    availability: calculateAvailabilityScore(project, researcher),
    experience: calculateExperienceScore(researcher.projects_completed),
    domain: calculateDomainScore(project.organization?.focus_areas, researcher.domains)
  };
  
  const totalScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
  
  // Generate strengths and concerns
  const strengths = [];
  const concerns = [];
  
  if (breakdown.expertise >= 20) strengths.push(`Strong expertise match (${Math.round(breakdown.expertise/30*100)}%)`);
  if (breakdown.methods === 25) strengths.push('All required methods present');
  else if (breakdown.methods >= 15) strengths.push('Most required methods present');
  if (breakdown.budget >= 12) strengths.push('Rate fits within budget');
  if (breakdown.availability === 10) strengths.push('Available and has capacity');
  if (breakdown.experience >= 8) strengths.push(`Highly experienced (${researcher.projects_completed} projects)`);
  
  if (breakdown.expertise < 15) concerns.push('Limited expertise overlap');
  if (breakdown.methods < 15) concerns.push('Missing some required methods');
  if (breakdown.budget < 8) concerns.push('Rate may not fit budget');
  if (breakdown.availability < 5) concerns.push('May not be available or at capacity');
  if (breakdown.domain < 5) concerns.push('Different research domain focus');
  
  return {
    totalScore: Math.round(totalScore * 10) / 10,
    breakdown,
    strengths,
    concerns
  };
}

/**
 * Find matching researchers for a project
 * @param {number} projectId - Project ID
 * @param {Object} options - {limit, offset, minScore}
 * @returns {Promise<Array>} Array of matches with scores
 */
async function findMatchesForProject(projectId, options) {
  const {
    limit ,
    offset ,
    minScore
  } = options;
  
  // Fetch project
  const project = await Project.findByPk(projectId);
  
  if (!project) {
    throw new Error('Project not found');
  }
  
  // Fetch organization separately
  let organization = null;
  if (project.org_id) {
    organization = await Organization.findByPk(project.org_id);
  }
  
  // Fetch all active researchers with their user data
  const researchers = await ResearcherProfile.findAll({
    where: {
      user_id: {
        [Op.ne]: null
      }
    }
  });
  
  // Fetch all users for researchers in one query
  const userIds = researchers.map(r => r.user_id).filter(Boolean);
  const users = await User.findAll({
    where: {
      id: userIds,
      account_status: 'active',
      deleted_at: null
    },
    attributes: ['id', 'name', 'email']
  });
  
  // Create user map for quick lookup
  const userMap = {};
  users.forEach(user => {
    userMap[user.id] = user;
  });
  
  // Calculate scores for researchers with active users
  const matches = researchers
    .filter(researcher => userMap[researcher.user_id])
    .map(researcher => {
      const user = userMap[researcher.user_id];
      const projectData = project.toJSON();
      projectData.organization = organization ? organization.toJSON() : null;
      
      const scoreData = calculateMatchScore(projectData, researcher.toJSON());
      
      return {
        researcher: {
          user_id: researcher.user_id,
          name: user.name,
          title: researcher.title,
          affiliation: researcher.affiliation,
          institution: researcher.institution,
          expertise: parseCommaSeparated(researcher.expertise),
          methods: parseCommaSeparated(researcher.methods),
          domains: parseCommaSeparated(researcher.domains),
          tools: parseCommaSeparated(researcher.tools),
          research_interests: researcher.research_interests,
          compliance_certifications: researcher.compliance_certifications,
          rate_min: researcher.hourly_rate_min || researcher.rate_min,
          rate_max: researcher.hourly_rate_max || researcher.rate_max,
          availability: researcher.availability,
          projects_completed: researcher.projects_completed
        },
        matchScore: scoreData.totalScore,
        scoreBreakdown: scoreData.breakdown,
        strengths: scoreData.strengths,
        concerns: scoreData.concerns,
        hasApplied: false, // TODO: Check agreements table
        isBookmarked: false // TODO: Implement bookmarks
      };
    });
  
  // Filter by minimum score and sort
  const filteredMatches = matches
    .filter(match => match.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);
  
  // Paginate
  const paginatedMatches = filteredMatches.slice(offset, offset + limit);
  
  return {
    matches: paginatedMatches,
    pagination: {
      total: filteredMatches.length,
      limit,
      offset,
      hasMore: offset + limit < filteredMatches.length
    }
  };
}

/**
 * Find matching projects for a researcher
 * @param {number} researcherId - Researcher user ID
 * @param {Object} options - {limit, offset, minScore}
 * @returns {Promise<Array>} Array of matching projects with scores
 */
async function findMatchesForResearcher(researcherId, options = {}) {
  const {
    limit = 20,
    offset = 0,
    minScore = 50
  } = options;
  
  // Fetch researcher profile
  const researcher = await ResearcherProfile.findOne({
    where: { user_id: researcherId }
  });
  
  if (!researcher) {
    throw new Error('Researcher profile not found');
  }
  
  // Fetch all open projects
  const projects = await Project.findAll({
    where: {
      status: 'open'
    }
  });
  
  // Fetch all organizations for these projects in one query
  const orgIds = projects.map(p => p.org_id).filter(Boolean);
  const organizations = await Organization.findAll({
    where: {
      id: orgIds
    }
  });
  
  // Create org map for quick lookup
  const orgMap = {};
  organizations.forEach(org => {
    orgMap[org.id] = org;
  });
  
  // Calculate scores for all projects
  const matches = projects.map(project => {
    const projectData = project.toJSON();
    projectData.organization = orgMap[project.org_id] ? orgMap[project.org_id].toJSON() : null;
    
    const scoreData = calculateMatchScore(projectData, researcher.toJSON());
    
    return {
      project: {
        project_id: project.project_id,
        title: project.title,
        problem: project.problem,
        outcomes: project.outcomes,
        timeline: project.timeline,
        budget_min: project.budget_min,
        budget_max: project.budget_max,
        methods_required: parseCommaSeparated(project.methods_required),
        organization: projectData.organization ? {
          id: projectData.organization.id,
          name: projectData.organization.name
        } : null
      },
      matchScore: scoreData.totalScore,
      scoreBreakdown: scoreData.breakdown,
      strengths: scoreData.strengths,
      concerns: scoreData.concerns,
      hasApplied: false, // TODO: Check agreements table
      isBookmarked: false // TODO: Implement bookmarks
    };
  });
  
  // Filter by minimum score and sort
  const filteredMatches = matches
    .filter(match => match.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);
  
  // Paginate
  const paginatedMatches = filteredMatches.slice(offset, offset + limit);
  
  return {
    matches: paginatedMatches,
    pagination: {
      total: filteredMatches.length,
      limit,
      offset,
      hasMore: offset + limit < filteredMatches.length
    }
  };
}

module.exports = {
  // Utility functions
  parseCommaSeparated,
  calculateJaccardSimilarity,
  checkRangeOverlap,
  
  // Scoring functions
  calculateExpertiseScore,
  calculateMethodsScore,
  calculateBudgetScore,
  calculateAvailabilityScore,
  calculateExperienceScore,
  calculateDomainScore,
  calculateMatchScore,
  
  // Main matching functions
  findMatchesForProject,
  findMatchesForResearcher
};
