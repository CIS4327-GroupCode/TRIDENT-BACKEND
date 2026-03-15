const schedule = require('node-schedule');
const { Op } = require('sequelize');
const {
  Milestone,
  Project,
  Application,
  User,
  Notification
} = require('../database/models');
const notificationService = require('../services/notificationService');

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfToday = () => {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
};

const hasNotificationToday = async (userId, type, milestoneId) => {
  const existing = await Notification.findOne({
    where: {
      user_id: userId,
      type,
      created_at: {
        [Op.gte]: startOfToday(),
        [Op.lt]: endOfToday()
      },
      metadata: {
        [Op.contains]: {
          milestone_id: milestoneId
        }
      }
    }
  });

  return !!existing;
};

const getRecipientsForProject = async (project) => {
  const nonprofitUsers = await User.findAll({
    where: {
      org_id: project.org_id,
      role: 'nonprofit'
    },
    attributes: ['id']
  });

  // TODO(UC8/UC9-F3): Scope researcher notifications by project when Application supports project_id.
  const acceptedResearchers = await Application.findAll({
    where: {
      org_id: project.org_id,
      status: 'accepted'
    },
    attributes: ['researcher_id']
  });

  const ids = new Set();
  nonprofitUsers.forEach((user) => ids.add(user.id));
  acceptedResearchers.forEach((app) => ids.add(app.researcher_id));

  return Array.from(ids);
};

const notifyMilestoneUsers = async ({ milestone, type, title, message, extraMetadata = {} }) => {
  const project = milestone.project;
  if (!project) {
    return 0;
  }

  const recipientIds = await getRecipientsForProject(project);
  const link = `/projects/${project.project_id}/milestones`;

  let createdCount = 0;
  for (const userId of recipientIds) {
    const alreadySent = await hasNotificationToday(userId, type, milestone.id);
    if (alreadySent) {
      continue;
    }

    const created = await notificationService.createNotification({
      userId,
      type,
      title,
      message,
      link,
      metadata: {
        milestone_id: milestone.id,
        milestone_name: milestone.name,
        project_id: project.project_id,
        ...extraMetadata
      }
    });

    if (created) {
      createdCount += 1;
    }
  }

  return createdCount;
};

const checkOverdueMilestones = async () => {
  const now = new Date();
  const milestones = await Milestone.findAll({
    where: {
      due_date: { [Op.lt]: now },
      status: { [Op.notIn]: ['completed', 'cancelled'] }
    },
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['project_id', 'org_id']
      }
    ]
  });

  let notificationCount = 0;
  for (const milestone of milestones) {
    const count = await notifyMilestoneUsers({
      milestone,
      type: 'milestone_overdue',
      title: 'Milestone Overdue',
      message: `Milestone "${milestone.name}" is overdue and needs attention.`
    });
    notificationCount += count;
  }

  return { milestonesChecked: milestones.length, notificationsCreated: notificationCount };
};

const checkApproachingDeadlines = async () => {
  const today = startOfToday();
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const milestones = await Milestone.findAll({
    where: {
      due_date: {
        [Op.gte]: today,
        [Op.lte]: threeDaysFromNow
      },
      status: { [Op.notIn]: ['completed', 'cancelled'] }
    },
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['project_id', 'org_id']
      }
    ]
  });

  let notificationCount = 0;
  for (const milestone of milestones) {
    const daysUntilDue = milestone.daysUntilDue();
    const count = await notifyMilestoneUsers({
      milestone,
      type: 'milestone_deadline_approaching',
      title: 'Milestone Deadline Approaching',
      message: `Milestone "${milestone.name}" is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
      extraMetadata: {
        days_until_due: daysUntilDue
      }
    });
    notificationCount += count;
  }

  return { milestonesChecked: milestones.length, notificationsCreated: notificationCount };
};

const scheduleDeadlineChecks = () => {
  const job = schedule.scheduleJob('0 8 * * *', async () => {
    try {
      await checkOverdueMilestones();
      await checkApproachingDeadlines();
    } catch (error) {
      console.error('[Milestone Deadline Checker] Scheduled run failed:', error.message);
    }
  });

  console.log('[Milestone Deadline Checker] Daily checks scheduled for 8 AM');
  return job;
};

module.exports = {
  checkOverdueMilestones,
  checkApproachingDeadlines,
  scheduleDeadlineChecks
};
