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
    }
  },
  {
    sequelize,
    modelName: 'Application',
    tableName: 'agreements',
    timestamps: false,
    underscored: true
  }
);

module.exports = Application;
