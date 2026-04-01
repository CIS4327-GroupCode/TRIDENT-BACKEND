"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_notification_type'
    );

    await queryInterface.sequelize.query(`
      ALTER TABLE notifications ADD CONSTRAINT valid_notification_type CHECK (
        type IN (
          'project_created', 'project_updated', 'project_deleted',
          'project_status_changed', 'project_submitted_for_review',
          'project_approved', 'project_rejected',
          'milestone_created', 'milestone_updated', 'milestone_completed',
          'milestone_deadline_approaching', 'milestone_overdue',
          'message_received',
          'account_status_changed', 'admin_message',
          'application_received', 'application_accepted', 'application_rejected',
          'new_match_available',
          'rating_received', 'rating_moderated',
          'system_announcement', 'account_verified',
          'invitation',
          'agreement_created', 'agreement_pending_signature',
          'agreement_signed', 'agreement_activated', 'agreement_terminated',
          'user_suspended', 'security'
        )
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_notification_type'
    );

    await queryInterface.sequelize.query(`
      ALTER TABLE notifications ADD CONSTRAINT valid_notification_type CHECK (
        type IN (
          'project_created', 'project_updated', 'project_deleted',
          'project_status_changed', 'project_submitted_for_review',
          'project_approved', 'project_rejected',
          'milestone_created', 'milestone_updated', 'milestone_completed',
          'milestone_deadline_approaching', 'milestone_overdue',
          'message_received',
          'account_status_changed', 'admin_message',
          'application_received', 'application_accepted', 'application_rejected',
          'new_match_available',
          'rating_received',
          'system_announcement', 'account_verified'
        )
      )
    `);
  },
};
