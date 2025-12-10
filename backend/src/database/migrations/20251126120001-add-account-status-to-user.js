'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM type for account status
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_user_account_status AS ENUM ('active', 'pending', 'suspended');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add account_status column
    await queryInterface.addColumn('_user', 'account_status', {
      type: Sequelize.ENUM('active', 'pending', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    });

    // Add index for faster filtering
    await queryInterface.addIndex('_user', ['account_status'], {
      name: 'idx_user_account_status'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('_user', 'idx_user_account_status');
    await queryInterface.removeColumn('_user', 'account_status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_user_account_status;');
  }
};
