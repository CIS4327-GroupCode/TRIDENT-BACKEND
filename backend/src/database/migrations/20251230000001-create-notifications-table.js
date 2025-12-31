"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notifications", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "_user",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      link: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Add indexes for performance
    await queryInterface.addIndex("notifications", ["user_id"], {
      name: "idx_notifications_user_id",
    });

    await queryInterface.addIndex("notifications", ["user_id", "is_read"], {
      name: "idx_notifications_user_read",
    });

    await queryInterface.addIndex(
      "notifications",
      [{ name: "created_at", order: "DESC" }],
      {
        name: "idx_notifications_created",
      }
    );

    await queryInterface.addIndex("notifications", ["type"], {
      name: "idx_notifications_type",
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex(
      "notifications",
      "idx_notifications_user_id"
    );
    await queryInterface.removeIndex(
      "notifications",
      "idx_notifications_user_read"
    );
    await queryInterface.removeIndex(
      "notifications",
      "idx_notifications_created"
    );
    await queryInterface.removeIndex("notifications", "idx_notifications_type");

    // Drop table
    await queryInterface.dropTable("notifications");
  },
};
