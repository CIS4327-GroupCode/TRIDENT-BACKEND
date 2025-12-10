'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_reviews', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'project_ideas',
          key: 'project_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reviewer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      action: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'approved, rejected, needs_revision, submitted'
      },
      previous_status: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      new_status: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      feedback: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Admin feedback or rejection reason'
      },
      changes_requested: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Specific changes requested by admin'
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add index for faster lookups
    await queryInterface.addIndex('project_reviews', ['project_id']);
    await queryInterface.addIndex('project_reviews', ['reviewer_id']);
    await queryInterface.addIndex('project_reviews', ['action']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_reviews');
  }
};
