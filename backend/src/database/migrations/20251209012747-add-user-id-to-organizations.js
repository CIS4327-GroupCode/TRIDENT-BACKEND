'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('organizations', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true, // safer for now; you can tighten later
      references: {
        model: '_user',   // name of your users table
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // or 'CASCADE' if you want org deleted with user
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('organizations', 'user_id');
  },
};