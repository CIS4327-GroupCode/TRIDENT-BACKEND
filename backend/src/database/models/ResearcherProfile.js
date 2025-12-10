const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class ResearcherProfile extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeProfile } = this.toJSON();
    return safeProfile;
  }
}

ResearcherProfile.init(
  {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'user_id'
    },
    affiliation: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    domains: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    methods: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    tools: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    rate_min: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'rate_min'
    },
    rate_max: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'rate_max'
    },
    availability: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'ResearcherProfile',
    tableName: 'researcher_profiles',
    timestamps: false,
    underscored: true
  }
);

module.exports = ResearcherProfile;
