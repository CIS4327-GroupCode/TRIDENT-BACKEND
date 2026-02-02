'use strict';

/**
 * Migration: Fix email_verifications and password_resets tables - add user_id column
 * 
 * Issue: These tables were created without the user_id column due to a migration issue.
 * This adds it back to both tables.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Fix email_verifications table
    const emailVerificationsTable = await queryInterface.describeTable('email_verifications');
    
    if (!emailVerificationsTable.user_id) {
      console.log('Adding user_id column to email_verifications table...');
      
      await queryInterface.addColumn('email_verifications', 'user_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1, // Temporary default for existing rows
        references: {
          model: '_user',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });

      // Add index
      await queryInterface.addIndex('email_verifications', ['user_id'], {
        name: 'idx_email_verifications_user_id'
      });

      console.log('user_id column added to email_verifications successfully');
    } else {
      console.log('email_verifications.user_id already exists, skipping...');
    }

    // Fix password_resets table
    const passwordResetsTable = await queryInterface.describeTable('password_resets');
    
    if (!passwordResetsTable.user_id) {
      console.log('Adding user_id column to password_resets table...');
      
      await queryInterface.addColumn('password_resets', 'user_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1, // Temporary default for existing rows
        references: {
          model: '_user',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });

      // Add index
      await queryInterface.addIndex('password_resets', ['user_id'], {
        name: 'idx_password_resets_user_id'
      });

      console.log('user_id column added to password_resets successfully');
    } else {
      console.log('password_resets.user_id already exists, skipping...');
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove email_verifications index and column
    try {
      await queryInterface.removeIndex('email_verifications', 'idx_email_verifications_user_id');
    } catch (err) {
      console.log('email_verifications index does not exist, skipping...');
    }
    
    try {
      await queryInterface.removeColumn('email_verifications', 'user_id');
    } catch (err) {
      console.log('email_verifications.user_id does not exist, skipping...');
    }

    // Remove password_resets index and column
    try {
      await queryInterface.removeIndex('password_resets', 'idx_password_resets_user_id');
    } catch (err) {
      console.log('password_resets index does not exist, skipping...');
    }
    
    try {
      await queryInterface.removeColumn('password_resets', 'user_id');
    } catch (err) {
      console.log('password_resets.user_id does not exist, skipping...');
    }
  }
};
