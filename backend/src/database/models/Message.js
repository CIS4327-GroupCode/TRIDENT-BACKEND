const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Message extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeMessage } = this.toJSON();
    return safeMessage;
  }
}

Message.init(
  {
    thread_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'thread_id'
    },
    sender_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'sender_id'
    },
    recipient_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'recipient_id'
    },
    body: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    attachments: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    timestamps: false,
    underscored: true
  }
);

module.exports = Message;
