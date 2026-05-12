'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('upload_security_incidents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      surface: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      route: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      mimetype: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      size: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      content_hash: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      scan_status: {
        type: Sequelize.ENUM('infected', 'error'),
        allowNull: false
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      action_taken: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      auto_suspension_state: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'not_attempted'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('upload_security_incidents');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_upload_security_incidents_scan_status";');
  }
};