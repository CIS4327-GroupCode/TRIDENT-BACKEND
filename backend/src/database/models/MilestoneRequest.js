const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class MilestoneRequest extends Model {
  toSafeObject() {
    return this.toJSON();
  }
}

MilestoneRequest.init(
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
    requested_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      onDelete: 'CASCADE',
      field: 'requested_by'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'due_date'
    },
    justification: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'approved', 'rejected']]
      }
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onDelete: 'SET NULL',
      field: 'reviewed_by'
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_milestone_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'milestones',
        key: 'id'
      },
      onDelete: 'SET NULL',
      field: 'created_milestone_id'
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
    modelName: 'MilestoneRequest',
    tableName: 'milestone_requests',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = MilestoneRequest;