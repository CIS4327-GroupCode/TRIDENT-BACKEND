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
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Match score from 0.00 to 100.00'
    },
    score_breakdown: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Detailed scoring by factor (expertise, methods, budget, etc.)'
    },
    reason_codes: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reason_codes'
    },
    dismissed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'User dismissed this match'
    },
    calculated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      comment: 'When score was calculated'
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
