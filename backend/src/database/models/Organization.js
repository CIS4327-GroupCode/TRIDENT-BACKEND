const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Organization extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeOrg } = this.toJSON();
    return safeOrg;
  }
}

Organization.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    EIN: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "EIN",
    },

    mission: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    // NEW FIELDS TO MATCH YOUR FORM + DB

    type: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    focus_areas: {
      // stored as text[] in Postgres from the migration
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },

    budget_range: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    team_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    established_year: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // LEGACY FIELDS STILL IN YOUR TABLE

    focus_tags: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "focus_tags",
    },

    compliance_flags: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "compliance_flags",
    },

    contacts: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    // user_id used in WHERE clauses
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Organization",
    tableName: "organizations",
    timestamps: false,
    underscored: true,
  }
);

module.exports = Organization;