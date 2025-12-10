'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Column already exists locally; skip adding it again
    return Promise.resolve();
  },

  async down(queryInterface, Sequelize) {
    // No-op for local dev
    return Promise.resolve();
  },
};