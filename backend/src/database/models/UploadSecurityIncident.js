const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class UploadSecurityIncident extends Model {
  toSafeObject() {
    return { ...this.toJSON() };
  }
}

UploadSecurityIncident.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'user_id'
    },
    surface: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    route: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    content_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'content_hash'
    },
    scan_status: {
      type: DataTypes.ENUM('infected', 'error'),
      allowNull: false,
      field: 'scan_status'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    action_taken: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'action_taken'
    },
    auto_suspension_state: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'not_attempted',
      field: 'auto_suspension_state'
    },
    status: {
      type: DataTypes.ENUM('open', 'resolved'),
      allowNull: false,
      defaultValue: 'open'
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'reviewed_by'
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'resolution_notes'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
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
    modelName: 'UploadSecurityIncident',
    tableName: 'upload_security_incidents',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = UploadSecurityIncident;