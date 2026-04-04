require('dotenv').config();
const pg = require('pg');

const { DATABASE_URL, NODE_ENV } = process.env;

const parseBooleanEnv = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const shouldUseSslInNonProd = () => {
  // Optional manual override for local development.
  const override = parseBooleanEnv(process.env.DB_SSL);
  if (override !== null) return override;

  if (!DATABASE_URL) return false;

  const url = DATABASE_URL.toLowerCase();
  const sslExplicitlyRequired = url.includes('sslmode=require');
  const neonConnection = url.includes('neon');

  return sslExplicitlyRequired || neonConnection;
};

const nonProdSslConfig = shouldUseSslInNonProd()
  ? {
      require: true,
      rejectUnauthorized: false,
    }
  : false;

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
      // Auto-detect SSL for local development (Neon/cloud URL or DB_SSL=true).
      ssl: nonProdSslConfig,
    },
  },

  staging: {
    url: DATABASE_URL,
    dialect: 'postgres',
    dialectModule: pg,
    logging: false,
    pool: {
      ...poolConfig,
      max: 2,
    },
    dialectOptions: {
      // Keep staging close to production behavior while allowing light test concurrency.
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      connectTimeout: 10000,
      keepAlive: false,
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
      // Keep test SSL behavior aligned with non-production URL detection.
      ssl: nonProdSslConfig,
    },
  },
};