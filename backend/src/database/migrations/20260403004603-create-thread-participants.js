'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('thread_participants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      thread_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'threads',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      unread_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      last_read_message_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      joined_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('thread_participants');
  },
};