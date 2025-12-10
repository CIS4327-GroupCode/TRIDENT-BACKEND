'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('_user', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      role: {
        type: Sequelize.ENUM('researcher', 'nonprofit', 'admin'),
        allowNull: false,
        defaultValue: 'researcher'
      },
      mfa_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add index on email for faster lookups
    await queryInterface.addIndex('_user', ['email']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('_user');
  }
};