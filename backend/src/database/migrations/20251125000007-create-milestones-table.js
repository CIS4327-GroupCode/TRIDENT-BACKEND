'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM type for status
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_milestones_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('milestones', {
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
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      due_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
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

    // Add indexes for performance
    await queryInterface.addIndex('milestones', ['project_id'], {
      name: 'idx_milestones_project_id'
    });
    await queryInterface.addIndex('milestones', ['status'], {
      name: 'idx_milestones_status'
    });
    await queryInterface.addIndex('milestones', ['due_date'], {
      name: 'idx_milestones_due_date'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('milestones');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_milestones_status;');
  }
};
