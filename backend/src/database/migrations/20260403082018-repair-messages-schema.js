'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Drop wrong PK / unique constraints
      await queryInterface.sequelize.query(`
        ALTER TABLE "messages"
        DROP CONSTRAINT IF EXISTS "messages_pkey";
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE "messages"
        DROP CONSTRAINT IF EXISTS "messages_thread_id_key";
      `, { transaction });

      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS "messages_thread_id_key";
      `, { transaction });

      // 2. Ensure id column exists
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'messages'
              AND column_name = 'id'
          ) THEN
            ALTER TABLE "messages" ADD COLUMN "id" SERIAL;
          END IF;
        END $$;
      `, { transaction });

      // 3. Ensure id is NOT NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE "messages"
        ALTER COLUMN "id" SET NOT NULL;
      `, { transaction });

      // 4. Recreate proper PK on id
      await queryInterface.sequelize.query(`
        ALTER TABLE "messages"
        ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");
      `, { transaction });

      // 5. Fix sequence
      await queryInterface.sequelize.query(`
        SELECT setval(
          pg_get_serial_sequence('messages', 'id'),
          COALESCE((SELECT MAX(id) FROM "messages"), 1),
          true
        );
      `, { transaction });

      // 6. Recreate indexes (non-unique)
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS "messages_thread_id_idx"
        ON "messages" ("thread_id");
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS "messages_sender_id_idx"
        ON "messages" ("sender_id");
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS "messages_thread_created_at_idx"
        ON "messages" ("thread_id", "created_at");
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {
    throw new Error('repair-messages-schema is not reversible');
  }
};