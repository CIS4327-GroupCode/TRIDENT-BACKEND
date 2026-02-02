'use strict';

/**
 * Migration: Add expertise and additional fields to researcher_profiles
 * 
 * Purpose: Fix SearchPreview bug where expertise doesn't exist
 *          AND prepare for matching algorithm implementation
 * 
 * New fields:
 * - expertise: Critical for matching algorithm (30 points)
 * - compliance_certifications: Already referenced in controller
 * - title: Academic/professional title
 * - institution: University or organization
 * - research_interests: Detailed text description
 * - projects_completed: Track record for scoring
 * - hourly_rate_min/max: Aliases for rate_min/max (clearer naming)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add expertise field (can store comma-separated values or JSON array)
    await queryInterface.addColumn('researcher_profiles', 'expertise', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Comma-separated expertise areas (e.g., "Machine Learning, NLP, Data Analysis")'
    });

    // Add compliance certifications
    await queryInterface.addColumn('researcher_profiles', 'compliance_certifications', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'IRB certifications, ethics training, etc.'
    });

    // Add title (e.g., "PhD Candidate", "Assistant Professor", "Senior Researcher")
    await queryInterface.addColumn('researcher_profiles', 'title', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Academic or professional title'
    });

    // Add institution (university, research center, company)
    await queryInterface.addColumn('researcher_profiles', 'institution', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Primary affiliated institution'
    });

    // Add research interests (detailed description)
    await queryInterface.addColumn('researcher_profiles', 'research_interests', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Detailed description of research interests and focus areas'
    });

    // Add projects completed counter (for experience scoring in matching)
    await queryInterface.addColumn('researcher_profiles', 'projects_completed', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of successfully completed projects on platform'
    });

    // Add hourly rate aliases (clearer naming for matching algorithm)
    await queryInterface.addColumn('researcher_profiles', 'hourly_rate_min', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Minimum hourly rate ($/hour)'
    });

    await queryInterface.addColumn('researcher_profiles', 'hourly_rate_max', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Maximum hourly rate ($/hour)'
    });

    // Add indexes for commonly queried fields
    await queryInterface.addIndex('researcher_profiles', ['expertise'], {
      name: 'idx_researcher_expertise'
    });

    await queryInterface.addIndex('researcher_profiles', ['institution'], {
      name: 'idx_researcher_institution'
    });

    await queryInterface.addIndex('researcher_profiles', ['projects_completed'], {
      name: 'idx_researcher_projects_completed'
    });

    // Copy rate values to hourly_rate fields for existing data
    await queryInterface.sequelize.query(`
      UPDATE researcher_profiles 
      SET hourly_rate_min = rate_min, 
          hourly_rate_max = rate_max 
      WHERE rate_min IS NOT NULL OR rate_max IS NOT NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('researcher_profiles', 'idx_researcher_expertise');
    await queryInterface.removeIndex('researcher_profiles', 'idx_researcher_institution');
    await queryInterface.removeIndex('researcher_profiles', 'idx_researcher_projects_completed');

    // Remove columns
    await queryInterface.removeColumn('researcher_profiles', 'expertise');
    await queryInterface.removeColumn('researcher_profiles', 'compliance_certifications');
    await queryInterface.removeColumn('researcher_profiles', 'title');
    await queryInterface.removeColumn('researcher_profiles', 'institution');
    await queryInterface.removeColumn('researcher_profiles', 'research_interests');
    await queryInterface.removeColumn('researcher_profiles', 'projects_completed');
    await queryInterface.removeColumn('researcher_profiles', 'hourly_rate_min');
    await queryInterface.removeColumn('researcher_profiles', 'hourly_rate_max');
  }
};
