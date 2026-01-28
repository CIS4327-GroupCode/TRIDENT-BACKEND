require('dotenv').config();
const db = require('./src/config/database');

(async () => {
  try {
    await db.authenticate();
    console.log('✅ Connected to database');
    
    // Delete the email verification and password reset migrations from SequelizeMeta
    const result = await db.query(
      `DELETE FROM "SequelizeMeta" WHERE name IN ('20260127000001-create-email-verifications-table.js', '20260127000002-create-password-resets-table.js')`
    );
    console.log('✅ Deleted migration records');
    
    // Also drop the tables if they exist
    try {
      await db.query('DROP TABLE IF EXISTS "email_verifications" CASCADE');
      console.log('✅ Dropped email_verifications table');
    } catch (e) {
      console.log('⚠️  email_verifications table not found');
    }
    
    try {
      await db.query('DROP TABLE IF EXISTS "password_resets" CASCADE');
      console.log('✅ Dropped password_resets table');
    } catch (e) {
      console.log('⚠️  password_resets table not found');
    }
    
    await db.close();
    console.log('✅ Done - now run migrations again');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
})();
