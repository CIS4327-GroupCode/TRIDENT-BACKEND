#!/usr/bin/env node

/**
 * Compares source and target databases using row counts and key-based missing checks.
 */

const {
  parseArgs,
  assertSafety,
  redactPgUrl,
  createPool,
  fetchRows,
  closePools,
} = require('./db-sync-utils');

const args = parseArgs(process.argv.slice(2));
const sourceUrl = args['source-url'] || args._[0] || process.env.SOURCE_DATABASE_URL;
const targetUrl = args['target-url'] || args._[1] || process.env.TARGET_DATABASE_URL;
const expectedTargetHost = args['expect-target-host'];

if (!sourceUrl || !targetUrl) {
  console.error('Usage: node scripts/db-sync-diff.js --source-url <url> --target-url <url> [--expect-target-host <host-substring>]');
  process.exit(1);
}

let sourcePool;
let targetPool;

function toOrgKey(org) {
  return org.EIN ? `ein:${org.EIN}` : `name:${(org.name || '').trim().toLowerCase()}`;
}

function toProjectKey(projectTitle, orgKey) {
  return `${(projectTitle || '').trim().toLowerCase()}::${orgKey}`;
}

(async () => {
  try {
    const safety = assertSafety({ sourceUrl, targetUrl, expectedTargetHost });
    console.log('\nDiff safety check passed');
    console.log(`Source: ${redactPgUrl(sourceUrl)} (${safety.sourceHost})`);
    console.log(`Target: ${redactPgUrl(targetUrl)} (${safety.targetHost})`);

    sourcePool = createPool(sourceUrl);
    targetPool = createPool(targetUrl);

    const tables = [
      '_user',
      'organizations',
      'researcher_profiles',
      'user_preferences',
      'project_ideas',
      'milestones',
      'agreements',
      'contracts',
      'project_attachments',
      'messages',
      'notifications',
      'audit_logs',
      'matches',
      'ratings',
      'project_reviews',
      'saved_projects',
    ];

    console.log('\nRow counts:');
    console.log('table'.padEnd(24) + 'source'.padStart(10) + 'target'.padStart(10) + 'delta'.padStart(10));
    console.log('-'.repeat(54));

    for (const table of tables) {
      const sourceCountRows = await fetchRows(sourcePool, `SELECT COUNT(*)::int AS count FROM ${table}`);
      const targetCountRows = await fetchRows(targetPool, `SELECT COUNT(*)::int AS count FROM ${table}`);
      const sourceCount = sourceCountRows[0]?.count || 0;
      const targetCount = targetCountRows[0]?.count || 0;
      const delta = targetCount - sourceCount;
      console.log(
        table.padEnd(24) +
          String(sourceCount).padStart(10) +
          String(targetCount).padStart(10) +
          String(delta).padStart(10)
      );
    }

    console.log('\nKey-based missing checks in target:');

    const sourceUsers = await fetchRows(sourcePool, `SELECT email FROM _user`);
    const targetUsers = await fetchRows(targetPool, `SELECT email FROM _user`);
    const targetUserEmails = new Set(targetUsers.map((u) => (u.email || '').trim().toLowerCase()));
    const missingUsersCount = sourceUsers.reduce((count, user) => {
      const key = (user.email || '').trim().toLowerCase();
      return key && !targetUserEmails.has(key) ? count + 1 : count;
    }, 0);

    const sourceOrgs = await fetchRows(sourcePool, `SELECT name, "EIN" FROM organizations`);
    const targetOrgs = await fetchRows(targetPool, `SELECT name, "EIN" FROM organizations`);
    const targetOrgKeys = new Set(targetOrgs.map((org) => toOrgKey(org)));
    const missingOrganizationsCount = sourceOrgs.reduce((count, org) => {
      const key = toOrgKey(org);
      return !targetOrgKeys.has(key) ? count + 1 : count;
    }, 0);

    const sourceProjects = await fetchRows(
      sourcePool,
      `SELECT p.title, o.name, o."EIN" FROM project_ideas p JOIN organizations o ON o.id = p.org_id`
    );
    const targetProjects = await fetchRows(
      targetPool,
      `SELECT p.title, o.name, o."EIN" FROM project_ideas p JOIN organizations o ON o.id = p.org_id`
    );
    const targetProjectKeys = new Set(
      targetProjects.map((project) => toProjectKey(project.title, toOrgKey(project)))
    );
    const missingProjectsCount = sourceProjects.reduce((count, project) => {
      const key = toProjectKey(project.title, toOrgKey(project));
      return !targetProjectKeys.has(key) ? count + 1 : count;
    }, 0);

    console.log(`Users missing in target by email: ${missingUsersCount}`);
    console.log(`Organizations missing in target by EIN/name: ${missingOrganizationsCount}`);
    console.log(`Projects missing in target by title+org: ${missingProjectsCount}`);

    console.log('\nDiff report completed.');
  } catch (error) {
    console.error(`\nDiff failed: ${error.message}`);
    process.exit(1);
  } finally {
    await closePools([sourcePool, targetPool]);
  }
})();
