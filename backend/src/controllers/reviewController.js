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

const parseScores = (scores) => {
  let parsed = scores;
  if (typeof scores === 'string') {
    try {
      parsed = JSON.parse(scores);
    } catch (error) {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const normalized = {};
  for (const dimension of SCORE_DIMENSIONS) {
    const value = parsed[dimension];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return null;
    }
    normalized[dimension] = value;
  }

  return normalized;
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

const ensureReviewerCanReviewProject = async ({ reviewer, projectId }) => {
  const project = await Project.findByPk(projectId);
  if (!project) {
    return { error: { status: 404, message: 'Project not found' } };
  }

  if (project.status !== 'completed') {
    return { error: { status: 400, message: 'Reviews are only allowed for completed projects' } };
  }

  if (reviewer.role === 'nonprofit') {
    if (!reviewer.org_id || reviewer.org_id !== project.org_id) {
      return { error: { status: 403, message: 'You are not authorized to review this project' } };
    }
    return { project };
  }

  if (reviewer.role !== 'researcher') {
    return { error: { status: 403, message: 'Only researchers and nonprofits can submit reviews' } };
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
    return { error: { status: 403, message: 'Only accepted project participants can submit reviews' } };
  }

  return { project };
};

const calculateSummary = (reviews) => {
  if (!reviews.length) {
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

  for (const review of reviews) {
    const scores = parseScores(review.scores);
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
      count: reviews.length,
      averages: {
        quality: 0,
        communication: 0,
        timeliness: 0,
        overall: 0
      }
    };
  }

  return {
    count: reviews.length,
    averages: {
      quality: Number((sums.quality / scoredCount).toFixed(2)),
      communication: Number((sums.communication / scoredCount).toFixed(2)),
      timeliness: Number((sums.timeliness / scoredCount).toFixed(2)),
      overall: Number((sums.overall / scoredCount).toFixed(2))
    }
  };
};

const submitProjectReview = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const comments = (req.body.comments || '').trim();
    const scores = parseScores(req.body.scores);

    if (!scores) {
      return res.status(400).json({
        error: 'Scores must include integer values from 1 to 5 for quality, communication, timeliness, and overall'
      });
    }

    if (comments.length < 10 || comments.length > 2000) {
      return res.status(400).json({ error: 'Comments must be between 10 and 2000 characters' });
    }

    const authResult = await ensureReviewerCanReviewProject({ reviewer: req.user, projectId });
    if (authResult.error) {
      return res.status(authResult.error.status).json({ error: authResult.error.message });
    }

    const { project } = authResult;
    const fromParty = req.user.role;
    const existing = await Rating.findOne({
      where: {
        project_id: project.project_id,
        rated_by_user_id: req.user.id
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'You have already submitted a review for this project' });
    }

    const ratedUserResolution = await resolveCounterpartyUserId({
      project,
      reviewer: req.user,
      requestedRatedUserId: req.body.reviewed_user_id ?? null
    });

    if (ratedUserResolution.error) {
      return res.status(ratedUserResolution.error.status).json({ error: ratedUserResolution.error.message });
    }

    const ratedUserId = ratedUserResolution.ratedUserId;

    const review = await Rating.create({
      from_party: fromParty,
      scores,
      comments,
      project_id: project.project_id,
      rated_by_user_id: req.user.id,
      rated_user_id: ratedUserId,
      status: 'active'
    });

    if (ratedUserId) {
      await notificationService.createNotification({
        userId: ratedUserId,
        type: 'rating_received',
        title: 'New Review Received',
        message: `You received a new review for project "${project.title}".`,
        link: `/browse?project=${project.project_id}`,
        metadata: {
          project_id: project.project_id,
          review_id: review.id,
          reviewer_id: req.user.id
        }
      });
    }

    return res.status(201).json({
      message: 'Review submitted successfully',
      review
    });
  } catch (error) {
    console.error('Submit review error:', error);
    return res.status(500).json({ error: 'Failed to submit review' });
  }
};

const getProjectReviews = async (req, res) => {
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
      reviews: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get project reviews error:', error);
    return res.status(500).json({ error: 'Failed to fetch project reviews' });
  }
};

const getProjectReviewSummary = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const reviews = await Rating.findAll({
      where: {
        project_id: projectId,
        status: 'active'
      }
    });

    return res.status(200).json({
      project_id: projectId,
      summary: calculateSummary(reviews)
    });
  } catch (error) {
    console.error('Get project review summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch review summary' });
  }
};

const getUserReviews = async (req, res) => {
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
      reviews: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    return res.status(500).json({ error: 'Failed to fetch user reviews' });
  }
};

const getUserReviewSummary = async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const reviews = await Rating.findAll({
      where: {
        rated_user_id: userId,
        status: 'active'
      }
    });

    return res.status(200).json({
      user_id: userId,
      summary: calculateSummary(reviews)
    });
  } catch (error) {
    console.error('Get user review summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch user review summary' });
  }
};

const updateProjectReview = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    const reviewId = Number.parseInt(req.params.reviewId, 10);
    if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const review = await Rating.findOne({
      where: {
        id: reviewId,
        project_id: projectId,
        rated_by_user_id: req.user.id
      }
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const cutoff = new Date(review.created_at || review.updated_at || Date.now());
    cutoff.setDate(cutoff.getDate() + REVIEW_EDIT_WINDOW_DAYS);
    if (new Date() > cutoff) {
      return res.status(400).json({ error: `Review edit window of ${REVIEW_EDIT_WINDOW_DAYS} days has expired` });
    }

    const comments = (req.body.comments || '').trim();
    const scores = parseScores(req.body.scores);

    if (!scores) {
      return res.status(400).json({
        error: 'Scores must include integer values from 1 to 5 for quality, communication, timeliness, and overall'
      });
    }

    if (comments.length < 10 || comments.length > 2000) {
      return res.status(400).json({ error: 'Comments must be between 10 and 2000 characters' });
    }

    await review.update({
      scores,
      comments
    });

    return res.status(200).json({
      message: 'Review updated successfully',
      review
    });
  } catch (error) {
    console.error('Update review error:', error);
    return res.status(500).json({ error: 'Failed to update review' });
  }
};

const deleteProjectReview = async (req, res) => {
  try {
    const projectId = Number.parseInt(req.params.projectId, 10);
    const reviewId = Number.parseInt(req.params.reviewId, 10);
    if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const review = await Rating.findOne({
      where: {
        id: reviewId,
        project_id: projectId,
        rated_by_user_id: req.user.id
      }
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    await review.destroy();
    return res.status(200).json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    return res.status(500).json({ error: 'Failed to delete review' });
  }
};

const moderateReview = async (req, res) => {
  try {
    const reviewId = Number.parseInt(req.params.reviewId, 10);
    if (!Number.isInteger(reviewId)) {
      return res.status(400).json({ error: 'Invalid review id' });
    }

    const { action, reason } = req.body;
    if (!['flag', 'remove', 'restore'].includes(action)) {
      return res.status(400).json({ error: 'Action must be one of: flag, remove, restore' });
    }

    const review = await Rating.findByPk(reviewId, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title']
        }
      ]
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const statusMap = {
      flag: 'flagged',
      remove: 'removed',
      restore: 'active'
    };

    await review.update({
      status: statusMap[action],
      moderation_reason: reason ? String(reason).trim() : null,
      moderated_by: req.user.id,
      moderated_at: new Date()
    });

    if (review.rated_by_user_id) {
      await notificationService.createNotification({
        userId: review.rated_by_user_id,
        type: 'review_moderated',
        title: 'Review Moderation Update',
        message: `Your review for project "${review.project?.title || review.project_id}" was ${statusMap[action]}.`,
        link: `/browse?project=${review.project_id}`,
        metadata: {
          review_id: review.id,
          moderation_action: action,
          moderation_reason: reason || null
        }
      });
    }

    return res.status(200).json({
      message: 'Review moderation status updated successfully',
      review
    });
  } catch (error) {
    console.error('Moderate review error:', error);
    return res.status(500).json({ error: 'Failed to moderate review' });
  }
};

const getAdminReviews = async (req, res) => {
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
      reviews: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get admin reviews error:', error);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

const getAdminReviewStats = async (req, res) => {
  try {
    const [total, active, flagged, removed] = await Promise.all([
      Rating.count(),
      Rating.count({ where: { status: 'active' } }),
      Rating.count({ where: { status: 'flagged' } }),
      Rating.count({ where: { status: 'removed' } })
    ]);

    const activeReviews = await Rating.findAll({
      where: { status: 'active' },
      attributes: ['scores']
    });

    const summary = calculateSummary(activeReviews);

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
    console.error('Get admin review stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch review statistics' });
  }
};

module.exports = {
  submitProjectReview,
  getProjectReviews,
  getProjectReviewSummary,
  getUserReviews,
  getUserReviewSummary,
  updateProjectReview,
  deleteProjectReview,
  moderateReview,
  getAdminReviews,
  getAdminReviewStats
};