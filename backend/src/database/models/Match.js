const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Match extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeMatch } = this.toJSON();
    return safeMatch;
  }
}

Match.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    score: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reason_codes: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reason_codes'
    },
    brief_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_ideas',
        key: 'project_id'
      },
      field: 'brief_id'
    },
    researcher_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'researcher_profiles',
        key: 'user_id'
      },
      field: 'researcher_id'
    }
  },
  {
    sequelize,
    modelName: 'Match',
    tableName: 'matches',
    timestamps: false,
    underscored: true
  }
);

module.exports = Match;
