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

async function wipeAllData() {
  const tables = [
    'contracts',
    'two_factor_codes',
    'password_resets',
    'email_verifications',
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

  try {
    console.log('Starting complete data wipe...');
    for (const table of tables) {
      try {
        await sequelize.query(`DELETE FROM "${table}"`);
        console.log(`Cleared ${table}`);
      } catch (error) {
        console.log(`Skipped ${table}: ${error.message}`);
      }
    }
    console.log('Complete data wipe finished.');
  } finally {
    await sequelize.close();
  }
}

wipeAllData().catch((error) => {
  console.error('Data wipe failed:', error);
  process.exit(1);
});
