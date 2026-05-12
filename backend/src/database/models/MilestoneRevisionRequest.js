const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class MilestoneRevisionRequest extends Model {
  toSafeObject() {
    return this.toJSON();
  }
}

MilestoneRevisionRequest.init(
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
    reason: {
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
    modelName: 'MilestoneRevisionRequest',
    tableName: 'milestone_revision_requests',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = MilestoneRevisionRequest;