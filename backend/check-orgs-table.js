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

async function checkTable() {
  try {
    // Check table structure
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' 
      ORDER BY ordinal_position;
    `);
    
    console.log('\n=== Organizations Table Columns ===');
    console.table(columns);
    
    // Check constraints
    const [constraints] = await sequelize.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'organizations';
    `);
    
    console.log('\n=== Organizations Table Constraints ===');
    console.table(constraints);
    
    // Check indexes
    const [indexes] = await sequelize.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'organizations';
    `);
    
    console.log('\n=== Organizations Table Indexes ===');
    console.table(indexes);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkTable();
