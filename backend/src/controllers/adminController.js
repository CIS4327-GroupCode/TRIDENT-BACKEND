const { User, Organization, ResearcherProfile, Project, Milestone, ProjectReview, sequelize } = require('../database/models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');

/**
 * Get dashboard statistics
 * GET /admin/dashboard/stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM _user WHERE deleted_at IS NULL) as total_users,
        (SELECT COUNT(*) FROM _user WHERE deleted_at IS NULL AND role = 'nonprofit') as nonprofit_users,
        (SELECT COUNT(*) FROM _user WHERE deleted_at IS NULL AND role = 'researcher') as researcher_users,
        (SELECT COUNT(*) FROM _user WHERE deleted_at IS NULL AND role = 'admin') as admin_users,
        (SELECT COUNT(*) FROM _user WHERE deleted_at IS NOT NULL) as suspended_users,
        (SELECT COUNT(*) FROM _user WHERE account_status = 'pending') as pending_approval,
        (SELECT COUNT(*) FROM organizations) as total_organizations,
        (SELECT COUNT(*) FROM project_ideas) as total_projects,
        (SELECT COUNT(*) FROM project_ideas WHERE status = 'open') as open_projects,
        (SELECT COUNT(*) FROM project_ideas WHERE status = 'draft') as draft_projects,
        (SELECT COUNT(*) FROM milestones) as total_milestones,
        (SELECT COUNT(*) FROM milestones WHERE status = 'pending') as pending_milestones,
        (SELECT COUNT(*) FROM milestones WHERE status = 'in_progress') as active_milestones,
        (SELECT COUNT(*) FROM milestones WHERE status = 'completed') as completed_milestones
    `);

    res.status(200).json({ stats: stats[0] });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

/**
 * Get all users with filtering and pagination
 * GET /admin/users
 */
const getAllUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      status, 
      search,
      includeSuspended = 'false'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // Filter by role
    if (role && ['researcher', 'nonprofit', 'admin'].includes(role)) {
      where.role = role;
    }

    // Filter by account status
    if (status && ['active', 'pending', 'suspended'].includes(status)) {
      where.account_status = status;
    }

    // Search by name or email
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Include or exclude suspended users
    const paranoid = includeSuspended === 'true' ? false : true;

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'account_status', 'mfa_enabled', 'created_at', 'updated_at', 'deleted_at'],
      include: [
        {
          model: ResearcherProfile,
          as: 'researcherProfile',
          attributes: ['affiliation', 'domains', 'methods', 'tools', 'rate_min', 'rate_max', 'availability'],
          required: false
        },
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'EIN'],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']],
      paranoid
    });

    res.status(200).json({
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Get single user details
 * GET /admin/users/:id
 */
const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      paranoid: false,
      include: [
        {
          model: Organization,
          as: 'organization'
        },
        {
          model: ResearcherProfile,
          as: 'researcherProfile'
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
};

/**
 * Update user account status
 * PUT /admin/users/:id/status
 */
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'pending', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: active, pending, or suspended' });
    }

    const user = await User.findByPk(id, { paranoid: false });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.account_status = status;
    await user.save();

    res.status(200).json({ 
      message: `User status updated to ${status}`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        account_status: user.account_status
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

/**
 * Suspend user account (soft delete)
 * POST /admin/users/:id/suspend
 */
const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot suspend admin accounts' });
    }

    // Soft delete the user
    await user.destroy();

    res.status(200).json({ 
      message: 'User account suspended successfully',
      reason: reason || 'No reason provided'
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
};

/**
 * Unsuspend user account (restore)
 * POST /admin/users/:id/unsuspend
 */
const unsuspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, { paranoid: false });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.deleted_at) {
      return res.status(400).json({ error: 'User account is not suspended' });
    }

    await user.restore();

    res.status(200).json({ 
      message: 'User account unsuspended successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Unsuspend user error:', error);
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
};

/**
 * Permanently delete user account
 * DELETE /admin/users/:id/permanent
 */
const permanentlyDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { "confirmation": "DELETE" } to proceed.' 
      });
    }

    const user = await User.findByPk(id, { paranoid: false });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin' && user.id === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own admin account' });
    }

    const userName = user.name;
    const userEmail = user.email;

    await user.destroy({ force: true });

    res.status(200).json({ 
      message: `User "${userName}" (${userEmail}) permanently deleted. This action cannot be undone.`
    });
  } catch (error) {
    console.error('Permanently delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

/**
 * Approve pending user account
 * POST /admin/users/:id/approve
 */
const approveUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.account_status !== 'pending') {
      return res.status(400).json({ error: 'User is not pending approval' });
    }

    user.account_status = 'active';
    await user.save();

    res.status(200).json({ 
      message: 'User account approved successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        account_status: user.account_status
      }
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

/**
 * Get all projects with filtering
 * GET /admin/projects
 */
/**
 * Get all projects with filtering and pagination
 * GET /admin/projects
 */
const getAllProjects = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (status && ['draft', 'open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      where.status = status;
    }

    if (search) {
      where[sequelize.Op.or] = [
        { title: { [sequelize.Op.iLike]: `%${search}%` } },
        { problem: { [sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: projects } = await Project.findAndCountAll({
      where,
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name']
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['project_id', 'DESC']]
    });

    res.status(200).json({
      projects,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

/**
 * Get project by ID with full details
 * GET /admin/projects/:id
 */
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findByPk(id, {
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'EIN', 'mission', 'focus_tags', 'contacts']
        },
        {
          model: Milestone,
          as: 'milestones',
          attributes: ['id', 'name', 'description', 'due_date', 'status', 'completed_at', 'created_at']
        }
      ]
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.status(200).json({ project });
  } catch (error) {
    console.error('Get project by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
};

/**
 * Delete project
 * DELETE /admin/projects/:id
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectTitle = project.title;
    await project.destroy();

    res.status(200).json({ 
      message: `Project "${projectTitle}" deleted successfully`,
      reason: reason || 'No reason provided'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

/**
 * Update project status
 * PUT /admin/projects/:id/status
 */
const updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['draft', 'open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be: draft, open, in_progress, completed, or cancelled' 
      });
    }

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.status = status;
    await project.save();

    res.status(200).json({ 
      message: `Project status updated to ${status}`,
      project: {
        project_id: project.project_id,
        title: project.title,
        status: project.status
      }
    });
  } catch (error) {
    console.error('Update project status error:', error);
    res.status(500).json({ error: 'Failed to update project status' });
  }
};

/**
 * Get all milestones
 * GET /admin/milestones
 */
const getAllMilestones = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (status && ['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      where.status = status;
    }

    const { count, rows: milestones } = await Milestone.findAndCountAll({
      where,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title'],
          include: [
            {
              model: Organization,
              as: 'organization',
              attributes: ['id', 'name']
            }
          ]
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['due_date', 'ASC']]
    });

    res.status(200).json({
      milestones,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all milestones error:', error);
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
};

/**
 * Delete milestone
 * DELETE /admin/milestones/:id
 */
const deleteMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const milestone = await Milestone.findByPk(id);

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const milestoneName = milestone.name;
    await milestone.destroy();

    res.status(200).json({ 
      message: `Milestone "${milestoneName}" deleted successfully`,
      reason: reason || 'No reason provided'
    });
  } catch (error) {
    console.error('Delete milestone error:', error);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
};

/**
 * Get all organizations
 * GET /admin/organizations
 */
const getAllOrganizations = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { EIN: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: organizations } = await Organization.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'name', 'email', 'account_status'],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['id', 'DESC']]
    });

    res.status(200).json({
      organizations,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all organizations error:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
};

/**
 * Delete organization
 * DELETE /admin/organizations/:id
 */
const deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { "confirmation": "DELETE" } to proceed. This will also delete all associated projects.' 
      });
    }

    const organization = await Organization.findByPk(id);

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const orgName = organization.name;
    await organization.destroy();

    res.status(200).json({ 
      message: `Organization "${orgName}" and all associated projects deleted successfully`
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
};

/**
 * Get projects pending review
 * GET /admin/projects/pending
 */
const getPendingProjects = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: projects } = await Project.findAndCountAll({
      where: {
        status: ['pending_review', 'needs_revision']
      },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'EIN', 'mission', 'focus_tags']
        },
        {
          model: ProjectReview,
          as: 'reviews',
          include: [
            {
              model: User,
              as: 'reviewer',
              attributes: ['id', 'name', 'email']
            }
          ],
          order: [['created_at', 'DESC']]
        }
      ],
      order: [['project_id', 'ASC']],
      limit: parseInt(limit),
      offset
    });

    res.status(200).json({
      projects,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get pending projects error:', error);
    res.status(500).json({ error: 'Failed to fetch pending projects' });
  }
};

/**
 * Approve a project
 * POST /admin/projects/:id/approve
 */
const approveProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;
    const reviewerId = req.user.id;

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.status !== 'pending_review') {
      return res.status(400).json({ 
        error: `Cannot approve project with status "${project.status}". Project must be in pending_review status.` 
      });
    }

    const previousStatus = project.status;

    // Update project status
    await project.update({ status: 'approved' });

    // Create review record
    await ProjectReview.create({
      project_id: id,
      reviewer_id: reviewerId,
      action: 'approved',
      previous_status: previousStatus,
      new_status: 'approved',
      feedback: feedback || null,
      reviewed_at: new Date()
    });

    // Fetch updated project with associations
    const updatedProject = await Project.findByPk(id, {
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type']
        }
      ]
    });

    res.status(200).json({ 
      message: 'Project approved successfully',
      project: updatedProject
    });
  } catch (error) {
    console.error('Approve project error:', error);
    res.status(500).json({ error: 'Failed to approve project' });
  }
};

/**
 * Reject a project
 * POST /admin/projects/:id/reject
 */
const rejectProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const reviewerId = req.user.id;

    if (!rejection_reason || rejection_reason.trim() === '') {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.status !== 'pending_review') {
      return res.status(400).json({ 
        error: `Cannot reject project with status "${project.status}". Project must be in pending_review status.` 
      });
    }

    const previousStatus = project.status;

    // Update project status
    await project.update({ status: 'rejected' });

    // Create review record
    await ProjectReview.create({
      project_id: id,
      reviewer_id: reviewerId,
      action: 'rejected',
      previous_status: previousStatus,
      new_status: 'rejected',
      feedback: rejection_reason,
      reviewed_at: new Date()
    });

    // Fetch updated project with associations
    const updatedProject = await Project.findByPk(id, {
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type']
        }
      ]
    });

    res.status(200).json({ 
      message: 'Project rejected',
      project: updatedProject
    });
  } catch (error) {
    console.error('Reject project error:', error);
    res.status(500).json({ error: 'Failed to reject project' });
  }
};

/**
 * Request changes to a project
 * POST /admin/projects/:id/request-changes
 */
const requestProjectChanges = async (req, res) => {
  try {
    const { id } = req.params;
    const { changes_requested, feedback } = req.body;
    const reviewerId = req.user.id;

    if (!changes_requested || changes_requested.trim() === '') {
      return res.status(400).json({ error: 'Changes requested description is required' });
    }

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.status !== 'pending_review') {
      return res.status(400).json({ 
        error: `Cannot request changes for project with status "${project.status}". Project must be in pending_review status.` 
      });
    }

    const previousStatus = project.status;

    // Update project status
    await project.update({ status: 'needs_revision' });

    // Create review record
    await ProjectReview.create({
      project_id: id,
      reviewer_id: reviewerId,
      action: 'needs_revision',
      previous_status: previousStatus,
      new_status: 'needs_revision',
      feedback: feedback || null,
      changes_requested: changes_requested,
      reviewed_at: new Date()
    });

    // Fetch updated project with associations
    const updatedProject = await Project.findByPk(id, {
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type']
        }
      ]
    });

    res.status(200).json({ 
      message: 'Changes requested',
      project: updatedProject
    });
  } catch (error) {
    console.error('Request project changes error:', error);
    res.status(500).json({ error: 'Failed to request project changes' });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  suspendUser,
  unsuspendUser,
  permanentlyDeleteUser,
  approveUser,
  getAllProjects,
  getProjectById,
  deleteProject,
  updateProjectStatus,
  getAllMilestones,
  deleteMilestone,
  getAllOrganizations,
  deleteOrganization,
  getPendingProjects,
  approveProject,
  rejectProject,
  requestProjectChanges
};
