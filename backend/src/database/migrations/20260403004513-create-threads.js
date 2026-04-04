'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('threads', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      thread_type: {
        type: Sequelize.ENUM('direct', 'group'),
        allowNull: false,
      },

      direct_key: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      project_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      nonprofit_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      is_sensitive: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('threads');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_threads_thread_type";');
  },
};