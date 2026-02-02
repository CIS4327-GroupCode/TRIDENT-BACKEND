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
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Academic/professional title (e.g., "PhD Candidate", "Professor")'
    },
    institution: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Primary affiliated institution'
    },
    domains: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Research domains/fields (comma-separated)'
    },
    methods: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Research methods (comma-separated)'
    },
    tools: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Tools and technologies (comma-separated)'
    },
    expertise: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Expertise areas (comma-separated) - CRITICAL for matching algorithm'
    },
    research_interests: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Detailed description of research interests'
    },
    compliance_certifications: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'IRB, ethics training, certifications'
    },
    projects_completed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of completed projects (for experience scoring)'
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
    hourly_rate_min: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'hourly_rate_min',
      comment: 'Minimum hourly rate (clearer alias for rate_min)'
    },
    hourly_rate_max: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'hourly_rate_max',
      comment: 'Maximum hourly rate (clearer alias for rate_max)'
    },
    availability: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Hours per week or availability schedule'
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
