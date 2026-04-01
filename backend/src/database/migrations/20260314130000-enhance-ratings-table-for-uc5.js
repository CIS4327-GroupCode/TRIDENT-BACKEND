'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DELETE FROM ratings r
      USING ratings dup
      WHERE r.project_id = dup.project_id
        AND NULLIF(r.rated_by_user_id, '') = NULLIF(dup.rated_by_user_id, '')
        AND r.id < dup.id;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE ratings
      ALTER COLUMN scores TYPE JSONB
      USING CASE
        WHEN scores IS NULL OR trim(scores) = '' THEN NULL
        ELSE scores::jsonb
      END;
    `);

    await queryInterface.changeColumn('ratings', 'comments', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE ratings
      ALTER COLUMN rated_by_user_id TYPE INTEGER
      USING CASE
        WHEN rated_by_user_id IS NULL OR trim(rated_by_user_id) = '' THEN NULL
        ELSE rated_by_user_id::integer
      END;
    `);

    await queryInterface.addConstraint('ratings', {
      fields: ['rated_by_user_id'],
      type: 'foreign key',
      name: 'fk_ratings_rated_by_user_id',
      references: {
        table: '_user',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('ratings', 'rated_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addConstraint('ratings', {
      fields: ['rated_user_id'],
      type: 'foreign key',
      name: 'fk_ratings_rated_user_id',
      references: {
        table: '_user',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('ratings', 'status', {
      type: Sequelize.ENUM('active', 'flagged', 'removed'),
      allowNull: false,
      defaultValue: 'active'
    });

    await queryInterface.addColumn('ratings', 'moderation_reason', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn('ratings', 'moderated_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addConstraint('ratings', {
      fields: ['moderated_by'],
      type: 'foreign key',
      name: 'fk_ratings_moderated_by',
      references: {
        table: '_user',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('ratings', 'moderated_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('ratings', 'created_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()')
    });

    await queryInterface.addColumn('ratings', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()')
    });

    await queryInterface.addIndex('ratings', ['project_id', 'rated_by_user_id'], {
      name: 'idx_ratings_project_reviewer_unique',
      unique: true,
      where: {
        rated_by_user_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });

    await queryInterface.addIndex('ratings', ['rated_user_id'], {
      name: 'idx_ratings_rated_user_id'
    });

    await queryInterface.addIndex('ratings', ['status'], {
      name: 'idx_ratings_status'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('ratings', 'idx_ratings_status');
    await queryInterface.removeIndex('ratings', 'idx_ratings_rated_user_id');
    await queryInterface.removeIndex('ratings', 'idx_ratings_project_reviewer_unique');

    await queryInterface.removeConstraint('ratings', 'fk_ratings_moderated_by');
    await queryInterface.removeConstraint('ratings', 'fk_ratings_rated_user_id');
    await queryInterface.removeConstraint('ratings', 'fk_ratings_rated_by_user_id');

    await queryInterface.removeColumn('ratings', 'updated_at');
    await queryInterface.removeColumn('ratings', 'created_at');
    await queryInterface.removeColumn('ratings', 'moderated_at');
    await queryInterface.removeColumn('ratings', 'moderated_by');
    await queryInterface.removeColumn('ratings', 'moderation_reason');
    await queryInterface.removeColumn('ratings', 'status');
    await queryInterface.removeColumn('ratings', 'rated_user_id');

    await queryInterface.sequelize.query(`
      ALTER TABLE ratings
      ALTER COLUMN rated_by_user_id TYPE VARCHAR(255)
      USING CASE
        WHEN rated_by_user_id IS NULL THEN NULL
        ELSE rated_by_user_id::varchar(255)
      END;
    `);

    await queryInterface.changeColumn('ratings', 'comments', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE ratings
      ALTER COLUMN scores TYPE VARCHAR(255)
      USING CASE
        WHEN scores IS NULL THEN NULL
        ELSE left(scores::text, 255)
      END;
    `);

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ratings_status";');
  }
};