const {
  User,
  Organization,
  ResearcherProfile,
  Project,
  Milestone,
  ProjectReview,
  Attachment,
  MessageUploadAsset,
  UploadSecurityIncident,
  sequelize
} = require('../database/models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const notificationService = require('../services/notificationService');
const { getStorageAdapter } = require('../services/storage');
const { isStrongPassword, PASSWORD_POLICY_MESSAGE } = require('../utils/passwordPolicy');
const { syncProjectsCompletedForProject } = require('../services/researcherMetricsService');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLogger');
const { createBulkJob, updateBulkJob, getBulkJob } = require('../utils/bulkJobStore');

const COMPLETED_REVERT_TARGET_STATUSES = ['draft', 'open', 'in_progress', 'cancelled'];
const BULK_SYNC_THRESHOLD = 50;
const isAdministrativeRole = (role) => role === 'admin' || role === 'super_admin';

const createBatchId = () => `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeBulkIds = (ids) => {
  if (!Array.isArray(ids)) {
    return null;
  }

  const normalized = [];
  const seen = new Set();

  for (const rawId of ids) {
    const parsedId = Number.parseInt(rawId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0 || seen.has(parsedId)) {
      continue;
    }
    seen.add(parsedId);
    normalized.push(parsedId);
  }

  return normalized;
};

const buildBulkResponse = ({
  entityType,
  action,
  batchId,
  mode,
  requestedCount,
  processed,
  skipped,
  failed,
  queued = null,
}) => {
  const queuedCount = queued?.queuedCount || 0;

  return {
    ok: true,
    entityType,
    action,
    batchId,
    mode,
    summary: {
      requested: requestedCount,
      processed: processed.length,
      skipped: skipped.length,
      failed: failed.length,
      queued: queuedCount,
    },
    processed,
    skipped,
    failed,
    queued: queued || null,
  };
};

const executeBulkItems = async ({ ids, processItem }) => {
  const processed = [];
  const skipped = [];
  const failed = [];

  for (const id of ids) {
    try {
      const result = await processItem(id);
      if (!result || result.status === 'processed') {
        processed.push({ id, message: result?.message || 'Processed' });
      } else if (result.status === 'skipped') {
        skipped.push({ id, reason: result.reason || 'Ineligible' });
      } else if (result.status === 'failed') {
        failed.push({ id, error: result.error || 'Failed' });
      } else {
        processed.push({ id, message: 'Processed' });
      }
    } catch (error) {
      failed.push({ id, error: error.message || 'Unexpected failure' });
    }
  }

  return { processed, skipped, failed };
};

const runBulkOperation = async ({ entityType, action, ids, executeSync }) => {
  if (ids.length <= BULK_SYNC_THRESHOLD) {
    const batchId = createBatchId();
    const result = await executeSync(batchId, ids);
    return {
      statusCode: 200,
      payload: buildBulkResponse({
        entityType,
        action,
        batchId,
        mode: 'sync',
        requestedCount: ids.length,
        processed: result.processed,
        skipped: result.skipped,
        failed: result.failed,
      }),
    };
  }

  const job = createBulkJob({
    entityType,
    action,
    actorId: null,
    requestedCount: ids.length,
  });

  queueMicrotask(async () => {
    updateBulkJob(job.jobId, { status: 'running' });
    try {
      const result = await executeSync(job.jobId, ids);
      updateBulkJob(job.jobId, {
        status: 'completed',
        result: buildBulkResponse({
          entityType,
          action,
          batchId: job.jobId,
          mode: 'queued',
          requestedCount: ids.length,
          processed: result.processed,
          skipped: result.skipped,
          failed: result.failed,
          queued: {
            jobId: job.jobId,
            status: 'completed',
            queuedCount: ids.length,
          },
        }),
      });
    } catch (error) {
      updateBulkJob(job.jobId, {
        status: 'failed',
        error: error.message || 'Bulk job failed',
      });
    }
  });

  return {
    statusCode: 202,
    payload: buildBulkResponse({
      entityType,
      action,
      batchId: job.jobId,
      mode: 'queued',
      requestedCount: ids.length,
      processed: [],
      skipped: [],
      failed: [],
      queued: {
        jobId: job.jobId,
        status: 'queued',
        queuedCount: ids.length,
      },
    }),
  };
};

const parseCompletedReversionRequest = (review) => {
  if (!review || review.previous_status !== 'completed' || review.action !== 'submitted') {
    return null;
  }

  let parsedChanges = null;
  if (review.changes_requested) {
    try {
      parsedChanges = JSON.parse(review.changes_requested);
    } catch (error) {
      parsedChanges = null;
    }
  }

  if (!parsedChanges || parsedChanges.request_type !== 'completed_reversion') {
    return null;
  }

  const requestedStatus = String(parsedChanges.requested_status || '').trim();
  if (!COMPLETED_REVERT_TARGET_STATUSES.includes(requestedStatus)) {
    return null;
  }

  return {
    requestedStatus,
    reason: review.feedback || null,
  };
};

const getPendingCompletedReversionRequest = async (projectId) => {
  const latestSubmission = await ProjectReview.findOne({
    where: {
      project_id: projectId,
      action: 'submitted',
      new_status: 'pending_review',
    },
    order: [['reviewed_at', 'DESC'], ['created_at', 'DESC']],
  });

  return parseCompletedReversionRequest(latestSubmission);
};

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

    const previousStatus = user.account_status;

    user.account_status = status;
    await user.save();

    try {
      await notificationService.createNotification({
        userId: user.id,
        type: 'account_status_changed',
        title: 'Account Status Updated',
        message: `Your account status changed from ${previousStatus} to ${status}.`,
        link: '/settings',
        metadata: {
          previous_status: previousStatus,
          new_status: status,
        },
      });
    } catch (notifError) {
      console.error('Failed to create account status notification:', notifError);
    }

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

    if (user.role === 'admin' || user.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot suspend admin accounts' });
    }

    // Soft delete the user
    await user.destroy();

    // Create notification for user suspension
    try {
      await notificationService.createNotification({
        userId: id,
        type: 'user_suspended',
        title: 'Account Suspended',
        message: `Your account has been suspended. Reason: ${reason || 'Not provided'}.`,
        link: '/contact',
        metadata: {
          reason: reason
        }
      });
    } catch (notifError) {
      console.error('Failed to create suspension notification:', notifError);
    }

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

    try {
      await notificationService.createNotification({
        userId: user.id,
        type: 'account_status_changed',
        title: 'Account Restored',
        message: 'Your account has been restored and is active again.',
        link: '/settings',
        metadata: {
          previous_status: 'suspended',
          new_status: 'active',
        },
      });
    } catch (notifError) {
      console.error('Failed to create unsuspension notification:', notifError);
    }

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

    if ((user.role === 'admin' || user.role === 'super_admin') && user.id === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own admin account' });
    }

    if ((user.role === 'admin' || user.role === 'super_admin') && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can delete admin accounts' });
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
 * Create a new admin account (super_admin only)
 * POST /admin/users/create-admin
 */
const createAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }

    // Check for existing user with same email
    const existingUser = await User.findOne({ where: { email: email.trim().toLowerCase() }, paranoid: false });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newAdmin = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      role: 'admin',
      account_status: 'active'
    });

    res.status(201).json({
      message: 'Admin account created successfully',
      user: newAdmin.toSafeObject()
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin account' });
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

    const previousStatus = project.status;
    project.status = status;
    await project.save();

    if ((previousStatus === 'completed') !== (status === 'completed')) {
      await syncProjectsCompletedForProject(project.project_id);
    }

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
          attributes: ['id', 'name', 'EIN', 'mission', 'focus_tags'],
          include: [
            {
              model: User,
              as: 'users',
              attributes: ['id', 'name', 'email'],
              limit: 1
            }
          ]
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
    const completedReversionRequest = await getPendingCompletedReversionRequest(id);
    const approvedStatus = completedReversionRequest
      ? completedReversionRequest.requestedStatus
      : 'approved';

    // Update project status
    await project.update({ status: approvedStatus });

    // Create review record
    await ProjectReview.create({
      project_id: id,
      reviewer_id: reviewerId,
      action: 'approved',
      previous_status: previousStatus,
      new_status: approvedStatus,
      feedback: feedback || null,
      reviewed_at: new Date()
    });

    if ((previousStatus === 'completed') !== (approvedStatus === 'completed')) {
      await syncProjectsCompletedForProject(project.project_id);
    }

    // Get organization owner to notify
    const org = await Organization.findByPk(project.org_id);
    if (org && org.user_id) {
      try {
        if (completedReversionRequest) {
          await notificationService.createNotification({
            userId: org.user_id,
            type: 'project_status_changed',
            title: 'Completed Project Reversion Approved',
            message: `Your request to revert "${project.title}" was approved. New status: ${approvedStatus}.`,
            link: `/projects/${project.project_id}`,
            metadata: {
              project_id: project.project_id,
              project_title: project.title,
              old_status: 'completed',
              requested_status: approvedStatus,
              revert_reason: completedReversionRequest.reason,
              feedback,
            }
          });
        } else {
          await notificationService.createNotification({
            userId: org.user_id,
            type: 'project_approved',
            title: 'Project Approved',
            message: `Great news! Your project "${project.title}" has been approved and is now visible to researchers.`,
            link: `/projects/${project.project_id}`,
            metadata: {
              project_id: project.project_id,
              project_title: project.title,
              feedback
            }
          });
        }
      } catch (notifError) {
        console.error('Failed to create approval notification:', notifError);
      }
    }

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
      message: completedReversionRequest
        ? `Completed project reversion approved. Status updated to ${approvedStatus}`
        : 'Project approved successfully',
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
    const completedReversionRequest = await getPendingCompletedReversionRequest(id);
    const rejectedStatus = completedReversionRequest ? 'completed' : 'rejected';

    // Update project status
    await project.update({ status: rejectedStatus });

    // Create review record
    await ProjectReview.create({
      project_id: id,
      reviewer_id: reviewerId,
      action: 'rejected',
      previous_status: previousStatus,
      new_status: rejectedStatus,
      feedback: rejection_reason,
      reviewed_at: new Date()
    });

    if ((previousStatus === 'completed') !== (rejectedStatus === 'completed')) {
      await syncProjectsCompletedForProject(project.project_id);
    }

    // Get organization owner to notify
    const org = await Organization.findByPk(project.org_id);
    if (org && org.user_id) {
      try {
        if (completedReversionRequest) {
          await notificationService.createNotification({
            userId: org.user_id,
            type: 'project_status_changed',
            title: 'Completed Project Reversion Rejected',
            message: `Your request to revert "${project.title}" was rejected. The project remains completed. ${rejection_reason}`,
            link: `/projects/${project.project_id}`,
            metadata: {
              project_id: project.project_id,
              project_title: project.title,
              rejection_reason,
              requested_status: completedReversionRequest.requestedStatus,
              revert_reason: completedReversionRequest.reason,
            }
          });
        } else {
          await notificationService.createNotification({
            userId: org.user_id,
            type: 'project_rejected',
            title: 'Project Rejected',
            message: `Your project "${project.title}" has been reviewed and rejected. ${rejection_reason}`,
            link: `/projects/${project.project_id}`,
            metadata: {
              project_id: project.project_id,
              project_title: project.title,
              rejection_reason
            }
          });
        }
      } catch (notifError) {
        console.error('Failed to create rejection notification:', notifError);
      }
    }

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
      message: completedReversionRequest
        ? 'Completed project reversion request rejected. Project restored to completed.'
        : 'Project rejected',
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

    const completedReversionRequest = await getPendingCompletedReversionRequest(id);
    if (completedReversionRequest) {
      return res.status(400).json({
        error: 'Use approve or reject for completed project reversion requests',
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

/**
 * Get all attachments for admin/compliance visibility.
 * GET /admin/attachments
 */
const getAllAttachments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      scan_status,
      projectId,
      search
    } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (scan_status) {
      where.scan_status = scan_status;
    }
    if (projectId && Number.isInteger(Number.parseInt(projectId, 10))) {
      where.project_id = Number.parseInt(projectId, 10);
    }
    if (search) {
      where.filename = {
        [Op.iLike]: `%${search}%`
      };
    }

    const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    const { count, rows } = await Attachment.findAndCountAll({
      where,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title', 'org_id'],
          include: [
            {
              model: Organization,
              as: 'organization',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name', 'email']
        }
      ],
      limit: parsedLimit,
      offset,
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      attachments: rows,
      pagination: {
        total: count,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(count / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Get admin attachments error:', error);
    return res.status(500).json({ error: 'Failed to fetch attachments' });
  }
};

/**
 * Get aggregated attachment stats for admin dashboard.
 * GET /admin/attachments/stats
 */
const getAttachmentStats = async (req, res) => {
  try {
    const [
      total,
      active,
      deleted,
      quarantined,
      infected,
      totalBytes,
      recentUploads
    ] = await Promise.all([
      Attachment.count(),
      Attachment.count({ where: { status: 'active' } }),
      Attachment.count({ where: { status: 'deleted' } }),
      Attachment.count({ where: { status: 'quarantined' } }),
      Attachment.count({ where: { scan_status: 'infected' } }),
      Attachment.sum('size', {
        where: {
          status: {
            [Op.ne]: 'deleted'
          }
        }
      }),
      Attachment.count({
        where: {
          created_at: {
            [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    return res.status(200).json({
      stats: {
        totalAttachments: total,
        activeAttachments: active,
        deletedAttachments: deleted,
        quarantinedAttachments: quarantined,
        infectedScans: infected,
        storedBytes: totalBytes || 0,
        recentUploads7d: recentUploads
      }
    });
  } catch (error) {
    console.error('Get attachment stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch attachment stats' });
  }
};

/**
 * Get upload security incidents for admin triage.
 * GET /admin/upload-incidents
 */
const getUploadSecurityIncidents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      surface,
      scan_status,
      auto_suspension_state,
      search
    } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (surface) {
      where.surface = surface;
    }
    if (scan_status) {
      where.scan_status = scan_status;
    }
    if (auto_suspension_state) {
      where.auto_suspension_state = auto_suspension_state;
    }
    if (search) {
      where[Op.or] = [
        { file_name: { [Op.iLike]: `%${search}%` } },
        { reason: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    const { count, rows } = await UploadSecurityIncident.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'role', 'account_status', 'deleted_at'],
          required: false,
          paranoid: false
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'email'],
          required: false,
          paranoid: false
        }
      ],
      limit: parsedLimit,
      offset,
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      incidents: rows,
      pagination: {
        total: count,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(count / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Get upload incidents error:', error);
    return res.status(500).json({ error: 'Failed to fetch upload incidents' });
  }
};

/**
 * Get upload security incident stats for admin dashboard.
 * GET /admin/upload-incidents/stats
 */
const getUploadSecurityIncidentStats = async (req, res) => {
  try {
    const recentThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      total,
      open,
      resolved,
      infected,
      scanErrors,
      suspended,
      recentIncidents,
      attachmentIncidents,
      messageIncidents
    ] = await Promise.all([
      UploadSecurityIncident.count(),
      UploadSecurityIncident.count({ where: { status: 'open' } }),
      UploadSecurityIncident.count({ where: { status: 'resolved' } }),
      UploadSecurityIncident.count({ where: { scan_status: 'infected' } }),
      UploadSecurityIncident.count({ where: { scan_status: 'error' } }),
      UploadSecurityIncident.count({
        where: {
          auto_suspension_state: {
            [Op.in]: ['suspended', 'already_suspended']
          }
        }
      }),
      UploadSecurityIncident.count({
        where: {
          created_at: {
            [Op.gte]: recentThreshold
          }
        }
      }),
      UploadSecurityIncident.count({
        where: {
          surface: {
            [Op.in]: ['project_attachment', 'milestone_attachment']
          }
        }
      }),
      UploadSecurityIncident.count({ where: { surface: 'message_attachment' } })
    ]);

    return res.status(200).json({
      stats: {
        totalIncidents: total,
        openIncidents: open,
        resolvedIncidents: resolved,
        infectedIncidents: infected,
        scanErrorIncidents: scanErrors,
        suspendedUploaders: suspended,
        recentIncidents7d: recentIncidents,
        attachmentIncidents,
        messageIncidents
      }
    });
  } catch (error) {
    console.error('Get upload incident stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch upload incident stats' });
  }
};

/**
 * Resolve an upload security incident.
 * POST /admin/upload-incidents/:id/resolve
 */
const resolveUploadSecurityIncident = async (req, res) => {
  try {
    const incidentId = Number.parseInt(req.params.id, 10);
    const resolutionNotes = String(req.body?.resolution_notes || '').trim();

    if (!Number.isInteger(incidentId)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }

    const incident = await UploadSecurityIncident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Upload incident not found' });
    }

    if (incident.status === 'resolved') {
      return res.status(400).json({ error: 'Upload incident is already resolved' });
    }

    incident.status = 'resolved';
    incident.reviewed_by = req.user.id;
    incident.reviewed_at = new Date();
    incident.resolution_notes = resolutionNotes || null;
    await incident.save();

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.ADMIN_UPLOAD_INCIDENT_RESOLVED,
      entityType: 'UploadSecurityIncident',
      entityId: incident.id,
      metadata: {
        resolution_notes: resolutionNotes || null,
        auto_suspension_state: incident.auto_suspension_state,
        scan_status: incident.scan_status,
        surface: incident.surface
      }
    });

    return res.status(200).json({
      message: 'Upload incident resolved successfully',
      incident
    });
  } catch (error) {
    console.error('Resolve upload incident error:', error);
    return res.status(500).json({ error: 'Failed to resolve upload incident' });
  }
};

/**
 * Get secure message upload assets for admin governance.
 * GET /admin/message-upload-assets
 */
const getMessageUploadAssets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }
    if (search) {
      where.file_name = {
        [Op.iLike]: `%${search}%`
      };
    }

    const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    const { count, rows } = await MessageUploadAsset.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      limit: parsedLimit,
      offset,
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      assets: rows,
      pagination: {
        total: count,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(count / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Get message upload assets error:', error);
    return res.status(500).json({ error: 'Failed to fetch message upload assets' });
  }
};

/**
 * Get secure message upload asset stats.
 * GET /admin/message-upload-assets/stats
 */
const getMessageUploadAssetStats = async (req, res) => {
  try {
    const recentThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [total, uploaded, attached, deleted, totalBytes, recentUploads] = await Promise.all([
      MessageUploadAsset.count(),
      MessageUploadAsset.count({ where: { status: 'uploaded' } }),
      MessageUploadAsset.count({ where: { status: 'attached' } }),
      MessageUploadAsset.count({ where: { status: 'deleted' } }),
      MessageUploadAsset.sum('size', {
        where: {
          status: {
            [Op.ne]: 'deleted'
          }
        }
      }),
      MessageUploadAsset.count({
        where: {
          created_at: {
            [Op.gte]: recentThreshold
          }
        }
      })
    ]);

    return res.status(200).json({
      stats: {
        totalAssets: total,
        uploadedAssets: uploaded,
        attachedAssets: attached,
        deletedAssets: deleted,
        storedBytes: totalBytes || 0,
        recentUploads7d: recentUploads
      }
    });
  } catch (error) {
    console.error('Get message upload asset stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch message upload asset stats' });
  }
};

/**
 * Force-delete a secure message upload asset.
 * DELETE /admin/message-upload-assets/:id
 */
const forceDeleteMessageUploadAsset = async (req, res) => {
  try {
    const assetId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(assetId)) {
      return res.status(400).json({ error: 'Invalid message upload asset id' });
    }

    const asset = await MessageUploadAsset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Message upload asset not found' });
    }

    if (asset.status !== 'deleted' && asset.storage_key) {
      const storageAdapter = getStorageAdapter();
      await storageAdapter.delete(asset.storage_key);
    }

    asset.status = 'deleted';
    await asset.save();

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.ADMIN_MESSAGE_UPLOAD_ASSET_FORCE_DELETED,
      entityType: 'MessageUploadAsset',
      entityId: asset.id,
      metadata: {
        uploaded_by: asset.uploaded_by,
        file_name: asset.file_name
      }
    });

    return res.status(200).json({ message: 'Message upload asset force-deleted successfully' });
  } catch (error) {
    console.error('Force delete message upload asset error:', error);
    return res.status(500).json({ error: 'Failed to force delete message upload asset' });
  }
};

/**
 * Force-delete an attachment as admin.
 * DELETE /admin/attachments/:id
 */
const forceDeleteAttachment = async (req, res) => {
  try {
    const attachmentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachment id' });
    }

    const attachment = await Attachment.findByPk(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.storage_key) {
      const storageAdapter = getStorageAdapter();
      await storageAdapter.delete(attachment.storage_key);
    }

    attachment.status = 'deleted';
    attachment.is_latest = false;
    attachment.retention_expires_at = new Date();
    await attachment.save();

    await logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.ADMIN_ATTACHMENT_FORCE_DELETED,
      entityType: 'attachment',
      entityId: attachment.id,
      metadata: {
        file_name: attachment.filename,
        project_id: attachment.project_id,
        uploaded_by: attachment.uploaded_by
      }
    });

    return res.status(200).json({ message: 'Attachment force-deleted successfully' });
  } catch (error) {
    console.error('Force delete attachment error:', error);
    return res.status(500).json({ error: 'Failed to force delete attachment' });
  }
};

const bulkUsers = async (req, res) => {
  try {
    const { action, ids, reason, confirmation } = req.body || {};
    const allowedActions = ['approve', 'suspend', 'unsuspend', 'delete'];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Allowed: ${allowedActions.join(', ')}` });
    }

    const normalizedIds = normalizeBulkIds(ids);
    if (!normalizedIds || normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Provide a non-empty ids array with valid integer IDs.' });
    }

    if (action === 'delete' && confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Confirmation required. Send { "confirmation": "DELETE" } for delete action.' });
    }

    const auditMap = {
      approve: AUDIT_ACTIONS.ADMIN_BULK_USER_APPROVED,
      suspend: AUDIT_ACTIONS.ADMIN_BULK_USER_SUSPENDED,
      unsuspend: AUDIT_ACTIONS.ADMIN_BULK_USER_UNSUSPENDED,
      delete: AUDIT_ACTIONS.ADMIN_BULK_USER_DELETED,
    };

    const { statusCode, payload } = await runBulkOperation({
      entityType: 'user',
      action,
      ids: normalizedIds,
      executeSync: async (batchId, targetIds) => executeBulkItems({
        ids: targetIds,
        processItem: async (userId) => {
          const targetUser = await User.findByPk(userId, { paranoid: false });
          if (!targetUser) {
            return { status: 'skipped', reason: 'User not found' };
          }

          if (isAdministrativeRole(targetUser.role) && action !== 'approve') {
            if (action === 'delete' && req.user.role === 'super_admin' && req.user.id !== targetUser.id) {
              // Super admins may delete admin users except self.
            } else {
              return { status: 'skipped', reason: 'Administrative users are protected for this action' };
            }
          }

          if (action === 'approve') {
            if (targetUser.account_status !== 'pending' || targetUser.deleted_at) {
              return { status: 'skipped', reason: 'User is not pending approval' };
            }
            targetUser.account_status = 'active';
            await targetUser.save();
          }

          if (action === 'suspend') {
            if (targetUser.deleted_at) {
              return { status: 'skipped', reason: 'User is already suspended' };
            }
            await targetUser.destroy();
          }

          if (action === 'unsuspend') {
            if (!targetUser.deleted_at) {
              return { status: 'skipped', reason: 'User is not suspended' };
            }
            await targetUser.restore();
          }

          if (action === 'delete') {
            if (req.user.id === targetUser.id) {
              return { status: 'skipped', reason: 'Cannot delete your own account' };
            }
            if (isAdministrativeRole(targetUser.role) && req.user.role !== 'super_admin') {
              return { status: 'skipped', reason: 'Only super admins can delete admin accounts' };
            }
            await targetUser.destroy({ force: true });
          }

          if (action === 'suspend') {
            try {
              await notificationService.createNotification({
                userId,
                type: 'user_suspended',
                title: 'Account Suspended',
                message: `Your account has been suspended. Reason: ${reason || 'Not provided'}.`,
                link: '/contact',
                metadata: { reason: reason || null, batch_id: batchId },
              });
            } catch (notifError) {
              console.error('Failed to create bulk suspension notification:', notifError);
            }
          }

          if (action === 'unsuspend') {
            try {
              await notificationService.createNotification({
                userId,
                type: 'account_status_changed',
                title: 'Account Restored',
                message: 'Your account has been restored and is active again.',
                link: '/settings',
                metadata: {
                  previous_status: 'suspended',
                  new_status: 'active',
                  batch_id: batchId,
                },
              });
            } catch (notifError) {
              console.error('Failed to create bulk unsuspension notification:', notifError);
            }
          }

          await logAudit({
            actorId: req.user.id,
            action: auditMap[action],
            entityType: 'user',
            entityId: userId,
            metadata: {
              batch_id: batchId,
              reason: reason || null,
              triggered_action: action,
            },
          });

          return { status: 'processed', message: `User ${action} completed` };
        },
      }),
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Bulk users action error:', error);
    return res.status(500).json({ error: 'Failed to process bulk user action' });
  }
};

const bulkProjects = async (req, res) => {
  try {
    const { action, ids, reason, status } = req.body || {};
    const allowedActions = ['delete', 'update_status', 'approve', 'reject', 'request_changes'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Allowed: ${allowedActions.join(', ')}` });
    }

    const normalizedIds = normalizeBulkIds(ids);
    if (!normalizedIds || normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Provide a non-empty ids array with valid integer IDs.' });
    }

    if (action === 'update_status' && !['draft', 'open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'update_status requires a valid status value.' });
    }

    if ((action === 'reject' || action === 'request_changes') && !String(reason || '').trim()) {
      return res.status(400).json({ error: `${action} requires a non-empty reason.` });
    }

    const auditMap = {
      delete: AUDIT_ACTIONS.ADMIN_BULK_PROJECT_DELETED,
      update_status: AUDIT_ACTIONS.ADMIN_BULK_PROJECT_STATUS_UPDATED,
      approve: AUDIT_ACTIONS.ADMIN_BULK_PROJECT_APPROVED,
      reject: AUDIT_ACTIONS.ADMIN_BULK_PROJECT_REJECTED,
      request_changes: AUDIT_ACTIONS.ADMIN_BULK_PROJECT_CHANGES_REQUESTED,
    };

    const { statusCode, payload } = await runBulkOperation({
      entityType: 'project',
      action,
      ids: normalizedIds,
      executeSync: async (batchId, targetIds) => executeBulkItems({
        ids: targetIds,
        processItem: async (projectId) => {
          const project = await Project.findByPk(projectId);
          if (!project) {
            return { status: 'skipped', reason: 'Project not found' };
          }

          const previousStatus = project.status;

          if (action === 'delete') {
            await project.destroy();
          }

          if (action === 'update_status') {
            await project.update({ status });
          }

          if (action === 'approve') {
            if (project.status !== 'pending_review') {
              return { status: 'skipped', reason: `Project status must be pending_review, found ${project.status}` };
            }

            const completedReversionRequest = await getPendingCompletedReversionRequest(projectId);
            const approvedStatus = completedReversionRequest
              ? completedReversionRequest.requestedStatus
              : 'approved';

            await project.update({ status: approvedStatus });
            await ProjectReview.create({
              project_id: projectId,
              reviewer_id: req.user.id,
              action: 'approved',
              previous_status: previousStatus,
              new_status: approvedStatus,
              feedback: reason || null,
              reviewed_at: new Date(),
            });
          }

          if (action === 'reject') {
            if (project.status !== 'pending_review') {
              return { status: 'skipped', reason: `Project status must be pending_review, found ${project.status}` };
            }

            const completedReversionRequest = await getPendingCompletedReversionRequest(projectId);
            const rejectedStatus = completedReversionRequest ? 'completed' : 'rejected';

            await project.update({ status: rejectedStatus });
            await ProjectReview.create({
              project_id: projectId,
              reviewer_id: req.user.id,
              action: 'rejected',
              previous_status: previousStatus,
              new_status: rejectedStatus,
              feedback: reason,
              reviewed_at: new Date(),
            });
          }

          if (action === 'request_changes') {
            if (project.status !== 'pending_review') {
              return { status: 'skipped', reason: `Project status must be pending_review, found ${project.status}` };
            }

            const completedReversionRequest = await getPendingCompletedReversionRequest(projectId);
            if (completedReversionRequest) {
              return { status: 'skipped', reason: 'Completed reversion requests only support approve or reject' };
            }

            await project.update({ status: 'needs_revision' });
            await ProjectReview.create({
              project_id: projectId,
              reviewer_id: req.user.id,
              action: 'needs_revision',
              previous_status: previousStatus,
              new_status: 'needs_revision',
              feedback: reason || null,
              changes_requested: reason,
              reviewed_at: new Date(),
            });
          }

          if (previousStatus !== project.status && ((previousStatus === 'completed') !== (project.status === 'completed'))) {
            await syncProjectsCompletedForProject(project.project_id);
          }

          await logAudit({
            actorId: req.user.id,
            action: auditMap[action],
            entityType: 'project',
            entityId: projectId,
            metadata: {
              batch_id: batchId,
              reason: reason || null,
              previous_status: previousStatus,
              new_status: project.status,
              requested_status: status || null,
              triggered_action: action,
            },
          });

          return { status: 'processed', message: `Project ${action} completed` };
        },
      }),
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Bulk projects action error:', error);
    return res.status(500).json({ error: 'Failed to process bulk project action' });
  }
};

const bulkMilestones = async (req, res) => {
  try {
    const { action, ids, reason } = req.body || {};
    if (action !== 'delete') {
      return res.status(400).json({ error: 'Invalid action. Allowed: delete' });
    }

    const normalizedIds = normalizeBulkIds(ids);
    if (!normalizedIds || normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Provide a non-empty ids array with valid integer IDs.' });
    }

    const { statusCode, payload } = await runBulkOperation({
      entityType: 'milestone',
      action,
      ids: normalizedIds,
      executeSync: async (batchId, targetIds) => executeBulkItems({
        ids: targetIds,
        processItem: async (milestoneId) => {
          const milestone = await Milestone.findByPk(milestoneId);
          if (!milestone) {
            return { status: 'skipped', reason: 'Milestone not found' };
          }

          await milestone.destroy();
          await logAudit({
            actorId: req.user.id,
            action: AUDIT_ACTIONS.ADMIN_BULK_MILESTONE_DELETED,
            entityType: 'milestone',
            entityId: milestoneId,
            metadata: {
              batch_id: batchId,
              reason: reason || null,
              triggered_action: action,
            },
          });

          return { status: 'processed', message: 'Milestone deleted' };
        },
      }),
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Bulk milestones action error:', error);
    return res.status(500).json({ error: 'Failed to process bulk milestone action' });
  }
};

const bulkOrganizations = async (req, res) => {
  try {
    const { action, ids, confirmation } = req.body || {};
    if (action !== 'delete') {
      return res.status(400).json({ error: 'Invalid action. Allowed: delete' });
    }
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Confirmation required. Send { "confirmation": "DELETE" }.' });
    }

    const normalizedIds = normalizeBulkIds(ids);
    if (!normalizedIds || normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Provide a non-empty ids array with valid integer IDs.' });
    }

    const { statusCode, payload } = await runBulkOperation({
      entityType: 'organization',
      action,
      ids: normalizedIds,
      executeSync: async (batchId, targetIds) => executeBulkItems({
        ids: targetIds,
        processItem: async (orgId) => {
          const organization = await Organization.findByPk(orgId);
          if (!organization) {
            return { status: 'skipped', reason: 'Organization not found' };
          }

          await organization.destroy();
          await logAudit({
            actorId: req.user.id,
            action: AUDIT_ACTIONS.ADMIN_BULK_ORGANIZATION_DELETED,
            entityType: 'organization',
            entityId: orgId,
            metadata: {
              batch_id: batchId,
              triggered_action: action,
            },
          });

          return { status: 'processed', message: 'Organization deleted' };
        },
      }),
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Bulk organizations action error:', error);
    return res.status(500).json({ error: 'Failed to process bulk organization action' });
  }
};

const bulkAttachments = async (req, res) => {
  try {
    const { action, ids, reason } = req.body || {};
    if (action !== 'force_delete') {
      return res.status(400).json({ error: 'Invalid action. Allowed: force_delete' });
    }

    const normalizedIds = normalizeBulkIds(ids);
    if (!normalizedIds || normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Provide a non-empty ids array with valid integer IDs.' });
    }

    const { statusCode, payload } = await runBulkOperation({
      entityType: 'attachment',
      action,
      ids: normalizedIds,
      executeSync: async (batchId, targetIds) => executeBulkItems({
        ids: targetIds,
        processItem: async (attachmentId) => {
          const attachment = await Attachment.findByPk(attachmentId);
          if (!attachment) {
            return { status: 'skipped', reason: 'Attachment not found' };
          }

          if (attachment.status === 'deleted') {
            return { status: 'skipped', reason: 'Attachment already deleted' };
          }

          if (attachment.storage_key) {
            const storageAdapter = getStorageAdapter();
            await storageAdapter.delete(attachment.storage_key);
          }

          attachment.status = 'deleted';
          attachment.is_latest = false;
          attachment.retention_expires_at = new Date();
          await attachment.save();

          await logAudit({
            actorId: req.user.id,
            action: AUDIT_ACTIONS.ADMIN_BULK_ATTACHMENT_FORCE_DELETED,
            entityType: 'attachment',
            entityId: attachmentId,
            metadata: {
              batch_id: batchId,
              reason: reason || null,
              triggered_action: action,
            },
          });

          return { status: 'processed', message: 'Attachment force deleted' };
        },
      }),
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Bulk attachments action error:', error);
    return res.status(500).json({ error: 'Failed to process bulk attachment action' });
  }
};

const getBulkJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getBulkJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Bulk job not found' });
    }

    return res.status(200).json({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      requestedCount: job.requestedCount,
      result: job.result || null,
      error: job.error || null,
    });
  } catch (error) {
    console.error('Get bulk job status error:', error);
    return res.status(500).json({ error: 'Failed to fetch bulk job status' });
  }
};

/**
 * Get SLA alerts — overdue milestones, approaching deadlines, at-risk projects
 * GET /admin/alerts
 */
const getAdminAlerts = async (req, res) => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Overdue milestones: not completed/cancelled and due_date < now
    const overdueMilestones = await Milestone.findAll({
      where: {
        status: { [Op.notIn]: ['completed', 'cancelled'] },
        due_date: { [Op.ne]: null, [Op.lt]: now }
      },
      include: [{
        model: Project,
        as: 'project',
        attributes: ['project_id', 'title', 'status'],
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name']
        }]
      }],
      order: [['due_date', 'ASC']]
    });

    // Approaching deadlines: not completed/cancelled and due_date between now and now+3 days
    const approachingMilestones = await Milestone.findAll({
      where: {
        status: { [Op.notIn]: ['completed', 'cancelled'] },
        due_date: { [Op.gte]: now, [Op.lte]: threeDaysFromNow }
      },
      include: [{
        model: Project,
        as: 'project',
        attributes: ['project_id', 'title', 'status'],
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name']
        }]
      }],
      order: [['due_date', 'ASC']]
    });

    // At-risk projects: in_progress projects where ALL milestones with due dates are overdue
    const inProgressProjects = await Project.findAll({
      where: { status: 'in_progress' },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name']
        },
        {
          model: Milestone,
          as: 'milestones',
          attributes: ['id', 'name', 'status', 'due_date']
        }
      ]
    });

    const atRiskProjects = inProgressProjects.filter(project => {
      const milestonesWithDueDates = (project.milestones || []).filter(m => m.due_date);
      if (milestonesWithDueDates.length === 0) return false;
      return milestonesWithDueDates.every(m =>
        m.status !== 'completed' && m.status !== 'cancelled' && new Date(m.due_date) < now
      );
    });

    const formatMilestone = (m) => {
      const dueDate = new Date(m.due_date);
      const diffMs = dueDate - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return {
        id: m.id,
        name: m.name,
        status: m.status,
        due_date: m.due_date,
        days_overdue: diffDays < 0 ? Math.abs(diffDays) : 0,
        days_until_due: diffDays > 0 ? diffDays : 0,
        project: m.project ? {
          project_id: m.project.project_id,
          title: m.project.title,
          status: m.project.status,
          organization: m.project.organization ? m.project.organization.name : null
        } : null
      };
    };

    res.status(200).json({
      overdue: overdueMilestones.map(formatMilestone),
      approaching: approachingMilestones.map(formatMilestone),
      atRisk: atRiskProjects.map(p => ({
        project_id: p.project_id,
        title: p.title,
        status: p.status,
        organization: p.organization ? p.organization.name : null,
        overdue_milestones: (p.milestones || [])
          .filter(m => m.due_date && m.status !== 'completed' && m.status !== 'cancelled' && new Date(m.due_date) < now)
          .length,
        total_milestones: (p.milestones || []).length
      })),
      summary: {
        overdueCount: overdueMilestones.length,
        approachingCount: approachingMilestones.length,
        atRiskCount: atRiskProjects.length
      }
    });
  } catch (error) {
    console.error('Get admin alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

/**
 * Export admin data as CSV
 * GET /admin/export/:entity
 */
const exportAdminData = async (req, res) => {
  try {
    const { entity } = req.params;
    const allowedEntities = ['users', 'projects', 'milestones', 'organizations'];

    if (!allowedEntities.includes(entity)) {
      return res.status(400).json({ error: `Invalid entity. Must be one of: ${allowedEntities.join(', ')}` });
    }

    const { status, role, search } = req.query;
    const EXPORT_LIMIT = 10000;
    let rows = [];
    let headers = [];

    if (entity === 'users') {
      const where = {};
      if (role && ['researcher', 'nonprofit', 'admin'].includes(role)) where.role = role;
      if (status && ['active', 'pending', 'suspended'].includes(status)) where.account_status = status;
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }
      const users = await User.findAll({
        where,
        attributes: ['id', 'name', 'email', 'role', 'account_status', 'created_at'],
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['name'],
          required: false
        }],
        limit: EXPORT_LIMIT,
        order: [['created_at', 'DESC']],
        paranoid: false
      });
      headers = ['ID', 'Name', 'Email', 'Role', 'Status', 'Organization', 'Created'];
      rows = users.map(u => [
        u.id, u.name, u.email, u.role, u.account_status,
        u.organization?.name || '', new Date(u.created_at).toISOString()
      ]);
    } else if (entity === 'projects') {
      const where = {};
      if (status) where.status = status;
      if (search) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { problem: { [Op.iLike]: `%${search}%` } }
        ];
      }
      const projects = await Project.findAll({
        where,
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['name'],
          required: false
        }],
        limit: EXPORT_LIMIT,
        order: [['project_id', 'DESC']]
      });
      headers = ['ID', 'Title', 'Organization', 'Status', 'Budget Min', 'Budget Max', 'Timeline'];
      rows = projects.map(p => [
        p.project_id, p.title, p.organization?.name || '', p.status,
        p.budget_min || '', p.budget_max || '', p.timeline || ''
      ]);
    } else if (entity === 'milestones') {
      const where = {};
      if (status) where.status = status;
      const milestones = await Milestone.findAll({
        where,
        include: [{
          model: Project,
          as: 'project',
          attributes: ['project_id', 'title'],
          include: [{
            model: Organization,
            as: 'organization',
            attributes: ['name']
          }]
        }],
        limit: EXPORT_LIMIT,
        order: [['due_date', 'ASC']]
      });
      headers = ['ID', 'Name', 'Project', 'Organization', 'Status', 'Due Date', 'Completed At'];
      rows = milestones.map(m => [
        m.id, m.name, m.project?.title || '', m.project?.organization?.name || '',
        m.status, m.due_date || '', m.completed_at ? new Date(m.completed_at).toISOString() : ''
      ]);
    } else if (entity === 'organizations') {
      const where = {};
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { EIN: { [Op.iLike]: `%${search}%` } }
        ];
      }
      const orgs = await Organization.findAll({
        where,
        limit: EXPORT_LIMIT,
        order: [['id', 'DESC']]
      });
      headers = ['ID', 'Name', 'EIN', 'Mission', 'Created'];
      rows = orgs.map(o => [
        o.id, o.name, o.EIN || '', o.mission || '',
        o.created_at ? new Date(o.created_at).toISOString() : ''
      ]);
    }

    // Build CSV with proper escaping
    const escapeCsv = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvLines = [headers.map(escapeCsv).join(',')];
    for (const row of rows) {
      csvLines.push(row.map(escapeCsv).join(','));
    }
    const csv = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${entity}-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    console.error('Export admin data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
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
  createAdmin,
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
  requestProjectChanges,
  getAllAttachments,
  getAttachmentStats,
  getUploadSecurityIncidents,
  getUploadSecurityIncidentStats,
  resolveUploadSecurityIncident,
  getMessageUploadAssets,
  getMessageUploadAssetStats,
  forceDeleteMessageUploadAsset,
  forceDeleteAttachment,
  bulkUsers,
  bulkProjects,
  bulkMilestones,
  bulkOrganizations,
  bulkAttachments,
  getBulkJobStatus,
  getAdminAlerts,
  exportAdminData
};
