'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('message_attachments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      message_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'messages',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      file_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      storage_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      file_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      mime_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      file_size: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      uploaded_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('message_attachments');
  },
};