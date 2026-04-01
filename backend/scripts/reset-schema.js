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

async function resetSchema() {
  try {
    console.log('Dropping public schema...');
    await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE;');
    console.log('Creating public schema...');
    await sequelize.query('CREATE SCHEMA public;');
    console.log('Granting schema privileges...');
    await sequelize.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('Schema reset complete.');
  } finally {
    await sequelize.close();
  }
}

resetSchema().catch((error) => {
  console.error('Schema reset failed:', error);
  process.exit(1);
});
