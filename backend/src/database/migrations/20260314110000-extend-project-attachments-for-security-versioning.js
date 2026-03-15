'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('project_attachments');

    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_project_attachments_status\" ADD VALUE IF NOT EXISTS 'quarantined';"
    );

    await queryInterface.sequelize.query(
      "DO $$ BEGIN CREATE TYPE \"enum_project_attachments_scan_status\" AS ENUM ('pending', 'clean', 'infected', 'error'); EXCEPTION WHEN duplicate_object THEN null; END $$;"
    );

    if (!table.version) {
      await queryInterface.addColumn('project_attachments', 'version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      });
    }

    if (!table.is_latest) {
      await queryInterface.addColumn('project_attachments', 'is_latest', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    if (!table.scan_status) {
      await queryInterface.addColumn('project_attachments', 'scan_status', {
        type: Sequelize.ENUM('pending', 'clean', 'infected', 'error'),
        allowNull: false,
        defaultValue: 'pending'
      });
    }

    if (!table.scanned_at) {
      await queryInterface.addColumn('project_attachments', 'scanned_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!table.quarantine_reason) {
      await queryInterface.addColumn('project_attachments', 'quarantine_reason', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    if (!table.retention_expires_at) {
      await queryInterface.addColumn('project_attachments', 'retention_expires_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    const existingIndexes = await queryInterface.showIndex('project_attachments');
    const hasProjectFilenameVersionIndex = existingIndexes.some(
      (index) => index.name === 'idx_project_attachments_project_filename_version'
    );
    const hasRetentionExpiryIndex = existingIndexes.some(
      (index) => index.name === 'idx_project_attachments_retention_expires_at'
    );

    if (!hasProjectFilenameVersionIndex) {
      await queryInterface.addIndex('project_attachments', ['project_id', 'filename', 'version'], {
        name: 'idx_project_attachments_project_filename_version',
        unique: true
      });
    }

    if (!hasRetentionExpiryIndex) {
      await queryInterface.addIndex('project_attachments', ['retention_expires_at'], {
        name: 'idx_project_attachments_retention_expires_at'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('project_attachments', 'idx_project_attachments_retention_expires_at');
    await queryInterface.removeIndex('project_attachments', 'idx_project_attachments_project_filename_version');

    await queryInterface.removeColumn('project_attachments', 'retention_expires_at');
    await queryInterface.removeColumn('project_attachments', 'quarantine_reason');
    await queryInterface.removeColumn('project_attachments', 'scanned_at');
    await queryInterface.removeColumn('project_attachments', 'scan_status');
    await queryInterface.removeColumn('project_attachments', 'is_latest');
    await queryInterface.removeColumn('project_attachments', 'version');

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_project_attachments_scan_status";');
  }
};