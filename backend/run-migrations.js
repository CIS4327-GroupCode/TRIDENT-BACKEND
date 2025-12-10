#!/usr/bin/env node

/**
 * Run Database Migrations
 * 
 * This script runs all pending Sequelize migrations
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const config = require('./src/config/database');
const path = require('path');
const fs = require('fs');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

async function runMigrations() {
  console.log('🚀 Running database migrations...\n');

  const sequelize = new Sequelize(dbConfig.url, {
    dialect: dbConfig.dialect,
    logging: console.log,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions
  });

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Create SequelizeMeta table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        name VARCHAR(255) NOT NULL PRIMARY KEY
      );
    `);

    // Get executed migrations
    const [executedMigrations] = await sequelize.query(
      'SELECT name FROM "SequelizeMeta" ORDER BY name'
    );
    const executedSet = new Set(executedMigrations.map(m => m.name));

    // Get migration files
    const migrationsPath = path.join(__dirname, 'src', 'database', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsPath)
      .filter(file => file.endsWith('.js'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration file(s)\n`);

    // Run pending migrations
    let ranCount = 0;
    for (const file of migrationFiles) {
      if (executedSet.has(file)) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`📝 Running ${file}...`);
      
      const migration = require(path.join(migrationsPath, file));
      const queryInterface = sequelize.getQueryInterface();

      try {
        await migration.up(queryInterface, Sequelize);
        
        // Record in SequelizeMeta
        await sequelize.query(
          'INSERT INTO "SequelizeMeta" (name) VALUES (?)',
          { replacements: [file] }
        );
        
        console.log(`✅ ${file} completed\n`);
        ranCount++;
      } catch (error) {
        console.error(`❌ ${file} failed:`, error.message);
        throw error;
      }
    }

    if (ranCount === 0) {
      console.log('✨ No pending migrations\n');
    } else {
      console.log(`✅ Successfully ran ${ranCount} migration(s)\n`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigrations()
  .then(() => {
    console.log('🎉 Migration complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
