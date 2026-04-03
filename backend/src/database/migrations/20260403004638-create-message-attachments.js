'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const normalizedTables = tables.map((t) =>
      typeof t === 'string' ? t : t.tableName || t.table_name
    );

    if (!normalizedTables.includes('message_attachments')) {
      const messagesTable = await queryInterface.describeTable('messages');

      if (!messagesTable.id) {
        throw new Error('messages.id does not exist, cannot create message_attachments');
      }

      try {
        await queryInterface.addConstraint('messages', {
          fields: ['id'],
          type: 'unique',
          name: 'messages_id_unique_for_attachments_fk',
        });
      } catch (err) {
        console.log('Skipping unique constraint on messages.id (likely already exists)');
      }

      await queryInterface.createTable('message_attachments', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        message_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'messages',
            key: 'id',
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        file_url: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        file_name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const normalizedTables = tables.map((t) =>
      typeof t === 'string' ? t : t.tableName || t.table_name
    );

    if (normalizedTables.includes('message_attachments')) {
      await queryInterface.dropTable('message_attachments');
    }

    try {
      await queryInterface.removeConstraint('messages', 'messages_id_unique_for_attachments_fk');
    } catch (err) {
      console.log('Skipping unique constraint removal');
    }
  },
};