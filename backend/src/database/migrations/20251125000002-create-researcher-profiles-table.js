'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('researcher_profiles', {
      user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      affiliation: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      domains: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      methods: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      tools: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rate_min: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      rate_max: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      availability: {
        type: Sequelize.STRING(255),
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('researcher_profiles', ['user_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('researcher_profiles');
  }
};
