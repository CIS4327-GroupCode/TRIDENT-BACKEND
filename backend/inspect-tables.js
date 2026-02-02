const sequelize = require('./src/database/index');

async function inspectTables() {
  try {
    // Check all tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('All tables in database:');
    tables.forEach(t => console.log('  -', t.table_name));
    
    console.log('\n='.repeat(60));
    console.log('Detailed schema for email_verifications:');
    console.log('='.repeat(60));
    
    const [emailSchema] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'email_verifications' 
      ORDER BY ordinal_position
    `);
    
    emailSchema.forEach(col => {
      console.log(`${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} NULL: ${col.is_nullable}`);
    });
    
    console.log('\n='.repeat(60));
    console.log('Detailed schema for password_resets:');
    console.log('='.repeat(60));
    
    const [pwdSchema] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'password_resets' 
      ORDER BY ordinal_position
    `);
    
    pwdSchema.forEach(col => {
      console.log(`${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} NULL: ${col.is_nullable}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectTables();
