'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('milestone_researchers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      milestone_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'milestones',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      researcher_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assigned_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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

    await queryInterface.addIndex('milestone_researchers', ['milestone_id'], {
      name: 'idx_milestone_researchers_milestone_id'
    });

    await queryInterface.addIndex('milestone_researchers', ['researcher_id'], {
      name: 'idx_milestone_researchers_researcher_id'
    });

    await queryInterface.addIndex('milestone_researchers', ['assigned_by'], {
      name: 'idx_milestone_researchers_assigned_by'
    });

    await queryInterface.addConstraint('milestone_researchers', {
      fields: ['milestone_id', 'researcher_id'],
      type: 'unique',
      name: 'uq_milestone_researchers_milestone_researcher'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('milestone_researchers', 'uq_milestone_researchers_milestone_researcher');
    await queryInterface.removeIndex('milestone_researchers', 'idx_milestone_researchers_assigned_by');
    await queryInterface.removeIndex('milestone_researchers', 'idx_milestone_researchers_researcher_id');
    await queryInterface.removeIndex('milestone_researchers', 'idx_milestone_researchers_milestone_id');
    await queryInterface.dropTable('milestone_researchers');
  }
};