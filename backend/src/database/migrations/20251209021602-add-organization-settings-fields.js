"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("organizations", "type", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("organizations", "location", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("organizations", "website", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("organizations", "focus_areas", {
      type: Sequelize.ARRAY(Sequelize.STRING),
      allowNull: true,
    });

    await queryInterface.addColumn("organizations", "budget_range", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("organizations", "team_size", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("organizations", "established_year", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("organizations", "type");
    await queryInterface.removeColumn("organizations", "location");
    await queryInterface.removeColumn("organizations", "website");
    await queryInterface.removeColumn("organizations", "focus_areas");
    await queryInterface.removeColumn("organizations", "budget_range");
    await queryInterface.removeColumn("organizations", "team_size");
    await queryInterface.removeColumn("organizations", "established_year");
  },
};