'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('contracts');
    const existingIndexes = await queryInterface.showIndex('contracts');

    await queryInterface.sequelize.query(
      "DO $$ BEGIN CREATE TYPE \"enum_contracts_source_kind\" AS ENUM ('template', 'attachment', 'free_text'); EXCEPTION WHEN duplicate_object THEN null; END $$;"
    );

    if (!table.source_kind) {
      await queryInterface.addColumn('contracts', 'source_kind', {
        type: Sequelize.ENUM('template', 'attachment', 'free_text'),
        allowNull: false,
        defaultValue: 'template'
      });
    }

    if (!table.uploaded_attachment_id) {
      await queryInterface.addColumn('contracts', 'uploaded_attachment_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_attachments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!table.content_snapshot) {
      await queryInterface.addColumn('contracts', 'content_snapshot', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    if (!table.executed_filename) {
      await queryInterface.addColumn('contracts', 'executed_filename', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }

    if (!table.executed_mimetype) {
      await queryInterface.addColumn('contracts', 'executed_mimetype', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }

    if (!table.parent_contract_id) {
      await queryInterface.addColumn('contracts', 'parent_contract_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'contracts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!table.root_contract_id) {
      await queryInterface.addColumn('contracts', 'root_contract_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'contracts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!table.supersedes_contract_id) {
      await queryInterface.addColumn('contracts', 'supersedes_contract_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'contracts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!table.version_number) {
      await queryInterface.addColumn('contracts', 'version_number', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      });
    }

    if (!table.is_current_version) {
      await queryInterface.addColumn('contracts', 'is_current_version', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE contracts
      SET
        source_kind = COALESCE(source_kind, 'template'),
        content_snapshot = COALESCE(content_snapshot, rendered_content),
        version_number = COALESCE(version_number, 1),
        is_current_version = COALESCE(is_current_version, true),
        root_contract_id = COALESCE(root_contract_id, id)
    `);

    const hasCurrentVersionIndex = existingIndexes.some(
      (index) => index.name === 'idx_contracts_application_template_current'
    );
    const hasSupersedesIndex = existingIndexes.some(
      (index) => index.name === 'idx_contracts_supersedes_contract_id'
    );

    if (!hasCurrentVersionIndex) {
      await queryInterface.addIndex('contracts', ['application_id', 'template_type', 'is_current_version'], {
        name: 'idx_contracts_application_template_current'
      });
    }

    if (!hasSupersedesIndex) {
      await queryInterface.addIndex('contracts', ['supersedes_contract_id'], {
        name: 'idx_contracts_supersedes_contract_id'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('contracts', 'idx_contracts_supersedes_contract_id');
    await queryInterface.removeIndex('contracts', 'idx_contracts_application_template_current');

    await queryInterface.removeColumn('contracts', 'is_current_version');
    await queryInterface.removeColumn('contracts', 'version_number');
    await queryInterface.removeColumn('contracts', 'supersedes_contract_id');
    await queryInterface.removeColumn('contracts', 'root_contract_id');
    await queryInterface.removeColumn('contracts', 'parent_contract_id');
    await queryInterface.removeColumn('contracts', 'executed_mimetype');
    await queryInterface.removeColumn('contracts', 'executed_filename');
    await queryInterface.removeColumn('contracts', 'content_snapshot');
    await queryInterface.removeColumn('contracts', 'uploaded_attachment_id');
    await queryInterface.removeColumn('contracts', 'source_kind');

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contracts_source_kind";');
  }
};