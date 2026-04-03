'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const threadsTable = await queryInterface.describeTable('threads').catch(() => null);
    if (!threadsTable) {
      throw new Error('threads table does not exist');
    }

    if (!threadsTable.last_message_at) {
      await queryInterface.addColumn('threads', 'last_message_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE threads t
      SET last_message_at = sub.max_created_at
      FROM (
        SELECT thread_id, MAX(created_at) AS max_created_at
        FROM messages
        GROUP BY thread_id
      ) sub
      WHERE t.id = sub.thread_id;
    `);

    try {
      await queryInterface.addIndex('messages', ['thread_id', 'created_at'], {
        name: 'idx_messages_thread_id_created_at',
      });
    } catch (err) {
      console.log('Skipping idx_messages_thread_id_created_at');
    }

    try {
      await queryInterface.addIndex('messages', ['sender_id'], {
        name: 'idx_messages_sender_id',
      });
    } catch (err) {
      console.log('Skipping idx_messages_sender_id');
    }

    try {
      await queryInterface.addIndex('thread_participants', ['user_id'], {
        name: 'idx_thread_participants_user_id',
      });
    } catch (err) {
      console.log('Skipping idx_thread_participants_user_id');
    }

    try {
      await queryInterface.addIndex('thread_participants', ['thread_id'], {
        name: 'idx_thread_participants_thread_id',
      });
    } catch (err) {
      console.log('Skipping idx_thread_participants_thread_id');
    }

    try {
      await queryInterface.addIndex('thread_participants', ['thread_id', 'user_id'], {
        name: 'idx_thread_participants_thread_user_unique',
        unique: true,
      });
    } catch (err) {
      console.log('Skipping idx_thread_participants_thread_user_unique');
    }

    try {
      await queryInterface.addIndex('threads', ['project_id'], {
        name: 'idx_threads_project_id',
      });
    } catch (err) {
      console.log('Skipping idx_threads_project_id');
    }

    try {
      await queryInterface.addIndex('threads', ['nonprofit_id'], {
        name: 'idx_threads_nonprofit_id',
      });
    } catch (err) {
      console.log('Skipping idx_threads_nonprofit_id');
    }

    try {
      await queryInterface.addIndex('threads', ['last_message_at'], {
        name: 'idx_threads_last_message_at',
      });
    } catch (err) {
      console.log('Skipping idx_threads_last_message_at');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('threads', 'idx_threads_last_message_at');
    } catch {}
    try {
      await queryInterface.removeIndex('threads', 'idx_threads_nonprofit_id');
    } catch {}
    try {
      await queryInterface.removeIndex('threads', 'idx_threads_project_id');
    } catch {}
    try {
      await queryInterface.removeIndex('thread_participants', 'idx_thread_participants_thread_user_unique');
    } catch {}
    try {
      await queryInterface.removeIndex('thread_participants', 'idx_thread_participants_thread_id');
    } catch {}
    try {
      await queryInterface.removeIndex('thread_participants', 'idx_thread_participants_user_id');
    } catch {}
    try {
      await queryInterface.removeIndex('messages', 'idx_messages_sender_id');
    } catch {}
    try {
      await queryInterface.removeIndex('messages', 'idx_messages_thread_id_created_at');
    } catch {}

    const threadsTable = await queryInterface.describeTable('threads').catch(() => null);
    if (threadsTable?.last_message_at) {
      await queryInterface.removeColumn('threads', 'last_message_at');
    }
  },
};