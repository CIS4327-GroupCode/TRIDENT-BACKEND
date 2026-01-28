require('dotenv').config();
const { sequelize } = require('./src/database/models');

async function checkTables() {
  try {
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n=== TABLES IN DATABASE ===');
    console.log('Total tables:', results.length);
    console.log('');
    results.forEach(row => console.log('  -', row.table_name));
    
    // Check for specific tables
    const tableNames = results.map(r => r.table_name);
    console.log('\n=== KEY TABLES CHECK ===');
    console.log('notifications:', tableNames.includes('notifications') ? '✅ EXISTS' : '❌ MISSING');
    console.log('email_verifications:', tableNames.includes('email_verifications') ? '✅ EXISTS' : '❌ MISSING');
    console.log('password_resets:', tableNames.includes('password_resets') ? '✅ EXISTS' : '❌ MISSING');
    console.log('user_preferences:', tableNames.includes('user_preferences') ? '✅ EXISTS' : '❌ MISSING');
    
    await sequelize.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTables();
