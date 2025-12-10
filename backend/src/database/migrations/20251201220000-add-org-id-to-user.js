'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add org_id column to _user table
    await queryInterface.addColumn('_user', 'org_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for faster lookups
    await queryInterface.addIndex('_user', ['org_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('_user', ['org_id']);
    await queryInterface.removeColumn('_user', 'org_id');
  }
};
