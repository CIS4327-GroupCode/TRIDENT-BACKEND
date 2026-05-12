const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class MessageUploadAsset extends Model {}

MessageUploadAsset.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'uploaded_by'
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name'
    },
    mimetype: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    storage_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      field: 'storage_key'
    },
    status: {
      type: DataTypes.ENUM('uploaded', 'attached', 'deleted'),
      allowNull: false,
      defaultValue: 'uploaded'
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
    modelName: 'MessageUploadAsset',
    tableName: 'message_upload_assets',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = MessageUploadAsset;