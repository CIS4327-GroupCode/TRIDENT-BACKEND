require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function clearData() {
  try {
    console.log('🧹 Clearing all database records...\n');

    // Delete in reverse dependency order.
    // Keep this list aligned with the model set under src/database/models.
    const tables = [
      'notifications',
      'audit_logs',
      'project_reviews',
      'saved_projects',
      'matches',
      'ratings',
      'messages',
      'project_attachments',
      'agreements',
      'milestones',
      'certifications',
      'academic_history',
      'user_preferences',
      'project_ideas',
      'researcher_profiles',
      'organizations',
      '_user'
    ];

    for (const table of tables) {
      try {
        await sequelize.query(`DELETE FROM ${table}`);
        console.log(`✓ Deleted ${table}`);
      } catch (tableError) {
        // Keep going so one missing table doesn't block reset for the rest.
        console.log(`⚠️  Skipped ${table}: ${tableError.message}`);
      }
    }

    console.log('\n✅ Database cleared successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Error clearing database:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

clearData();
