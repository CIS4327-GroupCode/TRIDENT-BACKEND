const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Thread extends Model {}

Thread.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    thread_type: {
      type: DataTypes.ENUM('direct', 'group'),
      allowNull: false,
    },
    direct_key: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nonprofit_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_sensitive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Thread',
    tableName: 'threads',
    timestamps: false,
    underscored: true,
  }
);

module.exports = Thread;