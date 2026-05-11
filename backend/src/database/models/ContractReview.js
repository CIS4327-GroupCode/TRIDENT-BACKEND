const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class ContractReview extends Model {
  toSafeObject() {
    const { ...safeReview } = this.toJSON();
    return safeReview;
  }
}

ContractReview.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    contract_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'contracts',
        key: 'id'
      },
      field: 'contract_id'
    },
    reviewer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'reviewer_id'
    },
    review_stage: {
      type: DataTypes.ENUM('submission', 'internal_review', 'counterparty_review', 'post_execution'),
      allowNull: false,
      field: 'review_stage'
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [[
          'submitted',
          'approved',
          'changes_requested',
          'counterparty_approved',
          'counterparty_changes_requested',
          'effective',
          'activated',
          'completed',
          'archived',
          'removal_requested',
          'removal_approved',
          'removal_rejected'
        ]]
      }
    },
    previous_status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'previous_status'
    },
    new_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'new_status'
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    changes_requested: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'changes_requested'
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'reviewed_at'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    sequelize,
    modelName: 'ContractReview',
    tableName: 'contract_reviews',
    timestamps: false,
    underscored: true
  }
);

module.exports = ContractReview;