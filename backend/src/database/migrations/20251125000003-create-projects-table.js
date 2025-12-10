'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_ideas', {
      project_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      problem: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      outcomes: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      methods_required: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      timeline: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      budget_min: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      data_sensitivity: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: 'open'
      },
      org_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      id_str: {
        type: Sequelize.STRING(255),
        allowNull: true,
        field: 'id'
      }
    });

    // Add indexes
    await queryInterface.addIndex('project_ideas', ['org_id']);
    await queryInterface.addIndex('project_ideas', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_ideas');
  }
};
