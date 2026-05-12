'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_researcher_access', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'project_ideas',
          key: 'project_id'
        },
        onDelete: 'CASCADE'
      },
      researcher_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      assigned_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: '_user',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      whole_project: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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

    await queryInterface.addConstraint('project_researcher_access', {
      type: 'unique',
      fields: ['project_id', 'researcher_id'],
      name: 'uq_project_researcher_access_project_researcher'
    });

    await queryInterface.addIndex('project_researcher_access', ['project_id'], {
      name: 'idx_project_researcher_access_project'
    });
    await queryInterface.addIndex('project_researcher_access', ['researcher_id'], {
      name: 'idx_project_researcher_access_researcher'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('project_researcher_access');
  }
};