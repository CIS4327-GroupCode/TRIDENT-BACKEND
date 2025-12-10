const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class ProjectReview extends Model {
  toSafeObject() {
    const { ...safeReview } = this.toJSON();
    return safeReview;
  }
}

ProjectReview.init(
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
      }
    },
    reviewer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['approved', 'rejected', 'needs_revision', 'submitted']]
      }
    },
    previous_status: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    new_status: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    changes_requested: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'ProjectReview',
    tableName: 'project_reviews',
    timestamps: false,
    underscored: true
  }
);

module.exports = ProjectReview;
