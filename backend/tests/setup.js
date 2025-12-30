/**
 * Test Setup - Runs before all tests
 * Configures global test environment
 */

// Load environment variables from .env file first
require('dotenv').config();

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-purposes-min-32-chars';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-token-secret-for-testing-min-32-chars';
// Use DATABASE_URL from .env (will use your existing database with transaction rollback)
// No need to override DATABASE_URL - it will use the one from .env

// Suppress console output during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
