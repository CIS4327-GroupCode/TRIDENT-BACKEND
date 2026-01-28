/**
 * Check Production Database Tables
 * Verifies what tables exist in production database
 */

require('dotenv').config();

// Temporarily use production connection
const originalUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_endZbRv0p8kC@ep-floral-unit-adhlihq3-pooler.c-2.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const { sequelize } = require('./src/database/models');

async function checkProductionTables() {
  try {
    console.log('📊 Checking Production Database Tables...\n');

    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`Found ${results.length} tables:\n`);
    results.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });

    // Check for critical tables
    const tableNames = results.map(r => r.table_name);
    console.log('\n📋 Critical Tables Status:\n');
    
    const criticalTables = [
      'notifications',
      'email_verifications',
      'password_resets',
      'user_preferences'
    ];

    criticalTables.forEach(table => {
      const exists = tableNames.includes(table);
      console.log(`${exists ? '✅' : '❌'} ${table}`);
    });

    await sequelize.close();
    process.env.DATABASE_URL = originalUrl;
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.env.DATABASE_URL = originalUrl;
    process.exit(1);
  }
}

checkProductionTables();
