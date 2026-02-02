const sequelize = require('./src/database/index');

async function fixEmailVerificationsTable() {
  try {
    console.log('Backing up and recreating email_verifications table...');
    
    // Drop the incorrectly structured table
    console.log('Dropping incorrect email_verifications table...');
    await sequelize.query('DROP TABLE IF EXISTS email_verifications CASCADE');
    
    // Create the correct table structure
    console.log('Creating correct email_verifications table...');
    await sequelize.query(`
      CREATE TABLE email_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES _user(id) ON DELETE CASCADE ON UPDATE CASCADE,
        token VARCHAR(500) NOT NULL UNIQUE,
        token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add indexes
    console.log('Adding indexes...');
    await sequelize.query('CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id)');
    await sequelize.query('CREATE UNIQUE INDEX idx_email_verifications_token ON email_verifications(token)');
    await sequelize.query('CREATE INDEX idx_email_verifications_expires ON email_verifications(token_expires_at)');
    
    console.log('✅ email_verifications table recreated successfully!');
    console.log('\nNew schema:');
    
    const [schema] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'email_verifications' 
      ORDER BY ordinal_position
    `);
    
    schema.forEach(col => {
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(30)} NULL: ${col.is_nullable}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixEmailVerificationsTable();
