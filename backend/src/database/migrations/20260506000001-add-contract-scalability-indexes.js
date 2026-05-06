'use strict';

function normalizeIndexFields(index) {
  return (index.fields || [])
    .map((field) => field.attribute || field.name || field.field)
    .filter(Boolean);
}

function hasIndex(existingIndexes, name, fields) {
  return existingIndexes.some((index) => {
    if (index.name === name) {
      return true;
    }

    const indexFields = normalizeIndexFields(index);
    return indexFields.length === fields.length && indexFields.every((field, idx) => field === fields[idx]);
  });
}

module.exports = {
  async up(queryInterface) {
    const existingIndexes = await queryInterface.showIndex('contracts');

    const indexesToAdd = [
      {
        name: 'idx_contracts_app_template_current_status',
        fields: ['application_id', 'template_type', 'is_current_version', 'status']
      },
      {
        name: 'idx_contracts_supersedes_status',
        fields: ['supersedes_contract_id', 'status']
      },
      {
        name: 'idx_contracts_root_version_created',
        fields: ['root_contract_id', 'version_number', 'created_at']
      },
      {
        name: 'idx_contracts_nonprofit_updated_at',
        fields: ['nonprofit_user_id', 'updated_at']
      },
      {
        name: 'idx_contracts_researcher_updated_at',
        fields: ['researcher_user_id', 'updated_at']
      }
    ];

    for (const indexDef of indexesToAdd) {
      if (!hasIndex(existingIndexes, indexDef.name, indexDef.fields)) {
        await queryInterface.addIndex('contracts', indexDef.fields, { name: indexDef.name });
        existingIndexes.push({
          name: indexDef.name,
          fields: indexDef.fields.map((field) => ({ attribute: field }))
        });
      }
    }

    const hasUniqueCurrentOpenIndex = existingIndexes.some(
      (index) => index.name === 'uq_contracts_current_open_by_application_template'
    );

    if (!hasUniqueCurrentOpenIndex) {
      const [duplicates] = await queryInterface.sequelize.query(`
        SELECT application_id, template_type
        FROM contracts
        WHERE is_current_version = TRUE
          AND status IN (
            'draft',
            'internal_review',
            'counterparty_review',
            'changes_requested',
            'approved_for_signature',
            'pending_signature',
            'executed',
            'effective',
            'active'
          )
        GROUP BY application_id, template_type
        HAVING COUNT(*) > 1
        LIMIT 1
      `);

      if (!duplicates.length) {
        await queryInterface.sequelize.query(`
          CREATE UNIQUE INDEX uq_contracts_current_open_by_application_template
          ON contracts (application_id, template_type)
          WHERE is_current_version = TRUE
            AND status IN (
              'draft',
              'internal_review',
              'counterparty_review',
              'changes_requested',
              'approved_for_signature',
              'pending_signature',
              'executed',
              'effective',
              'active'
            )
        `);
      }
    }
  },

  async down(queryInterface) {
    const existingIndexes = await queryInterface.showIndex('contracts');
    const existingNames = new Set(existingIndexes.map((index) => index.name));

    const indexesToRemove = [
      'uq_contracts_current_open_by_application_template',
      'idx_contracts_researcher_updated_at',
      'idx_contracts_nonprofit_updated_at',
      'idx_contracts_root_version_created',
      'idx_contracts_supersedes_status',
      'idx_contracts_app_template_current_status'
    ];

    for (const indexName of indexesToRemove) {
      if (existingNames.has(indexName)) {
        await queryInterface.removeIndex('contracts', indexName);
      }
    }
  }
};
