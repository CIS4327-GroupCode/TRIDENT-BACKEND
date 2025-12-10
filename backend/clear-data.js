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

    // Delete in reverse dependency order
    await sequelize.query('DELETE FROM milestones');
    console.log('✓ Deleted milestones');
    
    await sequelize.query('DELETE FROM user_preferences');
    console.log('✓ Deleted user preferences');
    
    await sequelize.query('DELETE FROM project_ideas');
    console.log('✓ Deleted projects');
    
    await sequelize.query('DELETE FROM researcher_profiles');
    console.log('✓ Deleted researcher profiles');
    
    await sequelize.query('DELETE FROM organizations');
    console.log('✓ Deleted organizations');
    
    await sequelize.query('DELETE FROM _user');
    console.log('✓ Deleted users');

    console.log('\n✅ Database cleared successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Error clearing database:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

clearData();
