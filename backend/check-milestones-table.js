require('dotenv').config();
const sequelize = require('./src/database');

async function checkTable() {
  try {
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'milestones' 
      ORDER BY ordinal_position
    `);
    console.log('Milestones Table Structure:');
    console.table(results);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sequelize.close();
  }
}

checkTable();
