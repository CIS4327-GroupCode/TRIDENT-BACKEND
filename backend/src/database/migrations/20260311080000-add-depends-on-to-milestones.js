'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('milestones', 'depends_on', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'milestones',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('milestones', ['depends_on'], {
      name: 'idx_milestones_depends_on'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('milestones', 'idx_milestones_depends_on');
    await queryInterface.removeColumn('milestones', 'depends_on');
  }
};
