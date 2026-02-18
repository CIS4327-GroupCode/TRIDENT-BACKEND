'use strict';

/**
 * Migration: Add matching algorithm fields to existing tables
 * 
 * This migration adds fields needed for the matching algorithm Phase 1:
 * - Projects: budget_max, estimated_hours, start_date
 * - Researcher Profiles: current_projects_count, max_concurrent_projects, available_start_date
 * - Organizations: focus_areas (for domain matching)
 * 
 * Note: We skip array columns and parse comma-separated text on-the-fly for performance
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      const table = await queryInterface.describeTable(tableName);
      return table[columnName] !== undefined;
    };

    // Add fields to project_ideas table
    if (!(await columnExists('project_ideas', 'budget_max'))) {
      await queryInterface.addColumn('project_ideas', 'budget_max', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Maximum budget (upper limit) for matching algorithm'
      });
    }

    if (!(await columnExists('project_ideas', 'estimated_hours'))) {
      await queryInterface.addColumn('project_ideas', 'estimated_hours', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Expected project hours for budget compatibility calculation'
      });
    }

    if (!(await columnExists('project_ideas', 'start_date'))) {
      await queryInterface.addColumn('project_ideas', 'start_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Preferred start date for availability matching'
      });
    }

    // Add fields to researcher_profiles table
    if (!(await columnExists('researcher_profiles', 'current_projects_count'))) {
      await queryInterface.addColumn('researcher_profiles', 'current_projects_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of active projects for capacity calculation'
      });
    }

    if (!(await columnExists('researcher_profiles', 'max_concurrent_projects'))) {
      await queryInterface.addColumn('researcher_profiles', 'max_concurrent_projects', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: 'Maximum projects researcher can handle simultaneously'
      });
    }

    if (!(await columnExists('researcher_profiles', 'available_start_date'))) {
      await queryInterface.addColumn('researcher_profiles', 'available_start_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Earliest date researcher is available to start new projects'
      });
    }

    // Add fields to organizations table for domain matching
    if (!(await columnExists('organizations', 'focus_areas'))) {
      await queryInterface.addColumn('organizations', 'focus_areas', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Comma-separated research domains/focus areas for matching'
      });
    }

    console.log('✓ Matching algorithm fields added successfully');
  },

  down: async (queryInterface, Sequelize) => {
    // Remove fields from project_ideas
    await queryInterface.removeColumn('project_ideas', 'budget_max');
    await queryInterface.removeColumn('project_ideas', 'estimated_hours');
    await queryInterface.removeColumn('project_ideas', 'start_date');

    // Remove fields from researcher_profiles
    await queryInterface.removeColumn('researcher_profiles', 'current_projects_count');
    await queryInterface.removeColumn('researcher_profiles', 'max_concurrent_projects');
    await queryInterface.removeColumn('researcher_profiles', 'available_start_date');

    // Remove fields from organizations
    await queryInterface.removeColumn('organizations', 'focus_areas');

    console.log('✓ Matching algorithm fields removed');
  }
};
