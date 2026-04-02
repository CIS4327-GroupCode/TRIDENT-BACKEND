const { Application, Project, ResearcherProfile } = require('../database/models');

const toInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

async function computeProjectsCompletedForUser(userId) {
  if (!userId) return 0;

  const rows = await Application.findAll({
    where: {
      researcher_id: userId,
      status: 'accepted',
    },
    attributes: ['project_id'],
    include: [
      {
        model: Project,
        as: 'project',
        required: true,
        attributes: [],
        where: {
          status: 'completed',
        },
      },
    ],
    group: ['Application.project_id'],
    raw: true,
  });

  return rows.length;
}

async function syncProjectsCompletedForUser(userId) {
  if (!userId) return 0;

  const completedProjects = await computeProjectsCompletedForUser(userId);

  const profile = await ResearcherProfile.findOne({
    where: { user_id: userId },
    attributes: ['user_id', 'projects_completed'],
  });

  if (!profile) {
    return completedProjects;
  }

  const currentValue = toInteger(profile.projects_completed);
  if (currentValue !== completedProjects) {
    await profile.update({ projects_completed: completedProjects });
  }

  return completedProjects;
}

async function syncProjectsCompletedForUsers(userIds = []) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return [];
  }

  return Promise.all(
    uniqueUserIds.map(async (userId) => ({
      userId,
      projectsCompleted: await syncProjectsCompletedForUser(userId),
    }))
  );
}

async function syncProjectsCompletedForProject(projectId) {
  if (!projectId) {
    return [];
  }

  const applications = await Application.findAll({
    where: {
      project_id: projectId,
      status: 'accepted',
    },
    attributes: ['researcher_id'],
    raw: true,
  });

  const userIds = applications
    .map((application) => application.researcher_id)
    .filter(Boolean);

  return syncProjectsCompletedForUsers(userIds);
}

async function syncAllProjectsCompleted() {
  const profiles = await ResearcherProfile.findAll({
    attributes: ['user_id'],
    raw: true,
  });

  const userIds = profiles.map((profile) => profile.user_id).filter(Boolean);
  return syncProjectsCompletedForUsers(userIds);
}

module.exports = {
  computeProjectsCompletedForUser,
  syncProjectsCompletedForUser,
  syncProjectsCompletedForUsers,
  syncProjectsCompletedForProject,
  syncAllProjectsCompleted,
};