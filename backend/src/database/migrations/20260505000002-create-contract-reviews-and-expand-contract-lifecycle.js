'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const contractTable = await queryInterface.describeTable('contracts');

    await queryInterface.sequelize.query(
      `DO $$ BEGIN
        CREATE TYPE "enum_contracts_status_next" AS ENUM (
          'draft',
          'internal_review',
          'counterparty_review',
          'changes_requested',
          'approved_for_signature',
          'pending_signature',
          'executed',
          'effective',
          'active',
          'completed',
          'terminated',
          'expired',
          'archived'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;`
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE contracts
       ALTER COLUMN status DROP DEFAULT,
       ALTER COLUMN status TYPE "enum_contracts_status_next"
       USING (
         CASE status::text
           WHEN 'signed' THEN 'executed'
           ELSE status::text
         END
       )::"enum_contracts_status_next"`
    );

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contracts_status";');
    await queryInterface.sequelize.query('ALTER TYPE "enum_contracts_status_next" RENAME TO "enum_contracts_status";');
    await queryInterface.sequelize.query("ALTER TABLE contracts ALTER COLUMN status SET DEFAULT 'draft';");

    await queryInterface.sequelize.query(
      "DO $$ BEGIN CREATE TYPE \"enum_contracts_data_classification\" AS ENUM ('public', 'internal', 'confidential', 'restricted'); EXCEPTION WHEN duplicate_object THEN null; END $$;"
    );

    if (!contractTable.template_version_id) {
      await queryInterface.addColumn('contracts', 'template_version_id', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }

    if (!contractTable.review_required) {
      await queryInterface.addColumn('contracts', 'review_required', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!contractTable.contains_sensitive_data) {
      await queryInterface.addColumn('contracts', 'contains_sensitive_data', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!contractTable.data_classification) {
      await queryInterface.addColumn('contracts', 'data_classification', {
        type: Sequelize.ENUM('public', 'internal', 'confidential', 'restricted'),
        allowNull: false,
        defaultValue: 'internal'
      });
    }

    if (!contractTable.retention_period_days) {
      await queryInterface.addColumn('contracts', 'retention_period_days', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!contractTable.destruction_required) {
      await queryInterface.addColumn('contracts', 'destruction_required', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!contractTable.effective_at) {
      await queryInterface.addColumn('contracts', 'effective_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!contractTable.completed_at) {
      await queryInterface.addColumn('contracts', 'completed_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!contractTable.archived_at) {
      await queryInterface.addColumn('contracts', 'archived_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE contracts
      SET
        template_version_id = COALESCE(template_version_id, template_type || ':v1'),
        review_required = COALESCE(review_required, false),
        contains_sensitive_data = COALESCE(contains_sensitive_data, false),
        data_classification = COALESCE(data_classification, 'internal'),
        destruction_required = COALESCE(destruction_required, false),
        effective_at = CASE WHEN status = 'active' AND effective_at IS NULL THEN NOW() ELSE effective_at END
    `);

    await queryInterface.createTable('contract_reviews', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      contract_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'contracts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reviewer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      review_stage: {
        type: Sequelize.ENUM('submission', 'internal_review', 'counterparty_review', 'post_execution'),
        allowNull: false
      },
      action: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      previous_status: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      new_status: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      feedback: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      changes_requested: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('contract_reviews', ['contract_id'], {
      name: 'idx_contract_reviews_contract_id'
    });
    await queryInterface.addIndex('contract_reviews', ['reviewer_id'], {
      name: 'idx_contract_reviews_reviewer_id'
    });
    await queryInterface.addIndex('contract_reviews', ['contract_id', 'created_at'], {
      name: 'idx_contract_reviews_contract_created_at'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('contract_reviews', 'idx_contract_reviews_contract_created_at');
    await queryInterface.removeIndex('contract_reviews', 'idx_contract_reviews_reviewer_id');
    await queryInterface.removeIndex('contract_reviews', 'idx_contract_reviews_contract_id');
    await queryInterface.dropTable('contract_reviews');

    await queryInterface.removeColumn('contracts', 'archived_at');
    await queryInterface.removeColumn('contracts', 'completed_at');
    await queryInterface.removeColumn('contracts', 'effective_at');
    await queryInterface.removeColumn('contracts', 'destruction_required');
    await queryInterface.removeColumn('contracts', 'retention_period_days');
    await queryInterface.removeColumn('contracts', 'data_classification');
    await queryInterface.removeColumn('contracts', 'contains_sensitive_data');
    await queryInterface.removeColumn('contracts', 'review_required');
    await queryInterface.removeColumn('contracts', 'template_version_id');

    await queryInterface.sequelize.query(
      `DO $$ BEGIN
        CREATE TYPE "enum_contracts_status_prev" AS ENUM ('draft', 'pending_signature', 'signed', 'active', 'terminated', 'expired');
      EXCEPTION WHEN duplicate_object THEN null; END $$;`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE contracts
       ALTER COLUMN status DROP DEFAULT,
       ALTER COLUMN status TYPE "enum_contracts_status_prev"
       USING (
         CASE status::text
           WHEN 'executed' THEN 'signed'
           WHEN 'effective' THEN 'active'
           WHEN 'completed' THEN 'active'
           WHEN 'archived' THEN 'terminated'
           WHEN 'internal_review' THEN 'draft'
           WHEN 'counterparty_review' THEN 'draft'
           WHEN 'changes_requested' THEN 'draft'
           WHEN 'approved_for_signature' THEN 'draft'
           ELSE status::text
         END
       )::"enum_contracts_status_prev"`
    );
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contracts_status";');
    await queryInterface.sequelize.query('ALTER TYPE "enum_contracts_status_prev" RENAME TO "enum_contracts_status";');
    await queryInterface.sequelize.query("ALTER TABLE contracts ALTER COLUMN status SET DEFAULT 'draft';");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contract_reviews_review_stage";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contracts_data_classification";');
  }
};