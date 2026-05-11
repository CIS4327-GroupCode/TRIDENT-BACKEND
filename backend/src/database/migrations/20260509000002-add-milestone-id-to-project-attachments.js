'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('project_attachments');

    if (!table.milestone_id) {
      await queryInterface.addColumn('project_attachments', 'milestone_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'milestones',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    const indexes = await queryInterface.showIndex('project_attachments');
    const hasMilestoneIndex = indexes.some((index) => index.name === 'idx_project_attachments_milestone_id');
    const hasProjectMilestoneStatusIndex = indexes.some(
      (index) => index.name === 'idx_project_attachments_project_milestone_status'
    );

    if (!hasMilestoneIndex) {
      await queryInterface.addIndex('project_attachments', ['milestone_id'], {
        name: 'idx_project_attachments_milestone_id'
      });
    }

    if (!hasProjectMilestoneStatusIndex) {
      await queryInterface.addIndex('project_attachments', ['project_id', 'milestone_id', 'status'], {
        name: 'idx_project_attachments_project_milestone_status'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('project_attachments', 'idx_project_attachments_project_milestone_status');
    await queryInterface.removeIndex('project_attachments', 'idx_project_attachments_milestone_id');
    await queryInterface.removeColumn('project_attachments', 'milestone_id');
  }
};