'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add status column if it doesn't exist
    try {
      await queryInterface.addColumn('agreements', 'status', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'pending'
      });
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }

    // Add metadata column if it doesn't exist
    try {
      await queryInterface.addColumn('agreements', 'metadata', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null
      });
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }

    // Add timestamps if they don't exist
    try {
      await queryInterface.addColumn('agreements', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      });
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }

    try {
      await queryInterface.addColumn('agreements', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      });
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }

    // Add indexes for common queries
    try {
      await queryInterface.addIndex('agreements', ['researcher_id', 'status'], {
        name: 'idx_agreements_researcher_status'
      });
    } catch (err) {
      // Index might already exist
    }

    try {
      await queryInterface.addIndex('agreements', ['org_id', 'status'], {
        name: 'idx_agreements_org_status'
      });
    } catch (err) {
      // Index might already exist
    }
  },

  async down(queryInterface, Sequelize) {
    // This is a careful down migration since we're modifying legacy table
    // We won't remove columns as they might be critical for existing code
    
    try {
      await queryInterface.removeIndex('agreements', 'idx_agreements_researcher_status');
    } catch (err) {
      // Index might not exist
    }

    try {
      await queryInterface.removeIndex('agreements', 'idx_agreements_org_status');
    } catch (err) {
      // Index might not exist
    }
  }
};
