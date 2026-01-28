/**
 * Fix Missing Tables
 * Re-creates notifications, email_verifications, and password_resets tables
 * that were marked as migrated but don't actually exist
 */

require('dotenv').config();
const { sequelize } = require('./src/database/models');

async function fixMissingTables() {
  try {
    console.log('🔧 Fixing missing tables...\n');

    // Create notifications table
    console.log('Creating notifications table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_notification_type CHECK (
          type IN (
            'project_created', 'project_updated', 'project_deleted', 'project_status_changed',
            'project_submitted_for_review', 'project_approved', 'project_rejected',
            'milestone_created', 'milestone_updated', 'milestone_completed',
            'milestone_deadline_approaching', 'milestone_overdue',
            'message_received', 'account_status_changed', 'admin_message',
            'application_received', 'application_accepted', 'application_rejected',
            'new_match_available', 'rating_received', 'system_announcement', 'account_verified'
          )
        )
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_archived_created ON notifications(archived, created_at DESC);
    `);
    console.log('✅ notifications table created\n');

    // Create email_verifications table
    console.log('Creating email_verifications table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'researcher',
        org_id INTEGER REFERENCES organizations(id),
        verification_token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_role CHECK (role IN ('nonprofit', 'researcher', 'admin'))
      );

      CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(verification_token);
      CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
      CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);
    `);
    console.log('✅ email_verifications table created\n');

    // Create password_resets table
    console.log('Creating password_resets table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
        reset_token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(reset_token);
      CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);
    `);
    console.log('✅ password_resets table created\n');

    console.log('🎉 All missing tables have been created!\n');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    try {
      await sequelize.close();
    } catch (e) {}
    process.exit(1);
  }
}

fixMissingTables();
