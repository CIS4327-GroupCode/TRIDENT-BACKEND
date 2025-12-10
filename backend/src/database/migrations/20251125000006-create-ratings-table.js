'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ratings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      from_party: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      scores: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      comments: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_ideas',
          key: 'project_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      rated_by_user_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('ratings', ['project_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ratings');
  }
};
