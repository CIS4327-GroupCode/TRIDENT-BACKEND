'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('upload_security_incidents', 'status', {
      type: Sequelize.ENUM('open', 'resolved'),
      allowNull: false,
      defaultValue: 'open'
    });

    await queryInterface.addColumn('upload_security_incidents', 'reviewed_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: '_user',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('upload_security_incidents', 'reviewed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('upload_security_incidents', 'resolution_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('upload_security_incidents', 'resolution_notes');
    await queryInterface.removeColumn('upload_security_incidents', 'reviewed_at');
    await queryInterface.removeColumn('upload_security_incidents', 'reviewed_by');
    await queryInterface.removeColumn('upload_security_incidents', 'status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_upload_security_incidents_status";');
  }
};