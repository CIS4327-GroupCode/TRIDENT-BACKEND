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
        project_id: project.project_id,
        type: 'project_application',
        status: 'pending'
      }
    });
    if (existingApplication) {
      return res.status(409).json({ error: 'You have already applied to this project' });
    }

    // Create application
    const application = await Application.create({
      researcher_id: researcherProfile.user_id,
      org_id: project.org_id,
      project_id: project.project_id,
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
    const where = {
      project_id: project.project_id,
      type: {
        [Op.ne]: 'invitation'
      }
    };
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

    const applicationProjectId = application.project_id || application.metadata?.project_id;
    if (applicationProjectId) {
      const project = await Project.findByPk(applicationProjectId);
      if (!project || project.org_id !== user.org_id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application is not pending' });
    }

    // Update application status
    application.status = 'accepted';
    await application.save();

    // Get project and researcher details for notification
    const projectId = application.project_id || application.metadata?.project_id;
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

    const applicationProjectId = application.project_id || application.metadata?.project_id;
    if (applicationProjectId) {
      const project = await Project.findByPk(applicationProjectId);
      if (!project || project.org_id !== user.org_id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
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
    const projectId = application.project_id || application.metadata?.project_id;
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

/**
 * Invite a researcher to a project (nonprofit only)
 * POST /api/applications/invite
 */
exports.inviteResearcher = async (req, res) => {
  try {
    const userId = req.user.id;
    const { researcherId, projectId, message } = req.body;

    if (!researcherId || !projectId) {
      return res.status(400).json({ error: 'researcherId and projectId are required' });
    }

    const user = await User.findByPk(userId);
    if (!user || user.role !== 'nonprofit') {
      return res.status(403).json({ error: 'Only nonprofits can invite researchers' });
    }

    // Verify project belongs to user's org and is open
    const project = await Project.findByPk(projectId);
    if (!project || project.org_id !== user.org_id) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }
    if (project.status !== 'open') {
      return res.status(400).json({ error: 'Project is not open for invitations' });
    }

    // Verify researcher exists
    const researcherProfile = await ResearcherProfile.findOne({ where: { user_id: researcherId } });
    if (!researcherProfile) {
      return res.status(404).json({ error: 'Researcher not found' });
    }

    // Check for duplicate pending invitation for same project
    const existingInvitations = await Application.findAll({
      where: {
        researcher_id: researcherId,
        org_id: user.org_id,
        project_id: project.project_id,
        type: 'invitation',
        status: 'pending'
      }
    });
    if (existingInvitations.length > 0) {
      return res.status(409).json({ error: 'Invitation already sent for this project' });
    }

    // Create invitation
    const invitation = await Application.create({
      researcher_id: researcherId,
      org_id: user.org_id,
      project_id: project.project_id,
      status: 'pending',
      type: 'invitation',
      value: message || null,
      metadata: {
        project_id: projectId,
        project_title: project.title,
        message: message || null,
        invited_by: userId,
        invited_by_name: user.name,
        invited_at: new Date().toISOString()
      }
    });

    // Notify researcher
    try {
      const org = await Organization.findByPk(user.org_id);
      await notificationService.createNotification({
        userId: researcherId,
        type: 'application_received',
        title: 'Project Invitation',
        message: `${user.name} from ${org?.name || 'an organization'} has invited you to the project "${project.title}".`,
        link: '/dashboard/researcher',
        metadata: {
          application_id: invitation.id,
          project_id: projectId,
          project_title: project.title,
          invitation: true,
          org_name: org?.name
        }
      });
    } catch (notifError) {
      console.error('Failed to create invitation notification:', notifError);
    }

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: invitation.toSafeObject()
    });
  } catch (error) {
    console.error('Invite researcher error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

/**
 * Get researcher's invitations
 * GET /api/applications/invitations
 */
exports.getResearcherInvitations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const where = {
      researcher_id: userId,
      type: 'invitation'
    };
    if (status) where.status = status;

    const invitations = await Application.findAll({
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

    res.json({ invitations: invitations.map(inv => inv.toSafeObject()) });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
};

/**
 * Accept or decline an invitation (researcher only)
 * POST /api/applications/:applicationId/respond
 */
exports.respondToInvitation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { applicationId } = req.params;
    const { response: invResponse } = req.body;

    if (!['accept', 'decline'].includes(invResponse)) {
      return res.status(400).json({ error: 'Response must be "accept" or "decline"' });
    }

    const invitation = await Application.findByPk(applicationId);
    if (!invitation || invitation.researcher_id !== userId) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    if (invitation.type !== 'invitation') {
      return res.status(400).json({ error: 'This is not an invitation' });
    }
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation is no longer pending' });
    }

    invitation.status = invResponse === 'accept' ? 'accepted' : 'rejected';
    invitation.metadata = {
      ...invitation.metadata,
      responded_at: new Date().toISOString(),
      response: invResponse
    };
    await invitation.save();

    // Notify nonprofit
    try {
      const nonprofitUser = await User.findOne({
        where: { org_id: invitation.org_id, role: 'nonprofit' }
      });
      const researcher = await User.findByPk(userId);

      if (nonprofitUser) {
        await notificationService.createNotification({
          userId: nonprofitUser.id,
          type: invResponse === 'accept' ? 'application_accepted' : 'application_rejected',
          title: invResponse === 'accept' ? 'Invitation Accepted' : 'Invitation Declined',
          message: `${researcher.name} has ${invResponse === 'accept' ? 'accepted' : 'declined'} your invitation to "${invitation.metadata?.project_title || 'the project'}".`,
          link: invitation.metadata?.project_id ? `/projects/${invitation.metadata.project_id}` : '/dashboard/nonprofit',
          metadata: {
            application_id: invitation.id,
            project_id: invitation.metadata?.project_id,
            researcher_name: researcher.name
          }
        });
      }
    } catch (notifError) {
      console.error('Failed to create response notification:', notifError);
    }

    res.json({
      message: `Invitation ${invResponse === 'accept' ? 'accepted' : 'declined'}`,
      invitation: invitation.toSafeObject()
    });
  } catch (error) {
    console.error('Respond to invitation error:', error);
    res.status(500).json({ error: 'Failed to respond to invitation' });
  }
};
