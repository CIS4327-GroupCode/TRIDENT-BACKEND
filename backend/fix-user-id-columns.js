const sequelize = require('./src/database/index');

async function checkAndFixTables() {
  try {
    console.log('Checking email_verifications table...');
    
    const [emailCols] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'email_verifications' 
      ORDER BY ordinal_position
    `);
    
    console.log('email_verifications columns:', emailCols.map(c => c.column_name).join(', '));
    
    const hasUserIdEmail = emailCols.some(c => c.column_name === 'user_id');
    
    if (!hasUserIdEmail) {
      console.log('\n❌ Missing user_id column in email_verifications');
      console.log('Adding user_id column...');
      
      await sequelize.query(`
        ALTER TABLE email_verifications 
        ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 
        REFERENCES _user(id) ON DELETE CASCADE ON UPDATE CASCADE
      `);
      
      await sequelize.query(`
        CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id)
      `);
      
      console.log('✅ user_id column added to email_verifications');
    } else {
      console.log('✅ email_verifications table has user_id column');
    }
    
    console.log('\n');
    console.log('Checking password_resets table...');
    
    const [pwdCols] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'password_resets' 
      ORDER BY ordinal_position
    `);
    
    console.log('password_resets columns:', pwdCols.map(c => c.column_name).join(', '));
    
    const hasUserIdPwd = pwdCols.some(c => c.column_name === 'user_id');
    
    if (!hasUserIdPwd) {
      console.log('\n❌ Missing user_id column in password_resets');
      console.log('Adding user_id column...');
      
      await sequelize.query(`
        ALTER TABLE password_resets 
        ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 
        REFERENCES _user(id) ON DELETE CASCADE ON UPDATE CASCADE
      `);
      
      await sequelize.query(`
        CREATE INDEX idx_password_resets_user_id ON password_resets(user_id)
      `);
      
      console.log('✅ user_id column added to password_resets');
    } else {
      console.log('✅ password_resets table has user_id column');
    }
    
    console.log('\n✅ All tables fixed!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAndFixTables();
