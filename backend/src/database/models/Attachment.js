const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Attachment extends Model {
  toSafeObject() {
    const { ...safeAttachment } = this.toJSON();
    return safeAttachment;
  }
}

Attachment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    mimetype: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    storage_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
      field: 'storage_key',
      validate: {
        notEmpty: true
      }
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'project_ideas',
        key: 'project_id'
      },
      field: 'project_id'
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
    status: {
      type: DataTypes.ENUM('active', 'deleted', 'failed', 'quarantined'),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'deleted', 'failed', 'quarantined']]
      }
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    is_latest: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_latest'
    },
    scan_status: {
      type: DataTypes.ENUM('pending', 'clean', 'infected', 'error'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'scan_status',
      validate: {
        isIn: [['pending', 'clean', 'infected', 'error']]
      }
    },
    scanned_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scanned_at'
    },
    quarantine_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'quarantine_reason'
    },
    retention_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'retention_expires_at'
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
    modelName: 'Attachment',
    tableName: 'project_attachments',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Attachment;