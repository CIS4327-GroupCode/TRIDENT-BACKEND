'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('agreements', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      type: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      value: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      budget_info: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      audit_trail: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      org_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      researcher_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'researcher_profiles',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    });

    // Add indexes
    await queryInterface.addIndex('agreements', ['org_id']);
    await queryInterface.addIndex('agreements', ['researcher_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('agreements');
  }
};
