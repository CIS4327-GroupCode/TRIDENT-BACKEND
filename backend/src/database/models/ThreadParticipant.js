const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class ThreadParticipant extends Model {}

ThreadParticipant.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    thread_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'threads',
        key: 'id',
      },
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    unread_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_read_message_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'ThreadParticipant',
    tableName: 'thread_participants',
    timestamps: false,
    underscored: true,
  }
);

module.exports = ThreadParticipant;