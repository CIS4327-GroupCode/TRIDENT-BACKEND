require('dotenv').config();
const pg = require('pg');

const { DATABASE_URL, NODE_ENV } = process.env;

// Serverless-optimized pool settings
const poolConfig = {
  max: 3, // Reduced for serverless
  min: 0,
  acquire: 30000,
  idle: 10000,
  evict: 10000 // Close idle connections faster
};

module.exports = {
  development: {
    url: DATABASE_URL,
    dialect: 'postgres',
    dialectModule: pg,
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
    dialectModule: pg,
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

  test: {
    url: DATABASE_URL || 'postgresql://test:test@localhost:5432/trident_test',
    dialect: 'postgres',
    dialectModule: pg,
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      // Only use SSL if DATABASE_URL is provided (cloud database)
      // Local databases typically don't support SSL
      ssl: DATABASE_URL && DATABASE_URL.includes('neon') ? {
        require: true,
        rejectUnauthorized: false,
      } : false,
    },
  },
};