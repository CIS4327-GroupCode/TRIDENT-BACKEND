#!/usr/bin/env node

/**
 * Non-production DB sync helper.
 * Runs: migrate status -> migrate -> seed -> migrate status.
 *
 * Safety guard: this command only supports development and staging.
 */

require('dotenv').config();
const { spawnSync } = require('child_process');

function parseEnvArg(argv) {
  const envFlagIndex = argv.indexOf('--env');
  if (envFlagIndex === -1) return null;

  const value = argv[envFlagIndex + 1];
  return value || null;
}

const requestedEnv = parseEnvArg(process.argv);
const targetEnv = (requestedEnv || process.env.NODE_ENV || 'development').trim().toLowerCase();
const allowedEnvironments = new Set(['development', 'staging']);

if (!allowedEnvironments.has(targetEnv)) {
  console.error(
    `\n❌ Refusing to run DB sync for environment "${targetEnv}".`
  );
  console.error('This command is restricted to development and staging only.\n');
  process.exit(1);
}

function run(command, args) {
  const pretty = [command, ...args].join(' ');
  console.log(`\n➡️  ${pretty}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: targetEnv,
    },
  });

  if (result.status !== 0) {
    console.error(`\n❌ Command failed: ${pretty}`);
    process.exit(result.status || 1);
  }
}

console.log(`\n🧭 Starting non-production DB sync for NODE_ENV=${targetEnv}`);

run('npx', ['sequelize-cli', 'db:migrate:status', '--env', targetEnv]);
run('npx', ['sequelize-cli', 'db:migrate', '--env', targetEnv]);
run('node', ['seed-database.js']);
run('npx', ['sequelize-cli', 'db:migrate:status', '--env', targetEnv]);

console.log('\n✅ Non-production DB sync completed successfully.\n');
