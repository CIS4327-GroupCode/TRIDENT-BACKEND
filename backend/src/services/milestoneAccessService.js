const { Application, MilestoneResearcher, ProjectResearcherAccess, Milestone } = require('../database/models');

function isMissingProjectResearcherAccessTable(error) {
  const code = error?.original?.code || error?.parent?.code;
  const message = String(error?.original?.message || error?.parent?.message || error?.message || '').toLowerCase();
  return code === '42P01' && message.includes('project_researcher_access');
}

async function hasAcceptedProjectParticipation({ researcherId, projectId, transaction }) {
  const record = await Application.findOne({
    where: {
      researcher_id: researcherId,
      project_id: projectId,
      status: 'accepted'
    },
    transaction
  });

  return Boolean(record);
}

async function hasWholeProjectAccess({ researcherId, projectId, transaction }) {
  let access;
  try {
    access = await ProjectResearcherAccess.findOne({
      where: {
        project_id: projectId,
        researcher_id: researcherId,
        whole_project: true
      },
      transaction
    });
  } catch (error) {
    if (isMissingProjectResearcherAccessTable(error)) {
      return false;
    }
    throw error;
  }

  return Boolean(access);
}

async function isResearcherAssignedToMilestone({ researcherId, milestoneId, transaction }) {
  const assignment = await MilestoneResearcher.findOne({
    where: {
      milestone_id: milestoneId,
      researcher_id: researcherId
    },
    transaction
  });

  return Boolean(assignment);
}

async function canResearcherAccessMilestone({ researcherId, projectId, milestoneId, transaction }) {
  const hasAcceptedParticipation = await hasAcceptedProjectParticipation({
    researcherId,
    projectId,
    transaction
  });

  if (!hasAcceptedParticipation) {
    return false;
  }

  const hasProjectWideAccess = await hasWholeProjectAccess({
    researcherId,
    projectId,
    transaction
  });

  if (hasProjectWideAccess) {
    return true;
  }

  return isResearcherAssignedToMilestone({
    researcherId,
    milestoneId,
    transaction
  });
}

async function getResearcherMilestoneAccess({ researcherId, projectId, transaction }) {
  const wholeProject = await hasWholeProjectAccess({ researcherId, projectId, transaction });

  if (wholeProject) {
    const milestones = await Milestone.findAll({
      where: { project_id: projectId },
      attributes: ['id'],
      transaction
    });

    return {
      wholeProject: true,
      milestoneIds: milestones.map((milestone) => milestone.id)
    };
  }

  const assignments = await MilestoneResearcher.findAll({
    include: [
      {
        model: Milestone,
        as: 'milestone',
        attributes: ['id'],
        where: { project_id: projectId },
        required: true
      }
    ],
    where: { researcher_id: researcherId },
    attributes: ['milestone_id'],
    transaction
  });

  return {
    wholeProject: false,
    milestoneIds: assignments.map((assignment) => assignment.milestone_id)
  };
}

module.exports = {
  hasAcceptedProjectParticipation,
  hasWholeProjectAccess,
  isResearcherAssignedToMilestone,
  canResearcherAccessMilestone,
  getResearcherMilestoneAccess
};