const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class MilestoneResearcher extends Model {
  toSafeObject() {
    const safeObject = this.toJSON();
    return safeObject;
  }
}

MilestoneResearcher.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    milestone_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'milestones',
        key: 'id'
      },
      onDelete: 'CASCADE',
      field: 'milestone_id'
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
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      onDelete: 'RESTRICT',
      field: 'assigned_by'
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
    modelName: 'MilestoneResearcher',
    tableName: 'milestone_researchers',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = MilestoneResearcher;