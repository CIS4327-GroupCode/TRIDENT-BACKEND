require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function fixOrganizationsTable() {
  try {
    console.log('🔧 Fixing organizations table...\n');
    
    // Step 1: Drop dependent tables that reference organizations
    console.log('Step 1: Dropping dependent tables...');
    await sequelize.query('DROP TABLE IF EXISTS project_ideas CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS researcher_profiles CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS matches CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS agreements CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS applications CASCADE;');
    console.log('✓ Dependent tables dropped\n');
    
    // Step 2: Drop and recreate organizations table
    console.log('Step 2: Recreating organizations table...');
    await sequelize.query('DROP TABLE IF EXISTS organizations CASCADE;');
    
    await sequelize.query(`
      CREATE TABLE organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        "EIN" VARCHAR(255),
        mission VARCHAR(255),
        focus_tags VARCHAR(255),
        compliance_flags VARCHAR(255),
        contacts VARCHAR(255)
      );
    `);
    
    // Add indexes
    await sequelize.query('CREATE INDEX idx_organizations_name ON organizations(name);');
    await sequelize.query('CREATE INDEX idx_organizations_ein ON organizations("EIN");');
    
    console.log('✓ Organizations table recreated with correct structure\n');
    
    // Step 3: Verify
    const [result] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' 
      ORDER BY ordinal_position;
    `);
    
    console.log('=== Verified Table Structure ===');
    console.table(result);
    
    const [constraints] = await sequelize.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'organizations';
    `);
    
    console.log('\n=== Constraints ===');
    console.table(constraints);
    
    console.log('\n✅ Organizations table fixed successfully!');
    console.log('⚠️  WARNING: All project_ideas and related data was deleted.');
    console.log('📝 Next step: Run migrations to recreate all tables properly');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

fixOrganizationsTable();
