'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('saved_projects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'project_ideas',
          key: 'project_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('saved_projects', ['user_id']);
    await queryInterface.addIndex('saved_projects', ['project_id']);
    await queryInterface.addConstraint('saved_projects', {
      fields: ['user_id', 'project_id'],
      type: 'unique',
      name: 'saved_projects_user_project_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('saved_projects', 'saved_projects_user_project_unique');
    await queryInterface.dropTable('saved_projects');
  },
};
