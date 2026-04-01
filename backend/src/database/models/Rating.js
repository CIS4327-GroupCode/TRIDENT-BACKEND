const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Rating extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeRating } = this.toJSON();
    return safeRating;
  }
}

Rating.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    from_party: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'from_party'
    },
    scores: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_ideas',
        key: 'project_id'
      },
      field: 'project_id'
    },
    rated_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      field: 'rated_by_user_id'
    },
    rated_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      field: 'rated_user_id'
    },
    status: {
      type: DataTypes.ENUM('active', 'flagged', 'removed'),
      allowNull: false,
      defaultValue: 'active'
    },
    moderation_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'moderation_reason'
    },
    moderated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      field: 'moderated_by'
    },
    moderated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'moderated_at'
    }
  },
  {
    sequelize,
    modelName: 'Rating',
    tableName: 'ratings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  }
);

module.exports = Rating;
