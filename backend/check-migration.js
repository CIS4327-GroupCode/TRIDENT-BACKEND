#!/usr/bin/env node

/**
 * Sequelize Migration Status Checker
 * 
 * This script verifies the current state of Sequelize migration
 * and provides a quick summary of what's complete and what's missing.
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const config = require('./src/config/database');
const path = require('path');
const fs = require('fs');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const checkmark = '✅';
const cross = '❌';
const warning = '⚠️';

async function checkMigrationStatus() {
  console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║     Sequelize Migration Status Checker                ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

  let sequelize;
  let totalChecks = 0;
  let passedChecks = 0;

  try {
    // 1. Database Connection
    console.log(`${colors.blue}[1/6] Checking Database Connection...${colors.reset}`);
    sequelize = new Sequelize(dbConfig.url, {
      dialect: dbConfig.dialect,
      logging: false,
      pool: dbConfig.pool,
      dialectOptions: dbConfig.dialectOptions
    });

    try {
      await sequelize.authenticate();
      console.log(`   ${checkmark} ${colors.green}Database connection successful${colors.reset}`);
      passedChecks++;
    } catch (error) {
      console.log(`   ${cross} ${colors.red}Database connection failed: ${error.message}${colors.reset}`);
    }
    totalChecks++;

    // 2. Check Models
    console.log(`\n${colors.blue}[2/6] Checking Model Files...${colors.reset}`);
    const modelsPath = path.join(__dirname, 'src', 'database', 'models');
    const requiredModels = [
      'User.js', 
      'Organization.js', 
      'Project.js', 
      'Application.js',
      'ResearcherProfile.js',
      'Match.js',
      'Rating.js',
      'Milestone.js',
      'Message.js',
      'AuditLog.js'
    ];
    
    for (const modelFile of requiredModels) {
      const modelPath = path.join(modelsPath, modelFile);
      totalChecks++;
      
      if (fs.existsSync(modelPath)) {
        const content = fs.readFileSync(modelPath, 'utf8');
        if (content.trim().length > 100) {
          console.log(`   ${checkmark} ${colors.green}${modelFile} exists and has content${colors.reset}`);
          passedChecks++;
        } else {
          console.log(`   ${warning} ${colors.yellow}${modelFile} exists but appears empty${colors.reset}`);
        }
      } else {
        console.log(`   ${cross} ${colors.red}${modelFile} is missing${colors.reset}`);
      }
    }

    // 3. Check Migrations
    console.log(`\n${colors.blue}[3/6] Checking Migration Files...${colors.reset}`);
    const migrationsPath = path.join(__dirname, 'src', 'database', 'migrations');
    
    try {
      const migrationFiles = fs.readdirSync(migrationsPath);
      console.log(`   ${colors.cyan}Found ${migrationFiles.length} migration file(s):${colors.reset}`);
      
      migrationFiles.forEach(file => {
        console.log(`   ${colors.gray}  - ${file}${colors.reset}`);
      });
      
      totalChecks++;
      if (migrationFiles.length > 0) {
        passedChecks++;
      }
    } catch (error) {
      console.log(`   ${cross} ${colors.red}Migrations directory not accessible${colors.reset}`);
      totalChecks++;
    }

    // 4. Check Tables
    console.log(`\n${colors.blue}[4/6] Checking Database Tables...${colors.reset}`);
    const requiredTables = [
      '_user', 
      'organizations', 
      'researcher_profiles',
      'project_ideas', 
      'agreements',
      'matches',
      'ratings',
      'milestones',
      'messages',
      'audit_logs'
    ];
    
    for (const table of requiredTables) {
      totalChecks++;
      try {
        const [results] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${table}'
          );
        `);
        
        if (results[0].exists) {
          console.log(`   ${checkmark} ${colors.green}Table "${table}" exists${colors.reset}`);
          passedChecks++;
        } else {
          console.log(`   ${cross} ${colors.red}Table "${table}" does not exist${colors.reset}`);
        }
      } catch (error) {
        console.log(`   ${cross} ${colors.red}Cannot check table "${table}": ${error.message}${colors.reset}`);
      }
    }

    // 5. Check Executed Migrations
    console.log(`\n${colors.blue}[5/6] Checking Executed Migrations...${colors.reset}`);
    totalChecks++;
    
    try {
      const [results] = await sequelize.query('SELECT name FROM "SequelizeMeta" ORDER BY name;');
      
      if (results.length > 0) {
        console.log(`   ${checkmark} ${colors.green}${results.length} migration(s) executed:${colors.reset}`);
        results.forEach(r => {
          console.log(`   ${colors.gray}  - ${r.name}${colors.reset}`);
        });
        passedChecks++;
      } else {
        console.log(`   ${warning} ${colors.yellow}No migrations have been executed${colors.reset}`);
      }
    } catch (error) {
      console.log(`   ${cross} ${colors.red}SequelizeMeta table not found - migrations may not have been run${colors.reset}`);
    }

    // 6. Check Configuration Files
    console.log(`\n${colors.blue}[6/6] Checking Configuration Files...${colors.reset}`);
    const configFiles = [
      { path: '.sequelizerc', name: '.sequelizerc' },
      { path: 'src/config/database.js', name: 'database.js config' },
      { path: 'src/database/index.js', name: 'Sequelize instance' },
      { path: 'src/database/models/index.js', name: 'Models index' }
    ];

    for (const file of configFiles) {
      totalChecks++;
      const filePath = path.join(__dirname, file.path);
      
      if (fs.existsSync(filePath)) {
        console.log(`   ${checkmark} ${colors.green}${file.name} exists${colors.reset}`);
        passedChecks++;
      } else {
        console.log(`   ${cross} ${colors.red}${file.name} is missing${colors.reset}`);
      }
    }

    // Summary
    const percentage = Math.round((passedChecks / totalChecks) * 100);
    console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║                     SUMMARY                            ║${colors.reset}`);
    console.log(`${colors.cyan}╠════════════════════════════════════════════════════════╣${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}  Checks Passed: ${passedChecks}/${totalChecks} (${percentage}%)                          `);
    
    if (percentage >= 90) {
      console.log(`${colors.cyan}║${colors.reset}  Status: ${checkmark} ${colors.green}Excellent - Migration nearly complete!${colors.reset}     `);
    } else if (percentage >= 70) {
      console.log(`${colors.cyan}║${colors.reset}  Status: ${warning} ${colors.yellow}Good - Some work remaining${colors.reset}               `);
    } else if (percentage >= 50) {
      console.log(`${colors.cyan}║${colors.reset}  Status: ${warning} ${colors.yellow}In Progress - More work needed${colors.reset}           `);
    } else {
      console.log(`${colors.cyan}║${colors.reset}  Status: ${cross} ${colors.red}Critical - Major issues detected${colors.reset}        `);
    }
    
    console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

    // Recommendations
    if (percentage < 100) {
      console.log(`${colors.cyan}RECOMMENDATIONS:${colors.reset}\n`);
      
      if (passedChecks < totalChecks) {
        console.log(`  ${colors.yellow}1. Review the checks above and fix any issues marked with ${cross}${colors.reset}`);
        console.log(`  ${colors.yellow}2. For missing models, create them using User.js as a template${colors.reset}`);
        console.log(`  ${colors.yellow}3. For missing tables, create and run migrations:${colors.reset}`);
        console.log(`     ${colors.gray}npm run db:migrate${colors.reset}`);
        console.log(`  ${colors.yellow}4. Run the test suite to verify functionality:${colors.reset}`);
        console.log(`     ${colors.gray}npm test${colors.reset}\n`);
      }
    }

    // Next Steps
    console.log(`${colors.cyan}NEXT STEPS:${colors.reset}\n`);
    console.log(`  ${colors.gray}1. Install test dependencies:${colors.reset}`);
    console.log(`     npm install --save-dev jest supertest\n`);
    console.log(`  ${colors.gray}2. Run migration verification tests:${colors.reset}`);
    console.log(`     npm run test:migrations\n`);
    console.log(`  ${colors.gray}3. Run full test suite:${colors.reset}`);
    console.log(`     npm test\n`);
    console.log(`  ${colors.gray}4. See detailed progress:${colors.reset}`);
    console.log(`     See SEQUELIZE_MIGRATION_PROGRESS.md\n`);

  } catch (error) {
    console.error(`\n${cross} ${colors.red}Fatal error: ${error.message}${colors.reset}\n`);
    process.exit(1);
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
}

// Run the checker
checkMigrationStatus()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`${cross} ${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
