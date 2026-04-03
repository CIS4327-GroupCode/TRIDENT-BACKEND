'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('messages');

    // ✅ Add id ONLY if it doesn't exist
    if (!table.id) {
      await queryInterface.addColumn('messages', 'id', {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      });
    }

    // ✅ Add thread_id ONLY if it doesn't exist
    if (!table.thread_id) {
      await queryInterface.addColumn('messages', 'thread_id', {
        type: Sequelize.INTEGER,
        allowNull: true, // temporarily allow null for safety
        references: {
          model: 'threads',
          key: 'id',
        },
        onDelete: 'CASCADE',
      });
    }

    // ✅ Remove recipient_id ONLY if it exists
    if (table.recipient_id) {
      await queryInterface.removeColumn('messages', 'recipient_id');
    }

    // ✅ Remove attachments column ONLY if it exists
    if (table.attachments) {
      await queryInterface.removeColumn('messages', 'attachments');
    }

    // 🔒 Optional: enforce NOT NULL after migration is safe
    try {
      await queryInterface.changeColumn('messages', 'thread_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'threads',
          key: 'id',
        },
        onDelete: 'CASCADE',
      });
    } catch (err) {
      console.log('Skipping NOT NULL enforcement (likely already set)');
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('messages');

    if (table.thread_id) {
      await queryInterface.removeColumn('messages', 'thread_id');
    }

    if (!table.recipient_id) {
      await queryInterface.addColumn('messages', 'recipient_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },
};