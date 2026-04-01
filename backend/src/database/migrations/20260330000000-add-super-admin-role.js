'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'super_admin' to the existing role ENUM type
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum__user_role" ADD VALUE IF NOT EXISTS 'super_admin';`
    );
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does not support removing values from an ENUM type.
    // To fully reverse this, the column type would need to be recreated.
    // This is intentionally left as a no-op for safety.
    console.warn('Down migration for super_admin role is a no-op. Manual intervention required to remove ENUM value.');
  }
};
