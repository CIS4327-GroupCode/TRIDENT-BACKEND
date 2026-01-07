const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Application extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeApplication } = this.toJSON();
    return safeApplication;
  }

  // Check if application is pending
  isPending() {
    return this.status === 'pending';
  }

  // Check if application is accepted
  isAccepted() {
    return this.status === 'accepted';
  }
}

Application.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'accepted', 'rejected']]
      }
    },
    type: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    value: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    budget_info: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'budget_info'
    },
    audit_trail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'audit_trail'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    org_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      },
      field: 'org_id'
    },
    researcher_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'researcher_profiles',
        key: 'user_id'
      },
      field: 'researcher_id'
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
    modelName: 'Application',
    tableName: 'agreements',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Application;
