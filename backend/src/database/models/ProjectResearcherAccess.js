const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class ProjectResearcherAccess extends Model {
  toSafeObject() {
    return this.toJSON();
  }
}

ProjectResearcherAccess.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'project_ideas',
        key: 'project_id'
      },
      onDelete: 'CASCADE',
      field: 'project_id'
    },
    researcher_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      onDelete: 'CASCADE',
      field: 'researcher_id'
    },
    assigned_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onDelete: 'SET NULL',
      field: 'assigned_by'
    },
    whole_project: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'whole_project'
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
    modelName: 'ProjectResearcherAccess',
    tableName: 'project_researcher_access',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = ProjectResearcherAccess;