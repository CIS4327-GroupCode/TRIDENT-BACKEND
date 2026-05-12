'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('milestone_revision_requests', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      milestone_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'milestones',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      requested_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending'
      },
      reviewed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: '_user',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      feedback: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('milestone_revision_requests', ['milestone_id'], {
      name: 'idx_milestone_revision_requests_milestone'
    });
    await queryInterface.addIndex('milestone_revision_requests', ['status'], {
      name: 'idx_milestone_revision_requests_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('milestone_revision_requests');
  }
};