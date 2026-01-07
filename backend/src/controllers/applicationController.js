const { Project, Application, ResearcherProfile, User, Organization, UserPreferences } = require('../database/models');
const notificationService = require('../services/notificationService');
const { Op } = require('sequelize');

/**
 * Apply to a project as a researcher
 * POST /api/applications/projects/:projectId/apply
 */
exports.applyToProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;
    const { message } = req.body;

    // Verify user is a researcher
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'researcher') {
      return res.status(403).json({ error: 'Only researchers can apply to projects' });
    }

    // Verify researcher profile exists
    const researcherProfile = await ResearcherProfile.findOne({
      where: { user_id: userId }
    });
    if (!researcherProfile) {
      return res.status(404).json({ error: 'Researcher profile not found' });
    }

    // Verify project exists and is open
    const project = await Project.findByPk(projectId, {
      include: [{ model: Organization, as: 'organization' }]
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (project.status !== 'open') {
      return res.status(400).json({ error: 'Project is not open for applications' });
    }

    // Check if researcher already applied
    const existingApplication = await Application.findOne({
      where: {
        researcher_id: researcherProfile.user_id,
        org_id: project.org_id
        // Note: Application model needs project_id field; using org_id as partial match for now
      }
    });
    if (existingApplication && existingApplication.status === 'pending') {
      return res.status(409).json({ error: 'You have already applied to this project' });
    }

    // Create application
    const application = await Application.create({
      researcher_id: researcherProfile.user_id,
      org_id: project.org_id,
      status: 'pending',
      type: 'project_application',
      value: message || null,
      metadata: {
        project_id: projectId,
        project_title: project.title,
        researcher_name: user.name,
        applied_at: new Date().toISOString()
      }
    });

    // Get nonprofit owner of the project
    const nonprofitUser = await User.findOne({
      where: {
        org_id: project.org_id,
        role: 'nonprofit'
      }
    });

    // Notify nonprofit owner: application_received
    if (nonprofitUser) {
      await notificationService.createNotification({
        userId: nonprofitUser.id,
        type: 'application_received',
        title: 'New Project Application',
        message: `${user.name} has applied to your project "${project.title}".`,
        link: `/projects/${projectId}/applications`,
        metadata: {
          application_id: application.id,
          project_id: projectId,
          researcher_id: researcherProfile.user_id,
          researcher_name: user.name
        }
      });
    }

    // Notify researcher: application sent confirmation
    await notificationService.createNotification({
      userId: userId,
      type: 'application_received', // Reusing type; message indicates direction
      title: 'Application Submitted',
      message: `Your application to "${project.title}" has been submitted successfully.`,
      link: `/projects/${projectId}`,
      metadata: {
        application_id: application.id,
        project_id: projectId,
        project_title: project.title,
        direction: 'sent'
      }
    });

    res.status(201).json({
      message: 'Application submitted successfully',
      application: application.toSafeObject()
    });
  } catch (error) {
    console.error('Apply to project error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
};

/**
 * Get applications for a project (nonprofit only)
 * GET /api/applications/projects/:projectId
 */
exports.getProjectApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;
    const { status } = req.query;

    // Verify user is nonprofit
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'nonprofit') {
      return res.status(403).json({ error: 'Only nonprofits can view applications' });
    }

    // Verify project belongs to user's organization
    const project = await Project.findByPk(projectId);
    if (!project || project.org_id !== user.org_id) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    // Build query
    const where = { org_id: project.org_id };
    if (status) {
      where.status = status;
    }

    // Get applications with researcher details
    const applications = await Application.findAll({
      where,
      include: [
        {
          model: ResearcherProfile,
          as: 'researcher',
          attributes: ['user_id', 'affiliation', 'domains', 'methods'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      applications: applications.map(app => app.toSafeObject())
    });
  } catch (error) {
    console.error('Get project applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
};

/**
 * Accept an application (nonprofit only)
 * POST /api/applications/:applicationId/accept
 */
exports.acceptApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { applicationId } = req.params;

    // Verify user is nonprofit
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'nonprofit') {
      return res.status(403).json({ error: 'Only nonprofits can accept applications' });
    }

    // Get application
    const application = await Application.findByPk(applicationId, {
      include: [
        {
          model: ResearcherProfile,
          as: 'researcher'
        }
      ]
    });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Verify organization ownership
    if (application.org_id !== user.org_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application is not pending' });
    }

    // Update application status
    application.status = 'accepted';
    await application.save();

    // Get project and researcher details for notification
    const projectId = application.metadata?.project_id;
    const project = projectId ? await Project.findByPk(projectId) : null;
    const researcherUser = await User.findByPk(application.researcher_id);

    // Notify researcher: application_accepted
    if (researcherUser) {
      await notificationService.createNotification({
        userId: researcherUser.id,
        type: 'application_accepted',
        title: 'Application Accepted',
        message: `Your application to "${project?.title || 'the project'}" has been accepted!`,
        link: projectId ? `/projects/${projectId}` : '/dashboard/researcher',
        metadata: {
          application_id: application.id,
          project_id: projectId,
          project_title: project?.title
        }
      });
    }

    res.json({
      message: 'Application accepted',
      application: application.toSafeObject()
    });
  } catch (error) {
    console.error('Accept application error:', error);
    res.status(500).json({ error: 'Failed to accept application' });
  }
};

/**
 * Reject an application (nonprofit only)
 * POST /api/applications/:applicationId/reject
 */
exports.rejectApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { applicationId } = req.params;
    const { reason } = req.body;

    // Verify user is nonprofit
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'nonprofit') {
      return res.status(403).json({ error: 'Only nonprofits can reject applications' });
    }

    // Get application
    const application = await Application.findByPk(applicationId, {
      include: [
        {
          model: ResearcherProfile,
          as: 'researcher'
        }
      ]
    });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Verify organization ownership
    if (application.org_id !== user.org_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application is not pending' });
    }

    // Update application status
    application.status = 'rejected';
    application.metadata = application.metadata || {};
    application.metadata.rejection_reason = reason || null;
    await application.save();

    // Get project and researcher details for notification
    const projectId = application.metadata?.project_id;
    const project = projectId ? await Project.findByPk(projectId) : null;
    const researcherUser = await User.findByPk(application.researcher_id);

    // Notify researcher: application_rejected
    if (researcherUser) {
      await notificationService.createNotification({
        userId: researcherUser.id,
        type: 'application_rejected',
        title: 'Application Update',
        message: `Your application to "${project?.title || 'the project'}" was not selected at this time.${reason ? ` Feedback: ${reason}` : ''}`,
        link: projectId ? `/projects/${projectId}` : '/dashboard/researcher',
        metadata: {
          application_id: application.id,
          project_id: projectId,
          project_title: project?.title,
          rejection_reason: reason
        }
      });
    }

    res.json({
      message: 'Application rejected',
      application: application.toSafeObject()
    });
  } catch (error) {
    console.error('Reject application error:', error);
    res.status(500).json({ error: 'Failed to reject application' });
  }
};

/**
 * Get researcher's applications
 * GET /api/applications
 */
exports.getResearcherApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    // Verify user is researcher
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'researcher') {
      return res.status(403).json({ error: 'Only researchers can view their applications' });
    }

    const researcherProfile = await ResearcherProfile.findOne({
      where: { user_id: userId }
    });
    if (!researcherProfile) {
      return res.status(404).json({ error: 'Researcher profile not found' });
    }

    // Build query
    const where = { researcher_id: researcherProfile.user_id };
    if (status) {
      where.status = status;
    }

    // Get applications
    const applications = await Application.findAll({
      where,
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'mission']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      applications: applications.map(app => app.toSafeObject())
    });
  } catch (error) {
    console.error('Get researcher applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
};
