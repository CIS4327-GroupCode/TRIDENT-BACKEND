const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class MessageAttachment extends Model {}

MessageAttachment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    message_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'messages',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    file_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    file_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'MessageAttachment',
    tableName: 'message_attachments',
    timestamps: false,
    underscored: true,
  }
);

module.exports = MessageAttachment;