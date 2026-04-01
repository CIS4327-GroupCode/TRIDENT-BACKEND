const { Milestone, Project, User, Application } = require('../database/models');
const { Op } = require('sequelize');
const notificationService = require('../services/notificationService');

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

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
  // TODO(UC8/UC9-F3): Scope researcher notifications by project when Application supports project_id.
  const involvedResearchers = await Application.findAll({
    where: {
      org_id: project.org_id,
      status: 'accepted'
    }
  });

  return involvedResearchers.map((app) => app.researcher_id);
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

    // Get all milestones for the project
    const milestones = await Milestone.findAll({
      where: { project_id: projectId }
    });

    const total = milestones.length;
    const pending = milestones.filter(m => m.status === 'pending').length;
    const in_progress = milestones.filter(m => m.status === 'in_progress').length;
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
