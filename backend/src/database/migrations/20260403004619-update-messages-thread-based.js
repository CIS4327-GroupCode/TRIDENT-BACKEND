'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add id if missing
    await queryInterface.addColumn('messages', 'id', {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    });

    // Add thread_id
    await queryInterface.addColumn('messages', 'thread_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'threads',
        key: 'id',
      },
      onDelete: 'CASCADE',
    });

    // Remove old direct messaging fields
    await queryInterface.removeColumn('messages', 'recipient_id');

    // Optional: remove old attachments column
    try {
      await queryInterface.removeColumn('messages', 'attachments');
    } catch (err) {
      // ignore if doesn't exist
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('messages', 'thread_id');

    await queryInterface.addColumn('messages', 'recipient_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};