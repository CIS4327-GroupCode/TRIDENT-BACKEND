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
    template_version_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'template_version_id'
    },
    source_kind: {
      type: DataTypes.ENUM('template', 'attachment', 'free_text'),
      allowNull: false,
      defaultValue: 'template',
      field: 'source_kind',
      validate: {
        isIn: [['template', 'attachment', 'free_text']]
      }
    },
    uploaded_attachment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_attachments',
        key: 'id'
      },
      field: 'uploaded_attachment_id'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'internal_review',
        'counterparty_review',
        'changes_requested',
        'approved_for_signature',
        'pending_signature',
        'executed',
        'effective',
        'active',
        'completed',
        'terminated',
        'expired',
        'archived'
      ),
      allowNull: false,
      defaultValue: 'draft',
      validate: {
        isIn: [[
          'draft',
          'internal_review',
          'counterparty_review',
          'changes_requested',
          'approved_for_signature',
          'pending_signature',
          'executed',
          'effective',
          'active',
          'completed',
          'terminated',
          'expired',
          'archived'
        ]]
      }
    },
    review_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'review_required'
    },
    contains_sensitive_data: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'contains_sensitive_data'
    },
    data_classification: {
      type: DataTypes.ENUM('public', 'internal', 'confidential', 'restricted'),
      allowNull: false,
      defaultValue: 'internal',
      field: 'data_classification'
    },
    retention_period_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'retention_period_days',
      validate: {
        min: 1
      }
    },
    destruction_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'destruction_required'
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
    content_snapshot: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'content_snapshot'
    },
    storage_key: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'storage_key'
    },
    executed_filename: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'executed_filename'
    },
    executed_mimetype: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'executed_mimetype'
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
    effective_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'effective_at'
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'archived_at'
    },
    parent_contract_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'contracts',
        key: 'id'
      },
      field: 'parent_contract_id'
    },
    root_contract_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'contracts',
        key: 'id'
      },
      field: 'root_contract_id'
    },
    supersedes_contract_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'contracts',
        key: 'id'
      },
      field: 'supersedes_contract_id'
    },
    version_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'version_number',
      validate: {
        min: 1
      }
    },
    is_current_version: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_current_version'
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
