require('dotenv').config();

const { sequelize } = require('../src/database/models');
const { syncAllProjectsCompleted } = require('../src/services/researcherMetricsService');

async function runBackfill() {
  try {
    console.log('[projects_completed_backfill] Starting synchronization...');
    const results = await syncAllProjectsCompleted();

    console.log(`[projects_completed_backfill] Synchronized ${results.length} researcher profile counters.`);
    results.forEach((result) => {
      console.log(`- user_id=${result.userId} projects_completed=${result.projectsCompleted}`);
    });

    console.log('[projects_completed_backfill] Completed successfully.');
    process.exitCode = 0;
  } catch (error) {
    console.error('[projects_completed_backfill] Failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

runBackfill();
