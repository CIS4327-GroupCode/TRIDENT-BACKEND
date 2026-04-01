require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

async function cleanupStaleSequelizeMeta() {
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

  try {
    const migrationsDir = path.join(process.cwd(), 'src', 'database', 'migrations');
    const migrationFiles = new Set(
      fs.readdirSync(migrationsDir).filter((fileName) => fileName.endsWith('.js'))
    );

    const [rows] = await sequelize.query('SELECT name FROM "SequelizeMeta"');
    const staleEntries = rows.filter((row) => !migrationFiles.has(row.name));

    if (staleEntries.length === 0) {
      console.log('No stale SequelizeMeta entries found.');
      return;
    }

    for (const entry of staleEntries) {
      await sequelize.query('DELETE FROM "SequelizeMeta" WHERE name = ?', {
        replacements: [entry.name]
      });
      console.log(`Removed stale migration entry: ${entry.name}`);
    }

    console.log(`Removed ${staleEntries.length} stale SequelizeMeta entries.`);
  } finally {
    await sequelize.close();
  }
}

cleanupStaleSequelizeMeta().catch((error) => {
  console.error('Failed to cleanup SequelizeMeta:', error);
  process.exit(1);
});
