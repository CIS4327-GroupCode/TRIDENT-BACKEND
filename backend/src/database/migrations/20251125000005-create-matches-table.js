'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('matches', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      score: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      reason_codes: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      brief_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_ideas',
          key: 'project_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      researcher_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'researcher_profiles',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      }
    });

    // Add indexes
    await queryInterface.addIndex('matches', ['brief_id']);
    await queryInterface.addIndex('matches', ['researcher_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('matches');
  }
};
