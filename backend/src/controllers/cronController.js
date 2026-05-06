const notificationCleanup = require('../tasks/notificationCleanup');
const milestoneDeadlineChecker = require('../tasks/milestoneDeadlineChecker');
const matchGenerationJob = require('../tasks/matchGenerationJob');

const buildJobResponse = (job, result) => ({
  ok: true,
  job,
  executedAt: new Date().toISOString(),
  result,
});

exports.runNotificationCleanup = async (req, res) => {
  try {
    const result = await notificationCleanup.runCleanup();
    return res.json(buildJobResponse('notification-cleanup', result));
  } catch (error) {
    console.error('[cron] notification cleanup failed:', error);
    return res.status(500).json({
      ok: false,
      job: 'notification-cleanup',
      error: error.message || 'Notification cleanup failed',
    });
  }
};

exports.runMilestoneDeadlineChecks = async (req, res) => {
  try {
    const [overdue, approaching] = await Promise.all([
      milestoneDeadlineChecker.checkOverdueMilestones(),
      milestoneDeadlineChecker.checkApproachingDeadlines(),
    ]);

    return res.json(
      buildJobResponse('milestone-deadline-checks', {
        overdue,
        approaching,
      })
    );
  } catch (error) {
    console.error('[cron] milestone deadline checks failed:', error);
    return res.status(500).json({
      ok: false,
      job: 'milestone-deadline-checks',
      error: error.message || 'Milestone deadline checks failed',
    });
  }
};

exports.runMatchGeneration = async (req, res) => {
  try {
    const result = await matchGenerationJob.generateMatches();
    return res.json(buildJobResponse('match-generation', result));
  } catch (error) {
    console.error('[cron] match generation failed:', error);
    return res.status(500).json({
      ok: false,
      job: 'match-generation',
      error: error.message || 'Match generation failed',
    });
  }
};