'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('two_factor_codes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user', // must match your actual user table name
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },

      purpose: {
        type: Sequelize.STRING(20),
        allowNull: false
      },

      code_hash: {
        type: Sequelize.STRING(255),
        allowNull: false
      },

      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },

      consumed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      },

      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('two_factor_codes');
  }
};
