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
      type: DataTypes.STRING(255),
      allowNull: true
    },
    comments: {
      type: DataTypes.STRING(255),
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
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'rated_by_user_id'
    }
  },
  {
    sequelize,
    modelName: 'Rating',
    tableName: 'ratings',
    timestamps: false,
    underscored: true
  }
);

module.exports = Rating;
