const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class PasswordReset extends Model {
  /**
   * Check if token is expired
   * @returns {boolean}
   */
  isExpired() {
    return new Date() > this.token_expires_at;
  }

  /**
   * Get time remaining until expiry
   * @returns {number} milliseconds until expiry (negative if expired)
   */
  getTimeRemaining() {
    return this.token_expires_at - new Date();
  }

  /**
   * Find reset by token
   * @param {string} token
   * @returns {Promise<PasswordReset|null>}
   */
  static async findByToken(token) {
    return await this.findOne({ where: { token } });
  }

  /**
   * Find reset by user ID
   * @param {number} userId
   * @returns {Promise<PasswordReset|null>}
   */
  static async findByUserId(userId) {
    return await this.findOne({ where: { user_id: userId } });
  }

  /**
   * Create or update reset for user
   * @param {number} userId
   * @param {string} token
   * @param {Date} expiresAt
   * @returns {Promise<PasswordReset>}
   */
  static async upsertForUser(userId, token, expiresAt) {
    const [reset, created] = await this.findOrCreate({
      where: { user_id: userId },
      defaults: {
        user_id: userId,
        token: token,
        token_expires_at: expiresAt
      }
    });

    if (!created) {
      reset.token = token;
      reset.token_expires_at = expiresAt;
      await reset.save();
    }

    return reset;
  }

  /**
   * Clean up expired resets (for maintenance cron job)
   * @returns {Promise<number>} Number of records deleted
   */
  static async cleanupExpired() {
    const result = await this.destroy({
      where: {
        token_expires_at: {
          [sequelize.Sequelize.Op.lt]: new Date()
        }
      }
    });
    return result;
  }
}

PasswordReset.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: '_user',
        key: 'id'
      }
    },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    token_expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isDate: true,
        isFuture(value) {
          if (new Date(value) <= new Date()) {
            throw new Error('Token expiry must be in the future');
          }
        }
      }
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
    }
  },
  {
    sequelize,
    modelName: 'PasswordReset',
    tableName: 'password_resets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  }
);

module.exports = PasswordReset;
