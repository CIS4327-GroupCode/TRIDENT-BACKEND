const {
  Milestone,
  Project,
  User,
  Application,
  MilestoneResearcher,
  MilestoneRevisionRequest,
  MilestoneRequest,
  ProjectResearcherAccess,
  sequelize
} = require('../database/models');
const { Op } = require('sequelize');
const notificationService = require('../services/notificationService');
const { AUDIT_ACTIONS, logAudit } = require('../utils/auditLogger');
const {
  canResearcherAccessMilestone,
  getResearcherMilestoneAccess,
  hasWholeProjectAccess,
  hasAcceptedProjectParticipation
} = require('../services/milestoneAccessService');

const VALID_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'revision_requested',
  'revision_in_progress'
];

const NONPROFIT_MANAGED_REVIEWABLE_STATUSES = new Set(['completed', 'revision_requested']);

const parseOptionalText = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = String(value).trim();
  return parsed.length ? parsed : null;
};

const asInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const isAdminUser = (user) => user?.role === 'admin' || user?.role === 'super_admin';

const loadProject = async (projectId) => {
  return Project.findOne({ where: { project_id: projectId } });
};

const loadProjectAndNonprofitUser = async (projectId, userId) => {
  const project = await Project.findOne({ where: { project_id: projectId } });
  if (!project) {
    return { error: { status: 404, message: 'Project not found' } };
  }

  const user = await User.findByPk(userId);
  if (!user || user.role !== 'nonprofit') {
    return { error: { status: 403, message: 'Only nonprofit users can manage milestones' } };
  }

  if (project.org_id !== user.org_id) {
    return {
      error: {
        status: 403,
        message: "Access denied. You can only manage milestones for your organization's projects"
      }
    };
  }

  return { project, user };
};

const validateDependency = async ({ projectId, dependsOn, currentMilestoneId = null }) => {
  if (dependsOn === undefined) {
    return { ok: true };
  }

  if (dependsOn === null || dependsOn === '') {
    return { ok: true, value: null };
  }

  const parsed = parseInt(dependsOn, 10);
  if (Number.isNaN(parsed)) {
    return { ok: false, status: 400, message: 'depends_on must be a valid milestone ID' };
  }

  if (currentMilestoneId && parsed === parseInt(currentMilestoneId, 10)) {
    return { ok: false, status: 400, message: 'A milestone cannot depend on itself' };
  }

  const dependency = await Milestone.findOne({
    where: { id: parsed, project_id: projectId }
  });

  if (!dependency) {
    return {
      ok: false,
      status: 400,
      message: 'depends_on must reference a milestone in the same project'
    };
  }

  return { ok: true, value: parsed, dependency };
};

const validateDependencyStatusTransition = async ({ milestone, nextStatus, projectId }) => {
  if (!['in_progress', 'completed'].includes(nextStatus)) {
    return { ok: true };
  }

  const dependencyId = milestone.depends_on;
  if (!dependencyId) {
    return { ok: true };
  }

  const dependency = await Milestone.findOne({
    where: {
      id: dependencyId,
      project_id: projectId
    }
  });

  if (!dependency || dependency.status !== 'completed') {
    return {
      ok: false,
      status: 400,
      message: 'Dependency milestone must be completed before this status transition'
    };
  }

  return { ok: true };
};

const getCollaboratingResearcherIds = async (project) => {
  const involvedResearchers = await Application.findAll({
    where: {
      project_id: project.project_id,
      status: 'accepted'
    }
  });

  return involvedResearchers.map((app) => app.researcher_id);
};

const loadMilestoneForProject = async (projectId, milestoneId) => {
  return Milestone.findOne({
    where: {
      id: milestoneId,
      project_id: projectId
    }
  });
};

const normalizeResearcherIds = (researcherIds) => {
  if (!Array.isArray(researcherIds)) {
    return { error: 'researcher_ids must be an array of user IDs' };
  }

  const normalized = [];
  for (const value of researcherIds) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: 'researcher_ids must contain valid positive integer user IDs' };
    }

    if (!normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }

  return { normalized };
};

const normalizeMilestoneIds = (milestoneIds) => {
  if (!Array.isArray(milestoneIds)) {
    return { error: 'milestone_ids must be an array of milestone IDs' };
  }

  const normalized = [];
  for (const value of milestoneIds) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: 'milestone_ids must contain valid positive integer IDs' };
    }

    if (!normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }

  return { normalized };
};

const getMilestoneAssignmentsWithResearcher = async (milestoneId) => {
  return MilestoneResearcher.findAll({
    where: { milestone_id: milestoneId },
    include: [
      {
        model: User,
        as: 'researcher',
        attributes: ['id', 'name', 'email', 'account_status']
      }
    ],
    order: [['created_at', 'ASC']]
  });
};

const userCanViewAssignments = async ({ user, projectId, project }) => {
  if (isAdminUser(user)) {
    return true;
  }

  if (user.role === 'nonprofit') {
    return project.org_id === user.org_id;
  }

  if (user.role !== 'researcher') {
    return false;
  }

  const application = await hasAcceptedProjectParticipation({
    researcherId: user.id,
    projectId
  });

  if (!application) {
    return false;
  }

  return true;
};

const getAcceptedProjectResearchers = async (projectId) => {
  const acceptedApplications = await Application.findAll({
    where: {
      project_id: projectId,
      status: 'accepted'
    },
    attributes: ['researcher_id']
  });

  const researcherIds = acceptedApplications
    .map((application) => application.researcher_id)
    .filter((id) => Number.isInteger(id));

  if (!researcherIds.length) {
    return [];
  }

  return User.findAll({
    where: {
      id: researcherIds,
      role: 'researcher'
    },
    attributes: ['id', 'name', 'email', 'account_status']
  });
};

const ensureResearcherIsAcceptedInProject = async ({ projectId, researcherId }) => {
  const hasAcceptedApplication = await hasAcceptedProjectParticipation({
    projectId,
    researcherId
  });

  if (!hasAcceptedApplication) {
    return {
      ok: false,
      status: 400,
      message: 'Researchers must have an accepted project application before assignment'
    };
  }

  return { ok: true };
};

const findMilestoneRequestForProject = async (projectId, requestId) => {
  return MilestoneRequest.findOne({
    where: {
      id: requestId,
      project_id: projectId
    }
  });
};

const loadRevisionRequestForMilestone = async (milestoneId, revisionId) => {
  return MilestoneRevisionRequest.findOne({
    where: {
      id: revisionId,
      milestone_id: milestoneId
    }
  });
};

/**
 * Create a new milestone for a project
 * POST /api/projects/:projectId/milestones
 */
exports.createMilestone = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, due_date, status, depends_on } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Milestone name is required' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error) {
      const createMessage = ownership.error.message.replace('manage', 'create');
      return res.status(ownership.error.status).json({ error: createMessage });
    }
    const { project } = ownership;

    // Validate due date is in the future (for new milestones)
    if (due_date) {
      const dueDate = new Date(due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dueDate < today) {
        return res.status(400).json({ 
          error: 'Due date must be today or in the future' 
        });
      }
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
      });
    }

    const dependencyValidation = await validateDependency({
      projectId,
      dependsOn: depends_on
    });
    if (!dependencyValidation.ok) {
      return res.status(dependencyValidation.status).json({ error: dependencyValidation.message });
    }

    if (status) {
      const transitionValidation = await validateDependencyStatusTransition({
        milestone: { depends_on: dependencyValidation.value ?? null },
        nextStatus: status,
        projectId
      });
      if (!transitionValidation.ok) {
        return res.status(transitionValidation.status).json({ error: transitionValidation.message });
      }
    }

    // Create milestone
    const milestone = await Milestone.create({
      project_id: projectId,
      name: name.trim(),
      description: description?.trim() || null,
      due_date: due_date || null,
      status: status || 'pending',
      depends_on: dependencyValidation.value ?? null,
      completed_at: status === 'completed' ? new Date() : null
    });

    // Create notification for milestone creation - notify owner
    try {
      await notificationService.createNotification({
        userId: userId,
        type: 'milestone_created',
        title: 'Milestone Created',
        message: `Milestone "${milestone.name}" has been created for your project.`,
        link: `/projects/${projectId}/milestones`,
        metadata: {
          milestone_id: milestone.id,
          milestone_name: milestone.name,
          project_id: projectId
        }
      });

      const researcherIds = await getCollaboratingResearcherIds(project);
      if (researcherIds.length > 0) {
        await notificationService.createBulkNotifications(
          researcherIds,
          {
            type: 'milestone_created',
            title: 'New Milestone',
            message: `A new milestone "${milestone.name}" has been created for the project you are collaborating on.`,
            link: `/projects/${projectId}/milestones`,
            metadata: {
              milestone_id: milestone.id,
              milestone_name: milestone.name,
              project_id: projectId
            }
          }
        );
      }
    } catch (notifError) {
      console.error('Failed to create milestone notification:', notifError);
    }

    res.status(201).json({
      message: 'Milestone created successfully',
      milestone: milestone.toSafeObject()
    });

  } catch (error) {
    console.error('Create milestone error:', error);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
};

/**
 * Get all milestones for a project
 * GET /api/projects/:projectId/milestones
 */
exports.getMilestones = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, overdue } = req.query;

    // Verify project exists
    const project = await Project.findOne({
      where: { project_id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build query filters
    const where = { project_id: projectId };

    // Filter by status if provided
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
        });
      }
      where.status = status;
    }

    // Filter for overdue milestones
    if (overdue === 'true') {
      where.due_date = { [Op.lt]: new Date() };
      where.status = { [Op.ne]: 'completed' };
    }

    // Fetch milestones
    const milestones = await Milestone.findAll({
      where,
      include: [
        {
          model: Milestone,
          as: 'dependency',
          attributes: ['id', 'name', 'status']
        }
      ],
      order: [
        ['due_date', 'ASC NULLS LAST'],
        ['created_at', 'DESC']
      ]
    });

    // Add computed fields
    const enrichedMilestones = milestones.map(m => {
      const milestone = m.toSafeObject();
      milestone.is_overdue = m.isOverdue();
      milestone.days_until_due = m.daysUntilDue();
      milestone.computed_status = m.getStatus();
      return milestone;
    });

    res.json({
      project_id: parseInt(projectId),
      count: enrichedMilestones.length,
      milestones: enrichedMilestones
    });

  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
};

/**
 * Get a specific milestone
 * GET /api/projects/:projectId/milestones/:id
 */
exports.getMilestone = async (req, res) => {
  try {
    const { projectId, id } = req.params;

    const milestone = await Milestone.findOne({
      where: {
        id,
        project_id: projectId
      },
      include: [
        {
          model: Milestone,
          as: 'dependency',
          attributes: ['id', 'name', 'status']
        }
      ]
    });

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Add computed fields
    const enrichedMilestone = milestone.toSafeObject();
    enrichedMilestone.is_overdue = milestone.isOverdue();
    enrichedMilestone.days_until_due = milestone.daysUntilDue();
    enrichedMilestone.computed_status = milestone.getStatus();

    res.json({ milestone: enrichedMilestone });

  } catch (error) {
    console.error('Get milestone error:', error);
    res.status(500).json({ error: 'Failed to fetch milestone' });
  }
};

/**
 * Update a milestone
 * PUT /api/projects/:projectId/milestones/:id
 */
exports.updateMilestone = async (req, res) => {
  try {
    const { projectId, id } = req.params;
    const { name, description, due_date, status, depends_on } = req.body;

    // Find milestone
    const milestone = await Milestone.findOne({
      where: {
        id,
        project_id: projectId
      }
    });

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error) {
      const updateMessage = ownership.error.message.replace('manage', 'update');
      return res.status(ownership.error.status).json({ error: updateMessage });
    }
    const { project } = ownership;

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
      });
    }
    const updates = {};

    if (depends_on !== undefined) {
      const dependencyValidation = await validateDependency({
        projectId,
        dependsOn: depends_on,
        currentMilestoneId: id
      });

      if (!dependencyValidation.ok) {
        return res.status(dependencyValidation.status).json({ error: dependencyValidation.message });
      }

      updates.depends_on = dependencyValidation.value ?? null;
    }

    const nextStatus = status || milestone.status;
    const transitionValidation = await validateDependencyStatusTransition({
      milestone: {
        depends_on: updates.depends_on !== undefined ? updates.depends_on : milestone.depends_on
      },
      nextStatus,
      projectId
    });
    if (!transitionValidation.ok) {
      return res.status(transitionValidation.status).json({ error: transitionValidation.message });
    }


    // Validate name if provided
    if (name !== undefined && (!name || name.trim() === '')) {
      return res.status(400).json({ error: 'Milestone name cannot be empty' });
    }

    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (due_date !== undefined) updates.due_date = due_date || null;
    if (status !== undefined) {
      updates.status = status;
      // Set completed_at when status changes to completed
      if (status === 'completed' && milestone.status !== 'completed') {
        updates.completed_at = new Date();
      }
      // Clear completed_at when status changes from completed
      if (status !== 'completed' && milestone.status === 'completed') {
        updates.completed_at = null;
      }
    }

    // Update milestone
    const oldStatus = milestone.status;
    await milestone.update(updates);

    // Notify about milestone updates
    try {
      const researcherIds = await getCollaboratingResearcherIds(project);

      // Create notification for milestone completion to all collaborators
      if (updates.status && oldStatus !== 'completed' && updates.status === 'completed') {
        // Notify owner
        await notificationService.createNotification({
          userId: req.user.id,
          type: 'milestone_completed',
          title: 'Milestone Completed',
          message: `Congratulations! Milestone "${milestone.name}" has been marked as completed.`,
          link: `/projects/${projectId}/milestones`,
          metadata: {
            milestone_id: milestone.id,
            milestone_name: milestone.name,
            project_id: projectId
          }
        });

        // Notify researchers
        if (researcherIds.length > 0) {
          await notificationService.createBulkNotifications(
            researcherIds,
            {
              type: 'milestone_completed',
              title: 'Milestone Completed',
              message: `Milestone "${milestone.name}" for your project has been completed!`,
              link: `/projects/${projectId}/milestones`,
              metadata: {
                milestone_id: milestone.id,
                milestone_name: milestone.name,
                project_id: projectId
              }
            }
          );
        }
      }

      // Create notification for milestone updates
      if ((updates.name || updates.due_date) && updates.status !== 'completed') {
        const changesSummary = [];
        if (updates.name) changesSummary.push(`name updated to "${updates.name}"`);
        if (updates.due_date) changesSummary.push(`due date changed`);

        // Notify owner
        await notificationService.createNotification({
          userId: req.user.id,
          type: 'milestone_updated',
          title: 'Milestone Updated',
          message: `Milestone "${milestone.name}" has been updated: ${changesSummary.join(', ')}.`,
          link: `/projects/${projectId}/milestones`,
          metadata: {
            milestone_id: milestone.id,
            milestone_name: milestone.name,
            project_id: projectId,
            changes: changesSummary
          }
        });

        // Notify researchers
        if (researcherIds.length > 0) {
          await notificationService.createBulkNotifications(
            researcherIds,
            {
              type: 'milestone_updated',
              title: 'Milestone Updated',
              message: `Milestone "${milestone.name}" for your project has been updated.`,
              link: `/projects/${projectId}/milestones`,
              metadata: {
                milestone_id: milestone.id,
                milestone_name: milestone.name,
                project_id: projectId
              }
            }
          );
        }
      }

      // Create notification for milestone deadline approaching
      if (updates.due_date && !updates.status) {
        const daysUntilDue = milestone.daysUntilDue();
        if (daysUntilDue && daysUntilDue <= 3 && daysUntilDue > 0) {
          // Notify owner
          await notificationService.createNotification({
            userId: req.user.id,
            type: 'milestone_deadline_approaching',
            title: 'Milestone Deadline Approaching',
            message: `Milestone "${milestone.name}" is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`,
            link: `/projects/${projectId}/milestones`,
            metadata: {
              milestone_id: milestone.id,
              milestone_name: milestone.name,
              project_id: projectId,
              days_until_due: daysUntilDue
            }
          });

          // Notify researchers
          if (researcherIds.length > 0) {
            await notificationService.createBulkNotifications(
              researcherIds,
              {
                type: 'milestone_deadline_approaching',
                title: 'Milestone Deadline Approaching',
                message: `Milestone "${milestone.name}" is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`,
                link: `/projects/${projectId}/milestones`,
                metadata: {
                  milestone_id: milestone.id,
                  milestone_name: milestone.name,
                  project_id: projectId,
                  days_until_due: daysUntilDue
                }
              }
            );
          }
        }
      }
    } catch (notifError) {
      console.error('Failed to create milestone update notification:', notifError);
    }

    // Add computed fields
    const enrichedMilestone = milestone.toSafeObject();
    enrichedMilestone.is_overdue = milestone.isOverdue();
    enrichedMilestone.days_until_due = milestone.daysUntilDue();
    enrichedMilestone.computed_status = milestone.getStatus();

    res.json({
      message: 'Milestone updated successfully',
      milestone: enrichedMilestone
    });

  } catch (error) {
    console.error('Update milestone error:', error);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
};

/**
 * Delete a milestone
 * DELETE /api/projects/:projectId/milestones/:id
 */
exports.deleteMilestone = async (req, res) => {
  try {
    const { projectId, id } = req.params;

    // Find milestone
    const milestone = await Milestone.findOne({
      where: {
        id,
        project_id: projectId
      }
    });

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error) {
      const deleteMessage = ownership.error.message.replace('manage', 'delete');
      return res.status(ownership.error.status).json({ error: deleteMessage });
    }

    // Delete milestone
    await milestone.destroy();

    res.json({ 
      message: 'Milestone deleted successfully',
      deleted_id: parseInt(id)
    });

  } catch (error) {
    console.error('Delete milestone error:', error);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
};

/**
 * Get milestone researcher assignments
 * GET /api/projects/:projectId/milestones/:id/assignments
 */
exports.getMilestoneAssignments = async (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = await Project.findOne({ where: { project_id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const milestone = await loadMilestoneForProject(projectId, id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const canView = await userCanViewAssignments({
      user: req.user,
      projectId,
      project
    });

    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'researcher') {
      const hasProjectWideAccess = await hasWholeProjectAccess({
        researcherId: req.user.id,
        projectId
      });

      if (hasProjectWideAccess) {
        const assignments = await getMilestoneAssignmentsWithResearcher(id);
        return res.json({
          milestone_id: Number.parseInt(id, 10),
          count: assignments.length,
          assignments: assignments.map((assignment) => assignment.toSafeObject())
        });
      }

      const ownAssignment = await MilestoneResearcher.findOne({
        where: {
          milestone_id: id,
          researcher_id: req.user.id
        },
        include: [
          {
            model: User,
            as: 'researcher',
            attributes: ['id', 'name', 'email', 'account_status']
          }
        ]
      });

      if (!ownAssignment) {
        return res.status(403).json({ error: 'Access denied. You are not assigned to this milestone' });
      }

      return res.json({
        milestone_id: Number.parseInt(id, 10),
        count: 1,
        assignments: [ownAssignment.toSafeObject()]
      });
    }

    const assignments = await getMilestoneAssignmentsWithResearcher(id);
    return res.json({
      milestone_id: Number.parseInt(id, 10),
      count: assignments.length,
      assignments: assignments.map((assignment) => assignment.toSafeObject())
    });
  } catch (error) {
    console.error('Get milestone assignments error:', error);
    return res.status(500).json({ error: 'Failed to fetch milestone assignments' });
  }
};

/**
 * Replace milestone researcher assignments
 * PUT /api/projects/:projectId/milestones/:id/assignments
 */
exports.setMilestoneAssignments = async (req, res) => {
  try {
    const { projectId, id } = req.params;
    const { researcher_ids } = req.body;

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const milestone = await loadMilestoneForProject(projectId, id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const normalization = normalizeResearcherIds(researcher_ids);
    if (normalization.error) {
      return res.status(400).json({ error: normalization.error });
    }

    const normalizedResearcherIds = normalization.normalized;

    if (normalizedResearcherIds.length > 0) {
      const researchers = await User.findAll({
        where: {
          id: normalizedResearcherIds,
          role: 'researcher'
        },
        attributes: ['id']
      });

      const validResearcherIds = new Set(researchers.map((researcher) => researcher.id));
      const invalidResearcherIds = normalizedResearcherIds.filter(
        (researcherId) => !validResearcherIds.has(researcherId)
      );

      if (invalidResearcherIds.length > 0) {
        return res.status(400).json({
          error: 'All researcher_ids must reference existing researcher users',
          invalid_researcher_ids: invalidResearcherIds
        });
      }

      const acceptedApplications = await Application.findAll({
        where: {
          project_id: projectId,
          researcher_id: normalizedResearcherIds,
          status: 'accepted'
        },
        attributes: ['researcher_id']
      });

      const acceptedResearcherIds = new Set(
        acceptedApplications.map((application) => application.researcher_id)
      );
      const unacceptedResearchers = normalizedResearcherIds.filter(
        (researcherId) => !acceptedResearcherIds.has(researcherId)
      );

      if (unacceptedResearchers.length > 0) {
        return res.status(400).json({
          error: 'Researchers must have an accepted project application before assignment',
          unaccepted_researcher_ids: unacceptedResearchers
        });
      }
    }

    await sequelize.transaction(async (transaction) => {
      const existingAssignments = await MilestoneResearcher.findAll({
        where: { milestone_id: id },
        transaction,
        attributes: ['researcher_id']
      });

      const existingResearcherIds = new Set(
        existingAssignments.map((assignment) => assignment.researcher_id)
      );

      const toDelete = [...existingResearcherIds].filter(
        (researcherId) => !normalizedResearcherIds.includes(researcherId)
      );

      const toCreate = normalizedResearcherIds.filter(
        (researcherId) => !existingResearcherIds.has(researcherId)
      );

      if (toDelete.length > 0) {
        await MilestoneResearcher.destroy({
          where: {
            milestone_id: id,
            researcher_id: {
              [Op.in]: toDelete
            }
          },
          transaction
        });
      }

      if (toCreate.length > 0) {
        await MilestoneResearcher.bulkCreate(
          toCreate.map((researcherId) => ({
            milestone_id: Number.parseInt(id, 10),
            researcher_id: researcherId,
            assigned_by: req.user.id
          })),
          { transaction }
        );
      }
    });

    const assignments = await getMilestoneAssignmentsWithResearcher(id);
    return res.json({
      message: 'Milestone assignments updated successfully',
      milestone_id: Number.parseInt(id, 10),
      count: assignments.length,
      assignments: assignments.map((assignment) => assignment.toSafeObject())
    });
  } catch (error) {
    console.error('Set milestone assignments error:', error);
    return res.status(500).json({ error: 'Failed to update milestone assignments' });
  }
};

/**
 * Remove a researcher assignment from a milestone
 * DELETE /api/projects/:projectId/milestones/:id/assignments/:researcherId
 */
exports.removeMilestoneAssignment = async (req, res) => {
  try {
    const { projectId, id, researcherId } = req.params;

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const milestone = await loadMilestoneForProject(projectId, id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const parsedResearcherId = Number.parseInt(researcherId, 10);
    if (!Number.isInteger(parsedResearcherId) || parsedResearcherId <= 0) {
      return res.status(400).json({ error: 'Invalid researcher id' });
    }

    const deletedCount = await MilestoneResearcher.destroy({
      where: {
        milestone_id: id,
        researcher_id: parsedResearcherId
      }
    });

    if (!deletedCount) {
      return res.status(404).json({ error: 'Milestone assignment not found' });
    }

    return res.json({
      message: 'Milestone assignment removed successfully',
      milestone_id: Number.parseInt(id, 10),
      researcher_id: parsedResearcherId
    });
  } catch (error) {
    console.error('Remove milestone assignment error:', error);
    return res.status(500).json({ error: 'Failed to remove milestone assignment' });
  }
};

/**
 * List researcher access matrix for a project.
 * GET /api/projects/:projectId/milestones/access/researchers
 */
exports.getProjectResearcherAccess = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwnerNonprofit = req.user.role === 'nonprofit' && project.org_id === req.user.org_id;
    if (!isOwnerNonprofit && !isAdminUser(req.user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [researchers, accessRows, milestones, assignments] = await Promise.all([
      getAcceptedProjectResearchers(projectId),
      ProjectResearcherAccess.findAll({
        where: { project_id: projectId }
      }),
      Milestone.findAll({
        where: { project_id: projectId },
        attributes: ['id', 'name', 'status'],
        order: [['created_at', 'ASC']]
      }),
      MilestoneResearcher.findAll({
        include: [
          {
            model: Milestone,
            as: 'milestone',
            where: { project_id: projectId },
            attributes: ['id'],
            required: true
          }
        ],
        attributes: ['milestone_id', 'researcher_id']
      })
    ]);

    const accessByResearcherId = new Map();
    for (const row of accessRows) {
      accessByResearcherId.set(row.researcher_id, row);
    }

    const milestoneIdsByResearcherId = new Map();
    for (const assignment of assignments) {
      const list = milestoneIdsByResearcherId.get(assignment.researcher_id) || [];
      list.push(assignment.milestone_id);
      milestoneIdsByResearcherId.set(assignment.researcher_id, list);
    }

    const matrix = researchers.map((researcher) => {
      const access = accessByResearcherId.get(researcher.id);
      const milestoneIds = milestoneIdsByResearcherId.get(researcher.id) || [];
      return {
        researcher: researcher.toSafeObject ? researcher.toSafeObject() : researcher,
        whole_project: Boolean(access?.whole_project),
        milestone_ids: milestoneIds
      };
    });

    return res.json({
      project_id: projectId,
      milestones: milestones.map((milestone) => milestone.toSafeObject()),
      researchers: matrix
    });
  } catch (error) {
    console.error('Get project researcher access error:', error);
    return res.status(500).json({ error: 'Failed to fetch researcher access' });
  }
};

/**
 * Set researcher access scope for a project.
 * PUT /api/projects/:projectId/milestones/access/researchers/:researcherId
 */
exports.setProjectResearcherAccess = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const researcherId = asInt(req.params.researcherId);
    const wholeProject = Boolean(req.body.whole_project);
    const milestoneIdsInput = req.body.milestone_ids ?? [];

    if (!projectId || !researcherId) {
      return res.status(400).json({ error: 'Invalid project or researcher id' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const researcher = await User.findOne({
      where: { id: researcherId, role: 'researcher' },
      attributes: ['id', 'name', 'email', 'account_status']
    });
    if (!researcher) {
      return res.status(404).json({ error: 'Researcher not found' });
    }

    const acceptanceValidation = await ensureResearcherIsAcceptedInProject({
      projectId,
      researcherId
    });
    if (!acceptanceValidation.ok) {
      return res.status(acceptanceValidation.status).json({ error: acceptanceValidation.message });
    }

    const normalizedMilestones = normalizeMilestoneIds(milestoneIdsInput);
    if (normalizedMilestones.error) {
      return res.status(400).json({ error: normalizedMilestones.error });
    }

    const requestedMilestoneIds = normalizedMilestones.normalized;
    if (requestedMilestoneIds.length > 0) {
      const validMilestones = await Milestone.findAll({
        where: {
          project_id: projectId,
          id: requestedMilestoneIds
        },
        attributes: ['id']
      });
      const validMilestoneIds = new Set(validMilestones.map((milestone) => milestone.id));
      const invalidMilestoneIds = requestedMilestoneIds.filter((id) => !validMilestoneIds.has(id));
      if (invalidMilestoneIds.length > 0) {
        return res.status(400).json({
          error: 'Some milestone_ids do not belong to this project',
          invalid_milestone_ids: invalidMilestoneIds
        });
      }
    }

    await sequelize.transaction(async (transaction) => {
      const [accessRow, created] = await ProjectResearcherAccess.findOrCreate({
        where: {
          project_id: projectId,
          researcher_id: researcherId
        },
        defaults: {
          project_id: projectId,
          researcher_id: researcherId,
          assigned_by: req.user.id,
          whole_project: wholeProject
        },
        transaction
      });

      if (!created) {
        accessRow.whole_project = wholeProject;
        accessRow.assigned_by = req.user.id;
        await accessRow.save({ transaction });
      }

      const projectMilestones = await Milestone.findAll({
        where: { project_id: projectId },
        attributes: ['id'],
        transaction
      });
      const projectMilestoneIds = projectMilestones.map((milestone) => milestone.id);

      if (projectMilestoneIds.length > 0) {
        await MilestoneResearcher.destroy({
          where: {
            researcher_id: researcherId,
            milestone_id: {
              [Op.in]: projectMilestoneIds
            }
          },
          transaction
        });
      }

      if (requestedMilestoneIds.length > 0) {
        await MilestoneResearcher.bulkCreate(
          requestedMilestoneIds.map((milestoneId) => ({
            milestone_id: milestoneId,
            researcher_id: researcherId,
            assigned_by: req.user.id
          })),
          { transaction }
        );
      }
    });

    const effectiveAccess = await getResearcherMilestoneAccess({
      projectId,
      researcherId
    });

    await notificationService.createNotification({
      userId: researcherId,
      type: 'milestone_updated',
      title: 'Milestone Access Updated',
      message: wholeProject
        ? 'You now have full milestone access for this project.'
        : 'Your milestone assignments were updated for this project.',
      link: `/projects/${projectId}/milestones`,
      metadata: {
        project_id: projectId,
        whole_project: wholeProject,
        milestone_ids: effectiveAccess.milestoneIds
      }
    });

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.PROJECT_RESEARCHER_ACCESS_UPDATED,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: {
        researcher_id: researcherId,
        whole_project: wholeProject,
        milestone_ids: effectiveAccess.milestoneIds
      }
    });

    return res.json({
      message: 'Researcher access updated successfully',
      project_id: projectId,
      researcher: researcher.toSafeObject ? researcher.toSafeObject() : researcher,
      whole_project: effectiveAccess.wholeProject,
      milestone_ids: effectiveAccess.milestoneIds
    });
  } catch (error) {
    console.error('Set project researcher access error:', error);
    return res.status(500).json({ error: 'Failed to update researcher access' });
  }
};

/**
 * Submit a revision request for a completed milestone.
 * POST /api/projects/:projectId/milestones/:id/request-revision
 */
exports.requestMilestoneRevision = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const milestoneId = asInt(req.params.id);
    const reason = parseOptionalText(req.body.reason);

    if (!projectId || !milestoneId) {
      return res.status(400).json({ error: 'Invalid project or milestone id' });
    }
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const milestone = await loadMilestoneForProject(projectId, milestoneId);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const canAccess = await canResearcherAccessMilestone({
      researcherId: req.user.id,
      projectId,
      milestoneId
    });
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied. You are not assigned to this milestone' });
    }

    if (!NONPROFIT_MANAGED_REVIEWABLE_STATUSES.has(milestone.status)) {
      return res.status(400).json({
        error: 'Revision requests can only be created for completed milestones'
      });
    }

    const existingPending = await MilestoneRevisionRequest.findOne({
      where: {
        milestone_id: milestoneId,
        status: 'pending'
      }
    });
    if (existingPending) {
      return res.status(409).json({
        error: 'A pending revision request already exists for this milestone'
      });
    }

    const revisionRequest = await sequelize.transaction(async (transaction) => {
      const created = await MilestoneRevisionRequest.create({
        milestone_id: milestoneId,
        requested_by: req.user.id,
        reason,
        status: 'pending'
      }, { transaction });

      if (milestone.status === 'completed') {
        milestone.status = 'revision_requested';
        await milestone.save({ transaction });
      }

      return created;
    });

    const nonprofitUsers = await User.findAll({
      where: {
        role: 'nonprofit',
        org_id: project.org_id
      },
      attributes: ['id']
    });
    const nonprofitUserIds = nonprofitUsers.map((user) => user.id);
    if (nonprofitUserIds.length > 0) {
      await notificationService.createBulkNotifications(nonprofitUserIds, {
        type: 'milestone_revision_requested',
        title: 'Milestone Revision Requested',
        message: `A researcher requested revision for milestone "${milestone.name}".`,
        link: `/projects/${projectId}/milestones`,
        metadata: {
          project_id: projectId,
          milestone_id: milestoneId,
          revision_request_id: revisionRequest.id,
          requested_by: req.user.id
        }
      });
    }

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.MILESTONE_REVISION_REQUESTED,
      entityType: 'MILESTONE',
      entityId: milestoneId,
      metadata: {
        project_id: projectId,
        revision_request_id: revisionRequest.id
      }
    });

    return res.status(201).json({
      message: 'Milestone revision request submitted',
      revision_request: revisionRequest.toSafeObject()
    });
  } catch (error) {
    console.error('Request milestone revision error:', error);
    return res.status(500).json({ error: 'Failed to submit milestone revision request' });
  }
};

/**
 * List revision requests for milestone.
 * GET /api/projects/:projectId/milestones/:id/revisions
 */
exports.listMilestoneRevisionRequests = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const milestoneId = asInt(req.params.id);

    if (!projectId || !milestoneId) {
      return res.status(400).json({ error: 'Invalid project or milestone id' });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const milestone = await loadMilestoneForProject(projectId, milestoneId);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const isOwnerNonprofit = req.user.role === 'nonprofit' && req.user.org_id === project.org_id;
    const canReviewAll = isOwnerNonprofit || isAdminUser(req.user);

    let where = { milestone_id: milestoneId };
    if (!canReviewAll) {
      const canAccess = await canResearcherAccessMilestone({
        researcherId: req.user.id,
        projectId,
        milestoneId
      });
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      where = {
        ...where,
        requested_by: req.user.id
      };
    }

    const requests = await MilestoneRevisionRequest.findAll({
      where,
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json({
      project_id: projectId,
      milestone_id: milestoneId,
      count: requests.length,
      revision_requests: requests.map((request) => request.toSafeObject())
    });
  } catch (error) {
    console.error('List milestone revision requests error:', error);
    return res.status(500).json({ error: 'Failed to list milestone revision requests' });
  }
};

/**
 * Approve milestone revision request.
 * POST /api/projects/:projectId/milestones/:id/revisions/:revisionId/approve
 */
exports.approveMilestoneRevisionRequest = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const milestoneId = asInt(req.params.id);
    const revisionId = asInt(req.params.revisionId);
    const feedback = parseOptionalText(req.body.feedback);

    if (!projectId || !milestoneId || !revisionId) {
      return res.status(400).json({ error: 'Invalid request identifiers' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error && !isAdminUser(req.user)) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const milestone = await loadMilestoneForProject(projectId, milestoneId);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const revisionRequest = await loadRevisionRequestForMilestone(milestoneId, revisionId);
    if (!revisionRequest) {
      return res.status(404).json({ error: 'Revision request not found' });
    }
    if (revisionRequest.status !== 'pending') {
      return res.status(409).json({ error: 'Revision request has already been resolved' });
    }

    await sequelize.transaction(async (transaction) => {
      revisionRequest.status = 'approved';
      revisionRequest.reviewed_by = req.user.id;
      revisionRequest.reviewed_at = new Date();
      revisionRequest.feedback = feedback;
      await revisionRequest.save({ transaction });

      milestone.status = 'revision_in_progress';
      milestone.completed_at = null;
      await milestone.save({ transaction });
    });

    await notificationService.createNotification({
      userId: revisionRequest.requested_by,
      type: 'milestone_revision_approved',
      title: 'Milestone Revision Approved',
      message: `Your revision request for milestone "${milestone.name}" was approved.`,
      link: `/projects/${projectId}/milestones`,
      metadata: {
        project_id: projectId,
        milestone_id: milestoneId,
        revision_request_id: revisionId
      }
    });

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.MILESTONE_REVISION_APPROVED,
      entityType: 'MILESTONE',
      entityId: milestoneId,
      metadata: {
        project_id: projectId,
        revision_request_id: revisionId,
        feedback
      }
    });

    return res.json({
      message: 'Revision request approved',
      revision_request: revisionRequest.toSafeObject(),
      milestone: milestone.toSafeObject()
    });
  } catch (error) {
    console.error('Approve milestone revision request error:', error);
    return res.status(500).json({ error: 'Failed to approve revision request' });
  }
};

/**
 * Reject milestone revision request.
 * POST /api/projects/:projectId/milestones/:id/revisions/:revisionId/reject
 */
exports.rejectMilestoneRevisionRequest = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const milestoneId = asInt(req.params.id);
    const revisionId = asInt(req.params.revisionId);
    const feedback = parseOptionalText(req.body.feedback);

    if (!projectId || !milestoneId || !revisionId) {
      return res.status(400).json({ error: 'Invalid request identifiers' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error && !isAdminUser(req.user)) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const milestone = await loadMilestoneForProject(projectId, milestoneId);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    const revisionRequest = await loadRevisionRequestForMilestone(milestoneId, revisionId);
    if (!revisionRequest) {
      return res.status(404).json({ error: 'Revision request not found' });
    }
    if (revisionRequest.status !== 'pending') {
      return res.status(409).json({ error: 'Revision request has already been resolved' });
    }

    await sequelize.transaction(async (transaction) => {
      revisionRequest.status = 'rejected';
      revisionRequest.reviewed_by = req.user.id;
      revisionRequest.reviewed_at = new Date();
      revisionRequest.feedback = feedback;
      await revisionRequest.save({ transaction });

      const pendingCount = await MilestoneRevisionRequest.count({
        where: {
          milestone_id: milestoneId,
          status: 'pending'
        },
        transaction
      });

      if (pendingCount === 0 && milestone.status === 'revision_requested') {
        milestone.status = 'completed';
        await milestone.save({ transaction });
      }
    });

    await notificationService.createNotification({
      userId: revisionRequest.requested_by,
      type: 'milestone_revision_rejected',
      title: 'Milestone Revision Rejected',
      message: `Your revision request for milestone "${milestone.name}" was rejected.`,
      link: `/projects/${projectId}/milestones`,
      metadata: {
        project_id: projectId,
        milestone_id: milestoneId,
        revision_request_id: revisionId,
        feedback
      }
    });

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.MILESTONE_REVISION_REJECTED,
      entityType: 'MILESTONE',
      entityId: milestoneId,
      metadata: {
        project_id: projectId,
        revision_request_id: revisionId,
        feedback
      }
    });

    return res.json({
      message: 'Revision request rejected',
      revision_request: revisionRequest.toSafeObject()
    });
  } catch (error) {
    console.error('Reject milestone revision request error:', error);
    return res.status(500).json({ error: 'Failed to reject revision request' });
  }
};

/**
 * Create milestone request by researcher.
 * POST /api/projects/:projectId/milestones/requests
 */
exports.createMilestoneRequest = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const name = parseOptionalText(req.body.name);
    const description = parseOptionalText(req.body.description);
    const dueDate = req.body.due_date || null;
    const justification = parseOptionalText(req.body.justification);

    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!justification) {
      return res.status(400).json({ error: 'justification is required' });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const hasAcceptedAccess = await hasAcceptedProjectParticipation({
      researcherId: req.user.id,
      projectId
    });
    if (!hasAcceptedAccess) {
      return res.status(403).json({ error: 'Only accepted project researchers can request milestones' });
    }

    if (dueDate) {
      const dueDateObj = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDateObj < today) {
        return res.status(400).json({ error: 'due_date must be today or in the future' });
      }
    }

    const requestRecord = await MilestoneRequest.create({
      project_id: projectId,
      requested_by: req.user.id,
      name,
      description,
      due_date: dueDate,
      justification,
      status: 'pending'
    });

    const nonprofitUsers = await User.findAll({
      where: {
        role: 'nonprofit',
        org_id: project.org_id
      },
      attributes: ['id']
    });
    const nonprofitUserIds = nonprofitUsers.map((user) => user.id);
    if (nonprofitUserIds.length > 0) {
      await notificationService.createBulkNotifications(nonprofitUserIds, {
        type: 'milestone_request_created',
        title: 'New Milestone Request',
        message: `A researcher requested a new milestone: "${name}".`,
        link: `/projects/${projectId}/milestones`,
        metadata: {
          project_id: projectId,
          milestone_request_id: requestRecord.id,
          requested_by: req.user.id
        }
      });
    }

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.MILESTONE_REQUEST_CREATED,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: {
        milestone_request_id: requestRecord.id
      }
    });

    return res.status(201).json({
      message: 'Milestone request submitted',
      milestone_request: requestRecord.toSafeObject()
    });
  } catch (error) {
    console.error('Create milestone request error:', error);
    return res.status(500).json({ error: 'Failed to create milestone request' });
  }
};

/**
 * List milestone creation requests.
 * GET /api/projects/:projectId/milestones/requests
 */
exports.listMilestoneRequests = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwnerNonprofit = req.user.role === 'nonprofit' && req.user.org_id === project.org_id;
    const canReviewAll = isOwnerNonprofit || isAdminUser(req.user);

    if (!canReviewAll) {
      const hasAcceptedAccess = await hasAcceptedProjectParticipation({
        researcherId: req.user.id,
        projectId
      });
      if (!hasAcceptedAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const where = canReviewAll
      ? { project_id: projectId }
      : { project_id: projectId, requested_by: req.user.id };

    const requests = await MilestoneRequest.findAll({
      where,
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Milestone,
          as: 'createdMilestone',
          attributes: ['id', 'name', 'status']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json({
      project_id: projectId,
      count: requests.length,
      milestone_requests: requests.map((request) => request.toSafeObject())
    });
  } catch (error) {
    console.error('List milestone requests error:', error);
    return res.status(500).json({ error: 'Failed to list milestone requests' });
  }
};

/**
 * Approve milestone creation request.
 * POST /api/projects/:projectId/milestones/requests/:requestId/approve
 */
exports.approveMilestoneRequest = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const requestId = asInt(req.params.requestId);
    const feedback = parseOptionalText(req.body.feedback);

    if (!projectId || !requestId) {
      return res.status(400).json({ error: 'Invalid project or request id' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error && !isAdminUser(req.user)) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const requestRecord = await findMilestoneRequestForProject(projectId, requestId);
    if (!requestRecord) {
      return res.status(404).json({ error: 'Milestone request not found' });
    }
    if (requestRecord.status !== 'pending') {
      return res.status(409).json({ error: 'Milestone request has already been reviewed' });
    }

    const createdMilestone = await sequelize.transaction(async (transaction) => {
      requestRecord.status = 'approved';
      requestRecord.reviewed_by = req.user.id;
      requestRecord.reviewed_at = new Date();
      requestRecord.feedback = feedback;
      await requestRecord.save({ transaction });

      const milestone = await Milestone.create({
        project_id: projectId,
        name: requestRecord.name,
        description: requestRecord.description,
        due_date: requestRecord.due_date,
        status: 'pending'
      }, { transaction });

      requestRecord.created_milestone_id = milestone.id;
      await requestRecord.save({ transaction });

      await MilestoneResearcher.findOrCreate({
        where: {
          milestone_id: milestone.id,
          researcher_id: requestRecord.requested_by
        },
        defaults: {
          milestone_id: milestone.id,
          researcher_id: requestRecord.requested_by,
          assigned_by: req.user.id
        },
        transaction
      });

      return milestone;
    });

    await notificationService.createNotification({
      userId: requestRecord.requested_by,
      type: 'milestone_request_approved',
      title: 'Milestone Request Approved',
      message: `Your milestone request "${requestRecord.name}" was approved.`,
      link: `/projects/${projectId}/milestones`,
      metadata: {
        project_id: projectId,
        milestone_request_id: requestId,
        milestone_id: createdMilestone.id
      }
    });

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.MILESTONE_REQUEST_APPROVED,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: {
        milestone_request_id: requestId,
        created_milestone_id: createdMilestone.id
      }
    });

    return res.json({
      message: 'Milestone request approved',
      milestone_request: requestRecord.toSafeObject(),
      milestone: createdMilestone.toSafeObject()
    });
  } catch (error) {
    console.error('Approve milestone request error:', error);
    return res.status(500).json({ error: 'Failed to approve milestone request' });
  }
};

/**
 * Reject milestone creation request.
 * POST /api/projects/:projectId/milestones/requests/:requestId/reject
 */
exports.rejectMilestoneRequest = async (req, res) => {
  try {
    const projectId = asInt(req.params.projectId);
    const requestId = asInt(req.params.requestId);
    const feedback = parseOptionalText(req.body.feedback);

    if (!projectId || !requestId) {
      return res.status(400).json({ error: 'Invalid project or request id' });
    }

    const ownership = await loadProjectAndNonprofitUser(projectId, req.user.id);
    if (ownership.error && !isAdminUser(req.user)) {
      return res.status(ownership.error.status).json({ error: ownership.error.message });
    }

    const requestRecord = await findMilestoneRequestForProject(projectId, requestId);
    if (!requestRecord) {
      return res.status(404).json({ error: 'Milestone request not found' });
    }
    if (requestRecord.status !== 'pending') {
      return res.status(409).json({ error: 'Milestone request has already been reviewed' });
    }

    requestRecord.status = 'rejected';
    requestRecord.reviewed_by = req.user.id;
    requestRecord.reviewed_at = new Date();
    requestRecord.feedback = feedback;
    await requestRecord.save();

    await notificationService.createNotification({
      userId: requestRecord.requested_by,
      type: 'milestone_request_rejected',
      title: 'Milestone Request Rejected',
      message: `Your milestone request "${requestRecord.name}" was rejected.`,
      link: `/projects/${projectId}/milestones`,
      metadata: {
        project_id: projectId,
        milestone_request_id: requestId,
        feedback
      }
    });

    void logAudit({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.MILESTONE_REQUEST_REJECTED,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: {
        milestone_request_id: requestId,
        feedback
      }
    });

    return res.json({
      message: 'Milestone request rejected',
      milestone_request: requestRecord.toSafeObject()
    });
  } catch (error) {
    console.error('Reject milestone request error:', error);
    return res.status(500).json({ error: 'Failed to reject milestone request' });
  }
};

/**
 * Get milestone statistics for a project
 * GET /api/projects/:projectId/milestones/stats
 */
exports.getMilestoneStats = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify project exists
    const project = await Project.findOne({
      where: { project_id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Authorization: only the owning nonprofit, or an admin, can view stats
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const isOwner = req.user.role === 'nonprofit' && project.org_id === req.user.org_id;
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all milestones for the project
    const milestones = await Milestone.findAll({
      where: { project_id: projectId }
    });

    const total = milestones.length;
    const pending = milestones.filter(m => m.status === 'pending').length;
    const in_progress = milestones.filter(m => m.status === 'in_progress').length;
    const revision_requested = milestones.filter(m => m.status === 'revision_requested').length;
    const revision_in_progress = milestones.filter(m => m.status === 'revision_in_progress').length;
    const completed = milestones.filter(m => m.status === 'completed').length;
    const cancelled = milestones.filter(m => m.status === 'cancelled').length;
    const overdue = milestones.filter(m => m.isOverdue()).length;

    const completion_rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({
      project_id: parseInt(projectId),
      stats: {
        total,
        pending,
        in_progress,
        revision_requested,
        revision_in_progress,
        completed,
        cancelled,
        overdue,
        completion_rate
      }
    });

  } catch (error) {
    console.error('Get milestone stats error:', error);
    res.status(500).json({ error: 'Failed to fetch milestone statistics' });
  }
};
