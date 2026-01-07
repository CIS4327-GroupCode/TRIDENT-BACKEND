'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('notifications', 'archived', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    // Add indexes for cleanup queries
    await queryInterface.addIndex('notifications', ['archived', 'created_at'], {
      name: 'idx_notifications_archived_created'
    });

    await queryInterface.addIndex('notifications', ['user_id', 'archived'], {
      name: 'idx_notifications_user_archived'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('notifications', 'idx_notifications_user_archived');
    await queryInterface.removeIndex('notifications', 'idx_notifications_archived_created');
    await queryInterface.removeColumn('notifications', 'archived');
  }
};
