#!/usr/bin/env node

/**
 * Schema synchronization for an explicit target database URL.
 * Runs: migrate status -> migrate -> migrate status.
 */

const { spawnSync } = require('child_process');
const {
  parseArgs,
  assertSafety,
  redactPgUrl,
} = require('./db-sync-utils');

const args = parseArgs(process.argv.slice(2));
const sourceUrl = args['source-url'] || args._[0] || process.env.SOURCE_DATABASE_URL;
const targetUrl = args['target-url'] || args._[1] || process.env.TARGET_DATABASE_URL;
const expectedTargetHost = args['expect-target-host'];
const sequelizeEnv = (args.env || 'production').toLowerCase();

if (!sourceUrl || !targetUrl) {
  console.error('Usage: node scripts/db-sync-schema.js --source-url <url> --target-url <url> [--expect-target-host <host-substring>] [--env production]');
  process.exit(1);
}

try {
  const safety = assertSafety({ sourceUrl, targetUrl, expectedTargetHost });
  console.log('\nSchema sync safety check passed');
  console.log(`Source: ${redactPgUrl(sourceUrl)} (${safety.sourceHost})`);
  console.log(`Target: ${redactPgUrl(targetUrl)} (${safety.targetHost})`);
} catch (error) {
  console.error(`\nSafety check failed: ${error.message}`);
  process.exit(1);
}

function runSequelize(commandArgs) {
  const result = spawnSync('npx', ['sequelize-cli', ...commandArgs], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: sequelizeEnv,
      DATABASE_URL: targetUrl,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\nRunning migration status (before)...');
runSequelize(['db:migrate:status', '--env', sequelizeEnv]);

console.log('\nRunning migrations...');
runSequelize(['db:migrate', '--env', sequelizeEnv]);

console.log('\nRunning migration status (after)...');
runSequelize(['db:migrate:status', '--env', sequelizeEnv]);

console.log('\nSchema synchronization completed.');
