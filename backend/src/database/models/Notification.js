const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Notification extends Model {
  /**
   * Convert notification to safe object (no sensitive data to hide)
   */
  toSafeObject() {
    return this.toJSON();
  }

  /**
   * Check if notification is unread
   */
  isUnread() {
    return !this.is_read;
  }

  /**
   * Mark notification as read
   */
  async markAsRead() {
    this.is_read = true;
    await this.save();
    return this;
  }

  /**
   * Mark notification as unread
   */
  async markAsUnread() {
    this.is_read = false;
    await this.save();
    return this;
  }
}

Notification.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
        isIn: [[
          // Project events
          'project_created',
          'project_updated',
          'project_deleted',
          'project_status_changed',
          'project_submitted_for_review',
          'project_approved',
          'project_rejected',
          // Milestone events
          'milestone_created',
          'milestone_updated',
          'milestone_completed',
          'milestone_deadline_approaching',
          'milestone_overdue',
          // Message events
          'message_received',
          // Admin events
          'account_status_changed',
          'admin_message',
          // Future: Collaboration events
          'application_received',
          'application_accepted',
          'application_rejected',
          // Future: Matching events
          'new_match_available',
          // Future: Rating events
          'rating_received',
          // System events
          'system_announcement',
          'account_verified'
        ]]
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    link: {
      type: DataTypes.STRING(500),
      allowNull: true,
      validate: {
        len: [0, 500]
      }
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'archived'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_notifications_user_id',
        fields: ['user_id']
      },
      {
        name: 'idx_notifications_user_read',
        fields: ['user_id', 'is_read']
      },
      {
        name: 'idx_notifications_user_archived',
        fields: ['user_id', 'archived']
      },
      {
        name: 'idx_notifications_created',
        fields: [{ name: 'created_at', order: 'DESC' }]
      },
      {
        name: 'idx_notifications_archived_created',
        fields: ['archived', 'created_at']
      },
      {
        name: 'idx_notifications_type',
        fields: ['type']
      }
    ]
  }
);

module.exports = Notification;
