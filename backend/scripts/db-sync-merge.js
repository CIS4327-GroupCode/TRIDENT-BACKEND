#!/usr/bin/env node

/**
 * Non-destructive source -> target data merge.
 * Default mode is DRY RUN. Use --apply to execute writes.
 *
 * Scope for v1 implementation:
 * - _user (by email)
 * - organizations (by EIN or name)
 * - researcher_profiles (by user email)
 * - user_preferences (by user email)
 * - project_ideas (by title + org natural key)
 * - milestones (by project + name + due_date)
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
const apply = Boolean(args.apply);

if (!sourceUrl || !targetUrl) {
  console.error('Usage: node scripts/db-sync-merge.js --source-url <url> --target-url <url> [--expect-target-host <host-substring>] [--apply]');
  process.exit(1);
}

let sourcePool;
let targetPool;

function toOrgKey(org) {
  return org.EIN ? `ein:${org.EIN}` : `name:${(org.name || '').trim().toLowerCase()}`;
}

function toProjectKey(title, orgKey) {
  return `${(title || '').trim().toLowerCase()}::${orgKey}`;
}

async function upsertUsers(stats) {
  const sourceUsers = await fetchRows(
    sourcePool,
    `SELECT id, name, email, password_hash, role, account_status, mfa_enabled, created_at, updated_at, deleted_at FROM _user ORDER BY id ASC`
  );

  const targetUsers = await fetchRows(
    targetPool,
    `SELECT id, email FROM _user`
  );

  const targetByEmail = new Map(targetUsers.map((u) => [u.email.toLowerCase(), u]));
  const userIdMap = new Map();

  for (const user of sourceUsers) {
    const emailKey = user.email.toLowerCase();
    const existing = targetByEmail.get(emailKey);

    if (existing) {
      userIdMap.set(user.id, existing.id);
      stats.users.skipped += 1;
      continue;
    }

    stats.users.insert += 1;
    if (!apply) {
      continue;
    }

    const inserted = await fetchRows(
      targetPool,
      `
      INSERT INTO _user (name, email, password_hash, role, account_status, mfa_enabled, created_at, updated_at, deleted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id, email
      `,
      [
        user.name,
        user.email,
        user.password_hash,
        user.role,
        user.account_status,
        user.mfa_enabled,
        user.created_at,
        user.updated_at,
        user.deleted_at,
      ]
    );

    const insertedUser = inserted[0];
    targetByEmail.set(insertedUser.email.toLowerCase(), insertedUser);
    userIdMap.set(user.id, insertedUser.id);
  }

  return userIdMap;
}

async function upsertOrganizations(userIdMap, stats) {
  const sourceOrgs = await fetchRows(
    sourcePool,
    `SELECT id, name, "EIN", mission, type, location, website, focus_areas, budget_range, team_size, established_year, focus_tags, compliance_flags, contacts, user_id FROM organizations ORDER BY id ASC`
  );

  const targetOrgs = await fetchRows(
    targetPool,
    `SELECT id, name, "EIN" FROM organizations`
  );

  const targetByOrgKey = new Map(targetOrgs.map((org) => [toOrgKey(org), org]));
  const orgIdMap = new Map();

  for (const org of sourceOrgs) {
    const orgKey = toOrgKey(org);
    const existing = targetByOrgKey.get(orgKey);

    if (existing) {
      orgIdMap.set(org.id, existing.id);
      stats.organizations.skipped += 1;
      continue;
    }

    stats.organizations.insert += 1;
    if (!apply) {
      continue;
    }

    const mappedOwnerUserId = org.user_id ? userIdMap.get(org.user_id) || null : null;

    const inserted = await fetchRows(
      targetPool,
      `
      INSERT INTO organizations (name, "EIN", mission, type, location, website, focus_areas, budget_range, team_size, established_year, focus_tags, compliance_flags, contacts, user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id, name, "EIN"
      `,
      [
        org.name,
        org.EIN,
        org.mission,
        org.type,
        org.location,
        org.website,
        org.focus_areas,
        org.budget_range,
        org.team_size,
        org.established_year,
        org.focus_tags,
        org.compliance_flags,
        org.contacts,
        mappedOwnerUserId,
      ]
    );

    const insertedOrg = inserted[0];
    targetByOrgKey.set(toOrgKey(insertedOrg), insertedOrg);
    orgIdMap.set(org.id, insertedOrg.id);
  }

  return orgIdMap;
}

async function backfillUserOrgLinks(userIdMap, orgIdMap, stats) {
  const sourceUsersWithOrg = await fetchRows(
    sourcePool,
    `SELECT id, org_id FROM _user WHERE org_id IS NOT NULL`
  );

  for (const row of sourceUsersWithOrg) {
    const targetUserId = userIdMap.get(row.id);
    const targetOrgId = orgIdMap.get(row.org_id);

    if (!targetUserId || !targetOrgId) {
      continue;
    }

    const current = await fetchRows(
      targetPool,
      `SELECT org_id FROM _user WHERE id = $1`,
      [targetUserId]
    );

    if (!current.length || current[0].org_id === targetOrgId) {
      stats.userOrgLinks.skipped += 1;
      continue;
    }

    stats.userOrgLinks.update += 1;
    if (!apply) {
      continue;
    }

    await targetPool.query(
      `UPDATE _user SET org_id = $1, updated_at = NOW() WHERE id = $2`,
      [targetOrgId, targetUserId]
    );
  }
}

async function upsertResearcherProfiles(userIdMap, stats) {
  const sourceProfiles = await fetchRows(
    sourcePool,
    `SELECT user_id, affiliation, title, institution, domains, methods, tools, expertise, research_interests, compliance_certifications, projects_completed, rate_min, rate_max, hourly_rate_min, hourly_rate_max, availability, current_projects_count, max_concurrent_projects, available_start_date FROM researcher_profiles`
  );

  for (const profile of sourceProfiles) {
    const targetUserId = userIdMap.get(profile.user_id);
    if (!targetUserId) {
      stats.researcherProfiles.missingDependency += 1;
      continue;
    }

    const existing = await fetchRows(
      targetPool,
      `SELECT user_id FROM researcher_profiles WHERE user_id = $1`,
      [targetUserId]
    );

    if (existing.length > 0) {
      stats.researcherProfiles.skipped += 1;
      continue;
    }

    stats.researcherProfiles.insert += 1;
    if (!apply) {
      continue;
    }

    await targetPool.query(
      `
      INSERT INTO researcher_profiles (
        user_id, affiliation, title, institution, domains, methods, tools, expertise,
        research_interests, compliance_certifications, projects_completed, rate_min,
        rate_max, hourly_rate_min, hourly_rate_max, availability,
        current_projects_count, max_concurrent_projects, available_start_date
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,$16,
        $17,$18,$19
      )
      `,
      [
        targetUserId,
        profile.affiliation,
        profile.title,
        profile.institution,
        profile.domains,
        profile.methods,
        profile.tools,
        profile.expertise,
        profile.research_interests,
        profile.compliance_certifications,
        profile.projects_completed,
        profile.rate_min,
        profile.rate_max,
        profile.hourly_rate_min,
        profile.hourly_rate_max,
        profile.availability,
        profile.current_projects_count,
        profile.max_concurrent_projects,
        profile.available_start_date,
      ]
    );
  }
}

async function upsertUserPreferences(userIdMap, stats) {
  const sourcePrefs = await fetchRows(
    sourcePool,
    `SELECT user_id, email_notifications, email_messages, email_matches, email_milestones, email_project_updates, inapp_notifications, inapp_messages, inapp_matches, weekly_digest, monthly_report, marketing_emails, created_at, updated_at FROM user_preferences`
  );

  for (const pref of sourcePrefs) {
    const targetUserId = userIdMap.get(pref.user_id);
    if (!targetUserId) {
      stats.userPreferences.missingDependency += 1;
      continue;
    }

    const existing = await fetchRows(
      targetPool,
      `SELECT user_id FROM user_preferences WHERE user_id = $1`,
      [targetUserId]
    );

    if (existing.length > 0) {
      stats.userPreferences.skipped += 1;
      continue;
    }

    stats.userPreferences.insert += 1;
    if (!apply) {
      continue;
    }

    await targetPool.query(
      `
      INSERT INTO user_preferences (
        user_id, email_notifications, email_messages, email_matches, email_milestones,
        email_project_updates, inapp_notifications, inapp_messages, inapp_matches,
        weekly_digest, monthly_report, marketing_emails, created_at, updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,$14
      )
      `,
      [
        targetUserId,
        pref.email_notifications,
        pref.email_messages,
        pref.email_matches,
        pref.email_milestones,
        pref.email_project_updates,
        pref.inapp_notifications,
        pref.inapp_messages,
        pref.inapp_matches,
        pref.weekly_digest,
        pref.monthly_report,
        pref.marketing_emails,
        pref.created_at,
        pref.updated_at,
      ]
    );
  }
}

async function upsertProjects(orgIdMap, stats) {
  const sourceProjects = await fetchRows(
    sourcePool,
    `SELECT project_id, title, problem, outcomes, methods_required, timeline, budget_min, budget_max, estimated_hours, start_date, data_sensitivity, status, org_id FROM project_ideas ORDER BY project_id ASC`
  );

  const targetProjects = await fetchRows(
    targetPool,
    `
    SELECT p.project_id, p.title, p.org_id, o."EIN", o.name
    FROM project_ideas p
    JOIN organizations o ON o.id = p.org_id
    `
  );

  const targetByProjectKey = new Map(
    targetProjects.map((project) => {
      const orgKey = project.EIN ? `ein:${project.EIN}` : `name:${(project.name || '').trim().toLowerCase()}`;
      return [toProjectKey(project.title, orgKey), project];
    })
  );

  const projectIdMap = new Map();

  const sourceOrgs = await fetchRows(sourcePool, `SELECT id, name, "EIN" FROM organizations`);
  const sourceOrgKeyById = new Map(sourceOrgs.map((org) => [org.id, toOrgKey(org)]));

  for (const project of sourceProjects) {
    const sourceOrgKey = sourceOrgKeyById.get(project.org_id);
    const targetOrgId = orgIdMap.get(project.org_id);

    if (!sourceOrgKey || !targetOrgId) {
      stats.projects.missingDependency += 1;
      continue;
    }

    const projectKey = toProjectKey(project.title, sourceOrgKey);
    const existing = targetByProjectKey.get(projectKey);

    if (existing) {
      projectIdMap.set(project.project_id, existing.project_id);
      stats.projects.skipped += 1;
      continue;
    }

    stats.projects.insert += 1;
    if (!apply) {
      continue;
    }

    const inserted = await fetchRows(
      targetPool,
      `
      INSERT INTO project_ideas (
        title, problem, outcomes, methods_required, timeline,
        budget_min, budget_max, estimated_hours, start_date,
        data_sensitivity, status, org_id
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12
      )
      RETURNING project_id
      `,
      [
        project.title,
        project.problem,
        project.outcomes,
        project.methods_required,
        project.timeline,
        project.budget_min,
        project.budget_max,
        project.estimated_hours,
        project.start_date,
        project.data_sensitivity,
        project.status,
        targetOrgId,
      ]
    );

    const insertedProject = inserted[0];
    targetByProjectKey.set(projectKey, { ...insertedProject, title: project.title, org_id: targetOrgId });
    projectIdMap.set(project.project_id, insertedProject.project_id);
  }

  return projectIdMap;
}

async function upsertMilestones(projectIdMap, stats) {
  const sourceMilestones = await fetchRows(
    sourcePool,
    `SELECT id, project_id, name, description, depends_on, due_date, status, completed_at, created_at, updated_at FROM milestones ORDER BY id ASC`
  );

  const targetMilestones = await fetchRows(
    targetPool,
    `SELECT id, project_id, name, due_date FROM milestones`
  );

  const targetByKey = new Map(
    targetMilestones.map((m) => [`${m.project_id}::${(m.name || '').trim().toLowerCase()}::${m.due_date || 'null'}`, m])
  );

  const milestoneIdMap = new Map();
  const delayedDependsOn = [];

  for (const milestone of sourceMilestones) {
    const targetProjectId = projectIdMap.get(milestone.project_id);
    if (!targetProjectId) {
      stats.milestones.missingDependency += 1;
      continue;
    }

    const key = `${targetProjectId}::${(milestone.name || '').trim().toLowerCase()}::${milestone.due_date || 'null'}`;
    const existing = targetByKey.get(key);

    if (existing) {
      milestoneIdMap.set(milestone.id, existing.id);
      stats.milestones.skipped += 1;
      continue;
    }

    stats.milestones.insert += 1;
    if (!apply) {
      continue;
    }

    const inserted = await fetchRows(
      targetPool,
      `
      INSERT INTO milestones (
        project_id, name, description, depends_on, due_date, status, completed_at, created_at, updated_at
      )
      VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8)
      RETURNING id
      `,
      [
        targetProjectId,
        milestone.name,
        milestone.description,
        milestone.due_date,
        milestone.status,
        milestone.completed_at,
        milestone.created_at,
        milestone.updated_at,
      ]
    );

    milestoneIdMap.set(milestone.id, inserted[0].id);
    delayedDependsOn.push({ sourceMilestoneId: milestone.id, sourceDependsOn: milestone.depends_on });
  }

  if (!apply) {
    return;
  }

  for (const item of delayedDependsOn) {
    if (!item.sourceDependsOn) {
      continue;
    }

    const targetId = milestoneIdMap.get(item.sourceMilestoneId);
    const targetDependsOnId = milestoneIdMap.get(item.sourceDependsOn);

    if (!targetId || !targetDependsOnId) {
      continue;
    }

    await targetPool.query(
      `UPDATE milestones SET depends_on = $1, updated_at = NOW() WHERE id = $2`,
      [targetDependsOnId, targetId]
    );

    stats.milestones.dependsOnUpdated += 1;
  }
}

function createStats() {
  return {
    users: { insert: 0, skipped: 0 },
    organizations: { insert: 0, skipped: 0 },
    userOrgLinks: { update: 0, skipped: 0 },
    researcherProfiles: { insert: 0, skipped: 0, missingDependency: 0 },
    userPreferences: { insert: 0, skipped: 0, missingDependency: 0 },
    projects: { insert: 0, skipped: 0, missingDependency: 0 },
    milestones: { insert: 0, skipped: 0, missingDependency: 0, dependsOnUpdated: 0 },
  };
}

function printStats(stats, dryRun) {
  console.log('\nMerge summary');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
  for (const [table, values] of Object.entries(stats)) {
    const parts = Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    console.log(`- ${table}: ${parts}`);
  }
}

(async () => {
  try {
    const safety = assertSafety({ sourceUrl, targetUrl, expectedTargetHost });
    console.log('\nMerge safety check passed');
    console.log(`Source: ${redactPgUrl(sourceUrl)} (${safety.sourceHost})`);
    console.log(`Target: ${redactPgUrl(targetUrl)} (${safety.targetHost})`);

    sourcePool = createPool(sourceUrl);
    targetPool = createPool(targetUrl);

    const stats = createStats();

    const userIdMap = await upsertUsers(stats);
    const orgIdMap = await upsertOrganizations(userIdMap, stats);
    await backfillUserOrgLinks(userIdMap, orgIdMap, stats);
    await upsertResearcherProfiles(userIdMap, stats);
    await upsertUserPreferences(userIdMap, stats);
    const projectIdMap = await upsertProjects(orgIdMap, stats);
    await upsertMilestones(projectIdMap, stats);

    printStats(stats, !apply);
    console.log('\nMerge completed.');
  } catch (error) {
    console.error(`\nMerge failed: ${error.message}`);
    process.exit(1);
  } finally {
    await closePools([sourcePool, targetPool]);
  }
})();
