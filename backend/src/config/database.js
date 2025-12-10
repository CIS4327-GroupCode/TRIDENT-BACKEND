require('dotenv').config();

const { DATABASE_URL, NODE_ENV } = process.env;

// Serverless-optimized pool settings
const poolConfig = {
  max: 2, // Reduced for serverless
  min: 0,
  acquire: 30000,
  idle: 10000,
  evict: 10000 // Close idle connections faster
};

module.exports = {
  development: {
    url: DATABASE_URL,
    dialect: 'postgres',
    logging: false,
    pool: poolConfig,
    dialectOptions: {
      // SSL ON for Neon cloud Postgres
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },

  production: {
    url: DATABASE_URL,
    dialect: 'postgres',
    logging: false,
    pool: {
      ...poolConfig,
      max: 1, // Single connection for serverless functions
    },
    dialectOptions: {
      // SSL ON for Neon / cloud Postgres
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      // Neon-specific optimizations
      connectTimeout: 10000,
      keepAlive: false,
    },
  },
};