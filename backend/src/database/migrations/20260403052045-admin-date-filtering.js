'use strict';

module.exports = {
  async up(queryInterface) {
    try {
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_created_at
        ON messages (created_at);
      `);
    } catch (err) {
      console.log('Skipping idx_messages_created_at');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS idx_messages_created_at;
      `);
    } catch (err) {
      console.log('Skipping removal of idx_messages_created_at');
    }
  },
};