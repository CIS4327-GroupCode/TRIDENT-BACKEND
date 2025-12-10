'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organizations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      EIN: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      mission: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      focus_tags: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      compliance_flags: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      contacts: {
        type: Sequelize.STRING(255),
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('organizations', ['name']);
    await queryInterface.addIndex('organizations', ['EIN']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('organizations');
  }
};
