const Milestone = require('../database/models/Milestone');
const Project = require('../database/models/Project');
const User = require('../database/models/User');   // ⬅️ add this
const { Op } = require('sequelize');

/**
 * Create a new milestone for a project
 * POST /api/projects/:projectId/milestones
 */
exports.createMilestone = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, due_date, status } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Milestone name is required' });
    }

    // Verify project exists and user has access
    const project = await Project.findOne({
      where: { project_id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user is the project owner (nonprofit organization)
    // Check if user is the project owner
    // Check if user is the project owner (nonprofit organization)
    const user = await User.findByPk(req.user.id);

    if (!user || user.role !== 'nonprofit') {
      return res.status(403).json({
        error: 'Only nonprofit users can create milestones',
      });
    }

    // Debug so you can see what’s being compared (optional)
    console.log('Milestone create auth:', {
      userId: user.id,
      userOrgId: user.org_id,
      projectOrgId: project.org_id,
    });

    if (project.org_id !== user.org_id) {
      return res.status(403).json({
        error:
          "Access denied. You can only create milestones for your organization's projects",
      });
    }

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
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Create milestone
    const milestone = await Milestone.create({
      project_id: projectId,
      name: name.trim(),
      description: description?.trim() || null,
      due_date: due_date || null,
      status: status || 'pending',
      completed_at: status === 'completed' ? new Date() : null
    });

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
      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
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
      }
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
    const { name, description, due_date, status } = req.body;

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

    // Verify project ownership
    // Verify project ownership
const project = await Project.findOne({
  where: { project_id: projectId },
});

if (!project) {
  return res.status(404).json({ error: 'Project not found' });
}

// Load fresh user from DB
const user = await User.findByPk(req.user.id);

if (!user || user.role !== 'nonprofit') {
  return res.status(403).json({
    error: 'Only nonprofit users can update milestones',
  });
}

// Debug (optional)
console.log('Milestone update auth:', {
  userId: user.id,
  userOrgId: user.org_id,
  projectOrgId: project.org_id,
});

if (project.org_id !== user.org_id) {
  return res.status(403).json({
    error:
      "Access denied. You can only update milestones for your organization's projects",
  });
}

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Validate name if provided
    if (name !== undefined && (!name || name.trim() === '')) {
      return res.status(400).json({ error: 'Milestone name cannot be empty' });
    }

    // Prepare update object
    const updates = {};
    
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
    await milestone.update(updates);

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

    // Verify project ownership
    // Verify project ownership
const project = await Project.findOne({
  where: { project_id: projectId },
});

if (!project) {
  return res.status(404).json({ error: 'Project not found' });
}

// Load fresh user from DB
const user = await User.findByPk(req.user.id);

if (!user || user.role !== 'nonprofit') {
  return res.status(403).json({
    error: 'Only nonprofit users can delete milestones',
  });
}

// Debug (optional)
console.log('Milestone delete auth:', {
  userId: user.id,
  userOrgId: user.org_id,
  projectOrgId: project.org_id,
});

if (project.org_id !== user.org_id) {
  return res.status(403).json({
    error:
      "Access denied. You can only delete milestones for your organization's projects",
  });
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
