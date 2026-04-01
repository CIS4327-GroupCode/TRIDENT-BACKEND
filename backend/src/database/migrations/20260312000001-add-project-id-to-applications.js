'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('agreements');

    if (!table.project_id) {
      await queryInterface.addColumn('agreements', 'project_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_ideas',
          key: 'project_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // Backfill project_id from metadata JSONB when available.
    await queryInterface.sequelize.query(`
      UPDATE agreements
      SET project_id = NULLIF(metadata->>'project_id', '')::INTEGER
      WHERE project_id IS NULL
        AND metadata IS NOT NULL
        AND metadata ? 'project_id'
    `);

    await queryInterface.addIndex('agreements', ['researcher_id', 'project_id'], {
      name: 'idx_agreements_researcher_project'
    });

    await queryInterface.addIndex('agreements', ['researcher_id', 'project_id', 'type'], {
      name: 'uniq_pending_application_per_project',
      unique: true,
      where: {
        status: 'pending'
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('agreements', 'uniq_pending_application_per_project');
    await queryInterface.removeIndex('agreements', 'idx_agreements_researcher_project');

    const table = await queryInterface.describeTable('agreements');
    if (table.project_id) {
      await queryInterface.removeColumn('agreements', 'project_id');
    }
  }
};
