'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_milestones_status') THEN
          ALTER TYPE "enum_milestones_status" ADD VALUE IF NOT EXISTS 'revision_requested';
          ALTER TYPE "enum_milestones_status" ADD VALUE IF NOT EXISTS 'revision_in_progress';
        END IF;
      END
      $$;
    `);
  },

  async down() {
    // PostgreSQL does not support removing enum values without type recreation.
    return Promise.resolve();
  }
};