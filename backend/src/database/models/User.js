const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class User extends Model {
  // Instance methods
  toSafeObject() {
    const { password_hash, ...safeUser } = this.toJSON();
    return safeUser;
  }

  // Class methods can go here
  static async findByEmail(email) {
    return await this.findOne({ where: { email } });
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
        notEmpty: true
      },
      set(value) {
        // Auto-normalize email
        this.setDataValue('email', value.trim().toLowerCase());
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    role: {
      type: DataTypes.ENUM('researcher', 'nonprofit', 'admin'),
      allowNull: false,
      defaultValue: 'researcher'
    },
    account_status: {
      type: DataTypes.ENUM('active', 'pending', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    },
    mfa_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    org_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    }
  },
  {
    sequelize,
    modelName: 'User',
    tableName: '_user',  // Match existing table name
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  }
);

module.exports = User;