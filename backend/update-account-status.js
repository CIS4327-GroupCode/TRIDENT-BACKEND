require('dotenv').config();
const sequelize = require('./src/database');

async function updateAdminStatus() {
  try {
    console.log('Updating admin user account_status...');
    
    const [results] = await sequelize.query(`
      UPDATE _user 
      SET account_status = 'active' 
      WHERE role = 'admin' AND account_status IS NULL
      RETURNING id, email, role, account_status;
    `);
    
    if (results.length > 0) {
      console.log('✓ Updated admin users:');
      results.forEach(user => {
        console.log(`  - ${user.email} (ID: ${user.id}) → ${user.account_status}`);
      });
    } else {
      console.log('ℹ No admin users needed updating');
    }
    
    // Also update all other users without account_status
    const [allResults] = await sequelize.query(`
      UPDATE _user 
      SET account_status = 'active' 
      WHERE account_status IS NULL
      RETURNING id, email, role;
    `);
    
    if (allResults.length > 0) {
      console.log(`\n✓ Updated ${allResults.length} additional users to active status`);
    }
    
    console.log('\n✅ All users now have account_status set!');
  } catch (error) {
    console.error('❌ Error updating users:', error.message);
  } finally {
    await sequelize.close();
  }
}

updateAdminStatus();
