const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class AuditLog extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeLog } = this.toJSON();
    return safeLog;
  }
}

AuditLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    actor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'actor_id'
    },
    action: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    entity_type: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'entity_type'
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entity_id'
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs',
    timestamps: false,
    underscored: true
  }
);

module.exports = AuditLog;
