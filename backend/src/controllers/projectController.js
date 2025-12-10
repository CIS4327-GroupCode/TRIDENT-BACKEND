const { Project, Organization, ProjectReview, User } = require('../database/models');
const { Op } = require('sequelize');

/**
 * Browse and search public projects (for researchers)
 * GET /projects/browse
 */
const browseProjects = async (req, res) => {
  try {
    const {
      search,
      methods,
      budget_min,
      budget_max,
      data_sensitivity,
      timeline,
      page = 1,
      limit = 20
    } = req.query;

    // Build where clause
    const whereClause = {
      status: 'open' // Only show open projects
    };

    // Search in title, problem, outcomes, methods_required
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { problem: { [Op.iLike]: `%${search}%` } },
        { outcomes: { [Op.iLike]: `%${search}%` } },
        { methods_required: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Filter by methods (case-insensitive partial match)
    if (methods) {
      whereClause.methods_required = { [Op.iLike]: `%${methods}%` };
    }

    // Filter by budget range
    if (budget_min) {
      whereClause.budget_min = { [Op.gte]: parseFloat(budget_min) };
    }
    if (budget_max) {
      whereClause.budget_min = { [Op.lte]: parseFloat(budget_max) };
    }

    // Filter by data sensitivity
    if (data_sensitivity) {
      whereClause.data_sensitivity = data_sensitivity;
    }

    // Filter by timeline (partial match)
    if (timeline) {
      whereClause.timeline = { [Op.iLike]: `%${timeline}%` };
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with organization details
    const { count, rows } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'mission', 'focus_tags']
        }
      ],
      order: [['project_id', 'DESC']], // Most recent first
      limit: parseInt(limit),
      offset: offset
    });

    return res.status(200).json({
      projects: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Browse projects error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get public project details by ID
 * GET /projects/browse/:id
 */
const getPublicProject = async (req, res) => {
  try {
    const projectId = req.params.id;

    const project = await Project.findOne({
      where: {
        project_id: projectId,
        status: 'open' // Only show open projects
      },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'mission', 'focus_tags', 'EIN', 'contacts']
        }
      ]
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found or not available' });
    }

    return res.status(200).json({ project });
  } catch (error) {
    console.error('Get public project error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create a new project brief
 * POST /projects
 */
const createProject = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is nonprofit
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'nonprofit') {
      return res
        .status(403)
        .json({ error: 'Only nonprofit users can create projects' });
    }

    // Make sure user is linked to an organization
    if (!user.org_id) {
      return res.status(404).json({
        error:
          'Organization not found. Please complete your organization profile first.',
      });
    }

    // Make sure that organization actually exists
    const organization = await Organization.findByPk(user.org_id);
    if (!organization) {
      return res
        .status(404)
        .json({ error: 'Organization not found for this user.' });
    }

    const {
      title,
      problem,
      outcomes,
      methods_required,
      timeline,
      budget_min,
      data_sensitivity,
      status,
    } = req.body;

    // Validate required fields
    if (!title || title.trim() === '') {
      return res
        .status(400)
        .json({ error: 'Project title is required' });
    }

    // Validate budget if provided
    if (budget_min !== undefined && budget_min !== null) {
      const budgetNum = parseFloat(budget_min);
      if (isNaN(budgetNum) || budgetNum < 0) {
        return res
          .status(400)
          .json({ error: 'Budget must be a non-negative number' });
      }
    }

    // Validate status if provided
    const validStatuses = ['draft', 'open', 'in_progress', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Create project
    const project = await Project.create({
      title: title.trim(),
      problem: problem ? problem.trim() : null,
      outcomes: outcomes ? outcomes.trim() : null,
      methods_required: methods_required ? methods_required.trim() : null,
      timeline: timeline ? timeline.trim() : null,
      budget_min: budget_min || null,
      data_sensitivity: data_sensitivity ? data_sensitivity.trim() : null,
      status: status || 'draft',
      org_id: organization.id, // <- key line
    });

    return res.status(201).json({
      message: 'Project created successfully',
      project,
    });
  } catch (error) {
    console.error('Create project error:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map((e) => e.message),
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get all projects for current user's organization
 * GET /projects
 */
/**
 * Get all projects for current user's organization
 * GET /projects
 */
const getProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is nonprofit
    if (req.user.role !== 'nonprofit') {
      return res
        .status(403)
        .json({ error: 'Only nonprofit users can access projects' });
    }

    // Load fresh user from DB
    const user = await User.findByPk(userId);

    if (!user || !user.org_id) {
      return res
        .status(404)
        .json({ error: 'Organization not found for this user' });
    }

    // Optional filtering by status
    const { status } = req.query;
    const whereClause = { org_id: user.org_id };

    if (status) {
      whereClause.status = status;
    }

    const projects = await Project.findAll({
      where: whereClause,
      order: [['project_id', 'DESC']], // Most recent first
    });

    return res.status(200).json({ projects });
  } catch (error) {
    console.error('Get projects error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get a single project by ID
 * GET /projects/:id
 */
/**
 * Get a single project by ID
 * GET /projects/:id
 */
const getProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.id;

    // Verify user is nonprofit
    if (req.user.role !== 'nonprofit') {
      return res
        .status(403)
        .json({ error: 'Only nonprofit users can access projects' });
    }

    // Load fresh user from DB
    const user = await User.findByPk(userId);

    if (!user || !user.org_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const project = await Project.findOne({
      where: {
        project_id: projectId,
        org_id: user.org_id,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.status(200).json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update a project
 * PUT /projects/:id
 */
/**
 * Update a project
 * PUT /projects/:id
 */
const updateProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.id;

    // Verify user is nonprofit
    if (req.user.role !== 'nonprofit') {
      return res
        .status(403)
        .json({ error: 'Only nonprofit users can update projects' });
    }

    // Load fresh user from DB
    const user = await User.findByPk(userId);

    if (!user || !user.org_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const project = await Project.findOne({
      where: {
        project_id: projectId,
        org_id: user.org_id,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const allowedFields = [
      'title',
      'problem',
      'outcomes',
      'methods_required',
      'timeline',
      'budget_min',
      'data_sensitivity',
      'status',
    ];

    const updates = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key) && req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid update fields provided' });
    }

    // Validate title if being updated
    if (updates.title && updates.title.trim() === '') {
      return res
        .status(400)
        .json({ error: 'Project title cannot be empty' });
    }

    // Validate budget if being updated
    if (updates.budget_min !== undefined && updates.budget_min !== null) {
      const budgetNum = parseFloat(updates.budget_min);
      if (isNaN(budgetNum) || budgetNum < 0) {
        return res
          .status(400)
          .json({ error: 'Budget must be a non-negative number' });
      }
    }

    // Validate status if being updated
    if (updates.status) {
      const validStatuses = [
        'draft',
        'open',
        'in_progress',
        'completed',
        'cancelled',
      ];
      if (!validStatuses.includes(updates.status)) {
        return res.status(400).json({
          error: `Status must be one of: ${validStatuses.join(', ')}`,
        });
      }
    }

    await project.update(updates);

    return res.status(200).json({
      message: 'Project updated successfully',
      project,
    });
  } catch (error) {
    console.error('Update project error:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map((e) => e.message),
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete a project
 * DELETE /projects/:id
 */
/**
 * Delete a project
 * DELETE /projects/:id
 */
const deleteProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.id;

    // Verify user is nonprofit
    if (req.user.role !== 'nonprofit') {
      return res
        .status(403)
        .json({ error: 'Only nonprofit users can delete projects' });
    }

    // Load fresh user from DB
    const user = await User.findByPk(userId);

    if (!user || !user.org_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const project = await Project.findOne({
      where: {
        project_id: projectId,
        org_id: user.org_id,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await project.destroy();

    return res.status(200).json({
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Submit project for review
 * POST /projects/:id/submit-for-review
 */
/**
 * Submit project for review
 * POST /projects/:id/submit-for-review
 */
const submitForReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.id;

    // Verify user is nonprofit
    if (req.user.role !== 'nonprofit') {
      return res.status(403).json({
        error: 'Only nonprofit users can submit projects for review',
      });
    }

    // Load fresh user from DB
    const user = await User.findByPk(userId);

    if (!user || !user.org_id) {
      return res
        .status(404)
        .json({ error: 'Organization not found' });
    }

    const project = await Project.findOne({
      where: {
        project_id: projectId,
        org_id: user.org_id,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate current status
    if (!['draft', 'needs_revision'].includes(project.status)) {
      return res.status(400).json({
        error: `Cannot submit project with status "${project.status}". Only draft or needs_revision projects can be submitted for review.`,
      });
    }

    // Validate required fields
    if (!project.title || project.title.trim() === '') {
      return res.status(400).json({
        error: 'Project title is required before submission',
      });
    }

    const previousStatus = project.status;

    await project.update({ status: 'pending_review' });

    await ProjectReview.create({
      project_id: projectId,
      reviewer_id: null,
      action: 'submitted',
      previous_status: previousStatus,
      new_status: 'pending_review',
      reviewed_at: new Date(),
    });

    return res.status(200).json({
      message: 'Project submitted for review successfully',
      project,
    });
  } catch (error) {
    console.error('Submit for review error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  browseProjects,
  getPublicProject,
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  submitForReview
};
