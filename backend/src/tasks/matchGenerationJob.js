const schedule = require('node-schedule');
const { Op } = require('sequelize');
const {
  Project,
  Organization,
  ResearcherProfile,
  User,
  Match,
  Notification
} = require('../database/models');
const matchingService = require('../services/matchingService');
const notificationService = require('../services/notificationService');

const DEFAULT_THRESHOLD = 70;
const DEDUP_DAYS = 7;

const isHighScore = (score) => {
  const threshold = Number(process.env.MATCH_NOTIFICATION_THRESHOLD || DEFAULT_THRESHOLD);
  return Number(score) >= threshold;
};

async function hasRecentMatchNotification(userId, projectId) {
  const cutoff = new Date(Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000);
  const notifications = await Notification.findAll({
    where: {
      user_id: userId,
      type: 'new_match_available',
      created_at: {
        [Op.gte]: cutoff
      }
    },
    attributes: ['metadata']
  });

  return notifications.some((n) => Number(n.metadata?.project_id) === Number(projectId));
}

async function upsertMatch(project, researcher, scoreData) {
  const existing = await Match.findOne({
    where: {
      brief_id: project.project_id,
      researcher_id: researcher.user_id
    }
  });

  if (existing) {
    const preservedDismissed = existing.dismissed;
    existing.score = scoreData.totalScore;
    existing.score_breakdown = scoreData.breakdown;
    existing.calculated_at = new Date();
    existing.dismissed = preservedDismissed;
    await existing.save();
    return { created: false, match: existing };
  }

  const created = await Match.create({
    brief_id: project.project_id,
    researcher_id: researcher.user_id,
    score: scoreData.totalScore,
    score_breakdown: scoreData.breakdown,
    dismissed: false,
    calculated_at: new Date()
  });

  return { created: true, match: created };
}

async function generateMatches() {
  const projects = await Project.findAll({
    where: {
      status: 'open'
    }
  });

  if (projects.length === 0) {
    return {
      projectsProcessed: 0,
      matchesCreated: 0,
      matchesUpdated: 0,
      notificationsSent: 0
    };
  }

  const researchers = await ResearcherProfile.findAll({
    where: {
      user_id: {
        [Op.ne]: null
      }
    }
  });

  if (researchers.length === 0) {
    return {
      projectsProcessed: projects.length,
      matchesCreated: 0,
      matchesUpdated: 0,
      notificationsSent: 0
    };
  }

  const users = await User.findAll({
    where: {
      id: researchers.map((r) => r.user_id),
      account_status: 'active',
      deleted_at: null
    },
    attributes: ['id', 'name']
  });

  const activeUserIds = new Set(users.map((u) => u.id));
  const activeResearchers = researchers.filter((r) => activeUserIds.has(r.user_id));

  let matchesCreated = 0;
  let matchesUpdated = 0;
  let notificationsSent = 0;

  for (const project of projects) {
    const organization = await Organization.findByPk(project.org_id);
    const projectData = project.toJSON();
    projectData.organization = organization ? organization.toJSON() : null;

    for (const researcher of activeResearchers) {
      const scoreData = matchingService.calculateMatchScore(projectData, researcher.toJSON());
      const { created } = await upsertMatch(project, researcher, scoreData);

      if (created) {
        matchesCreated += 1;
      } else {
        matchesUpdated += 1;
      }

      if (isHighScore(scoreData.totalScore)) {
        const alreadyNotified = await hasRecentMatchNotification(researcher.user_id, project.project_id);

        if (!alreadyNotified) {
          await notificationService.createNotification({
            userId: researcher.user_id,
            type: 'new_match_available',
            title: 'New Project Match',
            message: `You have a new high-scoring match (${Math.round(scoreData.totalScore)}%) for "${project.title}".`,
            link: '/dashboard/researcher?tab=tentative',
            metadata: {
              project_id: project.project_id,
              project_title: project.title,
              match_score: scoreData.totalScore
            }
          });

          notificationsSent += 1;
        }
      }
    }
  }

  return {
    projectsProcessed: projects.length,
    matchesCreated,
    matchesUpdated,
    notificationsSent
  };
}

function scheduleMatchGeneration() {
  const cron = process.env.MATCH_GENERATION_CRON || '0 3 * * *';

  schedule.scheduleJob(cron, async () => {
    try {
      const summary = await generateMatches();
      console.log('[matchGenerationJob] Completed:', summary);
    } catch (error) {
      console.error('[matchGenerationJob] Failed:', error.message);
    }
  });

  console.log(`[matchGenerationJob] Scheduled with cron: ${cron}`);
}

module.exports = {
  generateMatches,
  scheduleMatchGeneration
};
