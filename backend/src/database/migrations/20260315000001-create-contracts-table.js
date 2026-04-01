'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contracts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      application_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'agreements',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'project_ideas',
          key: 'project_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      nonprofit_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      researcher_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      template_type: {
        type: Sequelize.ENUM('NDA', 'DUA', 'SOW'),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'pending_signature', 'signed', 'active', 'terminated', 'expired'),
        allowNull: false,
        defaultValue: 'draft'
      },
      variables: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      rendered_content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      storage_key: {
        type: Sequelize.STRING(512),
        allowNull: true
      },
      checksum: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      nonprofit_signed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      nonprofit_sign_ip: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      researcher_signed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      researcher_sign_ip: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      terminated_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      terminated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: '_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      termination_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('contracts', ['application_id']);
    await queryInterface.addIndex('contracts', ['project_id']);
    await queryInterface.addIndex('contracts', ['nonprofit_user_id']);
    await queryInterface.addIndex('contracts', ['researcher_user_id']);
    await queryInterface.addIndex('contracts', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contracts');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contracts_template_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contracts_status";');
  }
};
