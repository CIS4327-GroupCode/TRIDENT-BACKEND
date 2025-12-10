const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Project extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeProject } = this.toJSON();
    return safeProject;
  }

  // Check if project is open for applications
  isOpen() {
    return this.status === 'open';
  }
}

Project.init(
  {
    project_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'project_id'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    problem: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    outcomes: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    methods_required: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'methods_required'
    },
    timeline: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    budget_min: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'budget_min'
    },
    data_sensitivity: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'data_sensitivity'
    },
    status: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: 'draft',
      validate: {
        isIn: {
          args: [['draft', 'pending_review', 'approved', 'rejected', 'needs_revision', 'open', 'in_progress', 'completed', 'cancelled']],
          msg: 'Invalid status value'
        }
      }
    },
    org_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      },
      field: 'org_id'
    }
  },
  {
    sequelize,
    modelName: 'Project',
    tableName: 'project_ideas',
    timestamps: false,
    underscored: true
  }
);

module.exports = Project;
