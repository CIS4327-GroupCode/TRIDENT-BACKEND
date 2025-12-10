'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('_user', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      comment: 'Soft delete timestamp - null means active user'
    });

    // Add index for efficient queries filtering out deleted users
    await queryInterface.addIndex('_user', ['deleted_at'], {
      name: 'idx_user_deleted_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('_user', 'idx_user_deleted_at');
    await queryInterface.removeColumn('_user', 'deleted_at');
  }
};
