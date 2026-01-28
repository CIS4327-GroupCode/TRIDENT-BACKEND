const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class EmailVerification extends Model {
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
   * Find verification by token
   * @param {string} token
   * @returns {Promise<EmailVerification|null>}
   */
  static async findByToken(token) {
    return await this.findOne({ where: { token } });
  }

  /**
   * Find verification by user ID
   * @param {number} userId
   * @returns {Promise<EmailVerification|null>}
   */
  static async findByUserId(userId) {
    return await this.findOne({ where: { user_id: userId } });
  }

  /**
   * Create or update verification for user
   * @param {number} userId
   * @param {string} token
   * @param {Date} expiresAt
   * @returns {Promise<EmailVerification>}
   */
  static async upsertForUser(userId, token, expiresAt) {
    const [verification, created] = await this.findOrCreate({
      where: { user_id: userId },
      defaults: {
        user_id: userId,
        token: token,
        token_expires_at: expiresAt
      }
    });

    if (!created) {
      // Update existing verification
      verification.token = token;
      verification.token_expires_at = expiresAt;
      await verification.save();
    }

    return verification;
  }

  /**
   * Clean up expired verifications (for maintenance cron job)
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

EmailVerification.init(
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
    modelName: 'EmailVerification',
    tableName: 'email_verifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  }
);

module.exports = EmailVerification;
