const {
  Project,
  Rating,
  Application,
  User,
  ResearcherProfile
} = require('../database/models');
const notificationService = require('../services/notificationService');

const REVIEW_EDIT_WINDOW_DAYS = 14;
const SCORE_DIMENSIONS = ['quality', 'communication', 'timeliness', 'overall'];
const MAX_COMMENT_LENGTH = 2000;

const parseScores = (scores) => {
  let parsed = scores;
  if (typeof scores === 'string') {
    try {
      parsed = JSON.parse(scores);
    } catch (error) {
      return null;
    }
  }

  if (typeof parsed === 'number') {
    parsed = { overall: parsed };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const overallValue = parsed.overall;
  if (!Number.isInteger(overallValue) || overallValue < 1 || overallValue > 5) {
    return null;
  }

  const normalized = { overall: overallValue };
  for (const dimension of SCORE_DIMENSIONS) {
    if (dimension === 'overall') {
      continue;
    }
    const value = parsed[dimension];
    if (value === undefined || value === null || value === '') {
      normalized[dimension] = overallValue;
      continue;
    }
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return null;
    }
    normalized[dimension] = value;
  }

  return normalized;
};

const parseOptionalComments = (rawComments) => {
  if (rawComments === undefined || rawComments === null) {
    return { comments: null };
  }

  const comments = String(rawComments).trim();
  if (!comments) {
    return { comments: null };
  }

  if (comments.length > MAX_COMMENT_LENGTH) {
    return { error: `Comments cannot exceed ${MAX_COMMENT_LENGTH} characters` };
  }

  return { comments };
};

const getAcceptedResearcherIdsForProject = async (projectId) => {
  const acceptedApplications = await Application.findAll({
    where: {
      project_id: projectId,
      status: 'accepted'
    },
    attributes: ['researcher_id']
  });

  return [...new Set(acceptedApplications.map((row) => row.researcher_id))];
};

const resolveCounterpartyUserId = async ({ project, reviewer, requestedRatedUserId = null }) => {
  if (reviewer.role === 'researcher') {
    const nonprofitOwner = await User.findOne({
      where: {
        org_id: project.org_id,
        role: 'nonprofit'
      },
      order: [['id', 'ASC']]
    });
    return { ratedUserId: nonprofitOwner?.id || null };
  }

  const researcherIds = await getAcceptedResearcherIdsForProject(project.project_id);

  if (!researcherIds.length) {
    return { ratedUserId: null };
  }

  if (requestedRatedUserId !== null) {
    const requestedId = Number.parseInt(requestedRatedUserId, 10);
    if (!Number.isInteger(requestedId)) {
      return { error: { status: 400, message: 'Invalid reviewed_user_id' } };
    }

    if (!researcherIds.includes(requestedId)) {
      return {
        error: {
          status: 400,
          message: 'reviewed_user_id must be one of the accepted researchers for this project'
        }
      };
    }

    return { ratedUserId: requestedId };
  }

  if (researcherIds.length > 1) {
    return {
      error: {
        status: 400,
        message: 'Please specify reviewed_user_id when multiple accepted researchers participated in this project'
      }
    };
  }

  return { ratedUserId: researcherIds[0] };
};

const ensureReviewerCanRateProject = async ({ reviewer, projectId }) => {
  const project = await Project.findByPk(projectId);
  if (!project) {
    return { error: { status: 404, message: 'Project not found' } };
  }

  if (project.status !== 'completed') {
    return { error: { status: 400, message: 'Ratings are only allowed for completed projects' } };
  }

  if (reviewer.role === 'nonprofit') {
    if (!reviewer.org_id || reviewer.org_id !== project.org_id) {
      return { error: { status: 403, message: 'You are not authorized to rate this project' } };
    }
    return { project };
  }

  if (reviewer.role !== 'researcher') {
    return { error: { status: 403, message: 'Only researchers and nonprofits can submit ratings' } };
  }

  const researcherProfile = await ResearcherProfile.findOne({ where: { user_id: reviewer.id } });
  if (!researcherProfile) {
    return { error: { status: 404, message: 'Researcher profile not found' } };
  }

  const accepted = await Application.findOne({
    where: {
      project_id: project.project_id,
      researcher_id: researcherProfile.user_id,
      status: 'accepted'
    }
  });

  if (!accepted) {
    return { error: { status: 403, message: 'Only accepted project participants can submit ratings' } };
  }

  return { project };
};

const calculateSummary = (ratings) => {
  if (!ratings.length) {
    return {
      count: 0,
      averages: {
        quality: 0,
        communication: 0,
        timeliness: 0,
        overall: 0
      }
    };
  }

  const sums = {
    quality: 0,
    communication: 0,
    timeliness: 0,
    overall: 0
  };
  let scoredCount = 0;

  for (const rating of ratings) {
    const scores = parseScores(rating.scores);
    if (!scores) {
      continue;
    }
    scoredCount += 1;
    sums.quality += scores.quality;
    sums.communication += scores.communication;
    sums.timeliness += scores.timeliness;
    sums.overall += scores.overall;
  }

  if (scoredCount === 0) {
    return {
      count: ratings.length,
      averages: {
        quality: 0,
        communication: 0,
        timeliness: 0,
        overall: 0
      }
    };
  }

  return {
    count: ratings.length,
    averages: {
      quality: Number((sums.quality / scoredCount).toFixed(2)),
      communication: Number((sums.communication / scoredCount).toFixed(2)),
      timeliness: Number((sums.timeliness / scoredCount).toFixed(2)),
      overall: Number((sums.overall / scoredCount).toFixed(2))
    }
  };
};

const submitProjectRating = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const commentResult = parseOptionalComments(req.body.comments);
    if (commentResult.error) {
      return res.status(400).json({ error: commentResult.error });
    }

    const scores = parseScores(req.body.scores);

    if (!scores) {
      return res.status(400).json({
        error: 'Scores must include an overall integer value from 1 to 5 (quality, communication, and timeliness are optional)'
      });
    }

    const authResult = await ensureReviewerCanRateProject({ reviewer: req.user, projectId });
    if (authResult.error) {
      return res.status(authResult.error.status).json({ error: authResult.error.message });
    }

    const { project } = authResult;
    const fromParty = req.user.role;

    const ratedUserResolution = await resolveCounterpartyUserId({
      project,
      reviewer: req.user,
      requestedRatedUserId: req.body.reviewed_user_id ?? null
    });

    if (ratedUserResolution.error) {
      return res.status(ratedUserResolution.error.status).json({ error: ratedUserResolution.error.message });
    }

    const ratedUserId = ratedUserResolution.ratedUserId;

    const existing = await Rating.findOne({
      where: {
        project_id: project.project_id,
        rated_by_user_id: req.user.id,
        rated_user_id: ratedUserId
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'You have already submitted a rating for this participant in this project' });
    }

    const rating = await Rating.create({
      from_party: fromParty,
      scores,
      comments: commentResult.comments,
      project_id: project.project_id,
      rated_by_user_id: req.user.id,
      rated_user_id: ratedUserId,
      status: 'active'
    });

    if (ratedUserId) {
      await notificationService.createNotification({
        userId: ratedUserId,
        type: 'rating_received',
        title: 'New Rating Received',
        message: `You received a new rating for project "${project.title}".`,
        link: `/browse?project=${project.project_id}`,
        metadata: {
          project_id: project.project_id,
          rating_id: rating.id,
          reviewer_id: req.user.id
        }
      });
    }

    return res.status(201).json({
      message: 'Rating submitted successfully',
      rating
    });
  } catch (error) {
    console.error('Submit rating error:', error);
    return res.status(500).json({ error: 'Failed to submit rating' });
  }
};

const getProjectRatings = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const where = { project_id: projectId, status: 'active' };
    const { count, rows } = await Rating.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'role']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      ratings: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get project ratings error:', error);
    return res.status(500).json({ error: 'Failed to fetch project ratings' });
  }
};

const getProjectRatingSummary = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const ratings = await Rating.findAll({
      where: {
        project_id: projectId,
        status: 'active'
      }
    });

    return res.status(200).json({
      project_id: projectId,
      summary: calculateSummary(ratings)
    });
  } catch (error) {
    console.error('Get project rating summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch rating summary' });
  }
};

const getUserRatings = async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Rating.findAndCountAll({
      where: {
        rated_user_id: userId,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'role']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      ratings: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get user ratings error:', error);
    return res.status(500).json({ error: 'Failed to fetch user ratings' });
  }
};

const getRatingsGivenByUser = async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Rating.findAndCountAll({
      where: {
        rated_by_user_id: userId,
      },
      include: [
        {
          model: User,
          as: 'reviewedUser',
          attributes: ['id', 'name', 'role']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      ratings: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get ratings given by user error:', error);
    return res.status(500).json({ error: 'Failed to fetch submitted ratings' });
  }
};

const getUserRatingSummary = async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const ratings = await Rating.findAll({
      where: {
        rated_user_id: userId,
        status: 'active'
      }
    });

    return res.status(200).json({
      user_id: userId,
      summary: calculateSummary(ratings)
    });
  } catch (error) {
    console.error('Get user rating summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch user rating summary' });
  }
};

const updateProjectRating = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    const ratingId = Number.parseInt(req.params.ratingId, 10);
    if (!Number.isInteger(projectId) || !Number.isInteger(ratingId)) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const rating = await Rating.findOne({
      where: {
        id: ratingId,
        project_id: projectId,
        rated_by_user_id: req.user.id
      }
    });

    if (!rating) {
      return res.status(404).json({ error: 'Rating not found' });
    }

    const cutoff = new Date(rating.created_at || rating.updated_at || Date.now());
    cutoff.setDate(cutoff.getDate() + REVIEW_EDIT_WINDOW_DAYS);
    if (new Date() > cutoff) {
      return res.status(400).json({ error: `Rating edit window of ${REVIEW_EDIT_WINDOW_DAYS} days has expired` });
    }

    const commentResult = parseOptionalComments(req.body.comments);
    if (commentResult.error) {
      return res.status(400).json({ error: commentResult.error });
    }

    const scores = parseScores(req.body.scores);

    if (!scores) {
      return res.status(400).json({
        error: 'Scores must include an overall integer value from 1 to 5 (quality, communication, and timeliness are optional)'
      });
    }

    await rating.update({
      scores,
      comments: commentResult.comments
    });

    return res.status(200).json({
      message: 'Rating updated successfully',
      rating
    });
  } catch (error) {
    console.error('Update rating error:', error);
    return res.status(500).json({ error: 'Failed to update rating' });
  }
};

const deleteProjectRating = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    const ratingId = Number.parseInt(req.params.ratingId, 10);
    if (!Number.isInteger(projectId) || !Number.isInteger(ratingId)) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const rating = await Rating.findOne({
      where: {
        id: ratingId,
        project_id: projectId,
        rated_by_user_id: req.user.id
      }
    });

    if (!rating) {
      return res.status(404).json({ error: 'Rating not found' });
    }

    await rating.destroy();
    return res.status(200).json({ message: 'Rating deleted successfully' });
  } catch (error) {
    console.error('Delete rating error:', error);
    return res.status(500).json({ error: 'Failed to delete rating' });
  }
};

const moderateRating = async (req, res) => {
  try {
    const ratingId = Number.parseInt(req.params.ratingId, 10);
    if (!Number.isInteger(ratingId)) {
      return res.status(400).json({ error: 'Invalid rating id' });
    }

    const { action, reason } = req.body;
    if (!['flag', 'remove', 'restore'].includes(action)) {
      return res.status(400).json({ error: 'Action must be one of: flag, remove, restore' });
    }

    const rating = await Rating.findByPk(ratingId, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title']
        }
      ]
    });

    if (!rating) {
      return res.status(404).json({ error: 'Rating not found' });
    }

    const statusMap = {
      flag: 'flagged',
      remove: 'removed',
      restore: 'active'
    };

    await rating.update({
      status: statusMap[action],
      moderation_reason: reason ? String(reason).trim() : null,
      moderated_by: req.user.id,
      moderated_at: new Date()
    });

    if (rating.rated_by_user_id) {
      await notificationService.createNotification({
        userId: rating.rated_by_user_id,
        type: 'rating_moderated',
        title: 'Rating Moderation Update',
        message: `Your rating for project "${rating.project?.title || rating.project_id}" was ${statusMap[action]}.`,
        link: `/browse?project=${rating.project_id}`,
        metadata: {
          rating_id: rating.id,
          moderation_action: action,
          moderation_reason: reason || null
        }
      });
    }

    return res.status(200).json({
      message: 'Rating moderation status updated successfully',
      rating
    });
  } catch (error) {
    console.error('Moderate rating error:', error);
    return res.status(500).json({ error: 'Failed to moderate rating' });
  }
};

const getAdminRatings = async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.status) {
      where.status = req.query.status;
    }
    if (req.query.project_id) {
      where.project_id = Number.parseInt(req.query.project_id, 10);
    }
    if (req.query.rated_user_id) {
      where.rated_user_id = Number.parseInt(req.query.rated_user_id, 10);
    }

    const { count, rows } = await Rating.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'role']
        },
        {
          model: User,
          as: 'reviewedUser',
          attributes: ['id', 'name', 'role']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title']
        },
        {
          model: User,
          as: 'moderator',
          attributes: ['id', 'name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      ratings: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get admin ratings error:', error);
    return res.status(500).json({ error: 'Failed to fetch ratings' });
  }
};

const getAdminRatingStats = async (req, res) => {
  try {
    const [total, active, flagged, removed] = await Promise.all([
      Rating.count(),
      Rating.count({ where: { status: 'active' } }),
      Rating.count({ where: { status: 'flagged' } }),
      Rating.count({ where: { status: 'removed' } })
    ]);

    const activeRatings = await Rating.findAll({
      where: { status: 'active' },
      attributes: ['scores']
    });

    const summary = calculateSummary(activeRatings);

    return res.status(200).json({
      stats: {
        total,
        active,
        flagged,
        removed,
        average_overall_score: summary.averages.overall,
        average_quality_score: summary.averages.quality,
        average_communication_score: summary.averages.communication,
        average_timeliness_score: summary.averages.timeliness
      }
    });
  } catch (error) {
    console.error('Get admin rating stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch rating statistics' });
  }
};

module.exports = {
  submitProjectRating,
  getProjectRatings,
  getProjectRatingSummary,
  getUserRatings,
  getRatingsGivenByUser,
  getUserRatingSummary,
  updateProjectRating,
  deleteProjectRating,
  moderateRating,
  getAdminRatings,
  getAdminRatingStats
};
