const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Contract extends Model {
  toSafeObject() {
    const { ...safeContract } = this.toJSON();
    return safeContract;
  }

  isSignedByUser(userId) {
    if (!userId) return false;
    const isNonprofitSigner = this.nonprofit_user_id === userId && Boolean(this.nonprofit_signed_at);
    const isResearcherSigner = this.researcher_user_id === userId && Boolean(this.researcher_signed_at);
    return isNonprofitSigner || isResearcherSigner;
  }
}

Contract.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    application_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'agreements',
        key: 'id'
      },
      field: 'application_id'
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'project_ideas',
        key: 'project_id'
      },
      field: 'project_id'
    },
    nonprofit_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'nonprofit_user_id'
    },
    researcher_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'researcher_user_id'
    },
    template_type: {
      type: DataTypes.ENUM('NDA', 'DUA', 'SOW'),
      allowNull: false,
      validate: {
        isIn: [['NDA', 'DUA', 'SOW']]
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending_signature', 'signed', 'active', 'terminated', 'expired'),
      allowNull: false,
      defaultValue: 'draft',
      validate: {
        isIn: [['draft', 'pending_signature', 'signed', 'active', 'terminated', 'expired']]
      }
    },
    variables: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    rendered_content: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'rendered_content'
    },
    storage_key: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'storage_key'
    },
    checksum: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    nonprofit_signed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'nonprofit_signed_at'
    },
    nonprofit_sign_ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'nonprofit_sign_ip'
    },
    researcher_signed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'researcher_signed_at'
    },
    researcher_sign_ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'researcher_sign_ip'
    },
    terminated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'terminated_at'
    },
    terminated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      field: 'terminated_by'
    },
    termination_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'termination_reason'
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
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
    modelName: 'Contract',
    tableName: 'contracts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Contract;
