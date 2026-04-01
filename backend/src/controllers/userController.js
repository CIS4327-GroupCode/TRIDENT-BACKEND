const { User, UserPreferences, Organization, ResearcherProfile } = require('../database/models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { EmailVerification } = require('../database/models');
const emailService = require('../services/emailService');
const { PASSWORD_POLICY_MESSAGE, isStrongPassword } = require('../utils/passwordPolicy');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLogger');

function trimStringFields(input = {}) {
  const output = {};
  Object.keys(input).forEach((key) => {
    const value = input[key];
    output[key] = typeof value === 'string' ? value.trim() : value;
  });
  return output;
}

/**
 * Get current user profile
 * GET /users/me
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From JWT middleware

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'role', 'created_at', 'updated_at'],
      include: [
        {
          model: UserPreferences,
          as: 'preferences',
          attributes: { exclude: ['id', 'user_id'] }
        },
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'mission', 'focus_tags', 'EIN', 'contacts', 'type', 'location', 'website', 'focus_areas', 'budget_range', 'team_size', 'established_year']
        },
        {
          model: ResearcherProfile,
          as: 'researcherProfile',
          attributes: ['id', 'title', 'institution', 'expertise', 'research_interests', 'projects_completed', 'hourly_rate_min', 'hourly_rate_max']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update current user profile
 * PUT /users/me
 * Allows updating: name, email
 */
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = trimStringFields(req.body || {});

    // Validate input
    if ((name === undefined || name === '') && (email === undefined || email === '')) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already taken by another user
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase() : email;
    const emailChanged = normalizedEmail && normalizedEmail !== user.email;

    if (emailChanged) {
      const existingUser = await User.findOne({ where: { email: normalizedEmail } });
      if (existingUser) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    // Update fields
    if (name) user.name = name;
    if (emailChanged) {
      user.account_status = 'pending';
    }

    await user.save();

    if (emailChanged) {
      const verificationToken = jwt.sign(
        { userId: user.id, email: normalizedEmail, purpose: 'email-change-verification' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await EmailVerification.upsertForUser(user.id, verificationToken, expiresAt);

      try {
        await emailService.sendVerificationEmail(normalizedEmail, user.name, verificationToken);
      } catch (emailError) {
        console.error('Failed to send email-change verification email:', emailError);
      }
    }

    void logAudit({
      actorId: userId,
      action: emailChanged ? AUDIT_ACTIONS.EMAIL_CHANGE : AUDIT_ACTIONS.PROFILE_UPDATE,
      entityType: 'USER',
      entityId: userId,
      metadata: {
        updatedFields: Object.keys(trimStringFields(req.body || {})),
        emailChanged,
      },
    });

    // Return updated user
    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'role', 'created_at', 'updated_at']
    });

    return res.status(200).json({
      message: emailChanged
        ? 'Profile updated. Verification email sent to your new address.'
        : 'Profile updated successfully',
      emailVerificationSent: !!emailChanged,
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Change user password
 * PUT /users/me/password
 */
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Password strength validation
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password_hash = hashedPassword;
    await user.save();

    try {
      await emailService.sendNotificationEmail(user.email, user.name, {
        type: 'security',
        title: 'Password Changed Successfully',
        message: 'Your account password was changed. If this was not you, reset your password immediately.',
        link: '/settings',
      });
    } catch (emailError) {
      console.error('Failed to send password change notification email:', emailError);
    }

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE,
      entityType: 'USER',
      entityId: userId,
      metadata: { requireReLogin: true },
    });

    return res.status(200).json({
      message: 'Password changed successfully',
      requireReLogin: true,
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get user notification preferences
 * GET /users/me/preferences
 */
const getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;

    let preferences = await UserPreferences.findOne({ where: { user_id: userId } });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await UserPreferences.create({ user_id: userId });
    }

    return res.status(200).json({ preferences });
  } catch (error) {
    console.error('Get preferences error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update user notification preferences
 * PUT /users/me/preferences
 */
const updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const allowedFields = [
      'email_notifications',
      'email_messages',
      'email_matches',
      'email_milestones',
      'email_project_updates',
      'inapp_notifications',
      'inapp_messages',
      'inapp_matches',
      'weekly_digest',
      'monthly_report',
      'marketing_emails'
    ];

    // Filter only allowed fields from request body
    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key) && typeof req.body[key] === 'boolean') {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid preference fields provided' });
    }

    let preferences = await UserPreferences.findOne({ where: { user_id: userId } });

    // Create preferences if they don't exist
    if (!preferences) {
      preferences = await UserPreferences.create({ 
        user_id: userId,
        ...updates
      });
    } else {
      // Update existing preferences
      await preferences.update(updates);
    }

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.PREFERENCES_UPDATE,
      entityType: 'USER_PREFERENCES',
      entityId: userId,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({ 
      message: 'Preferences updated successfully',
      preferences 
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Soft delete user account (self-deletion)
 * DELETE /users/me
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Sequelize paranoid mode handles soft delete automatically
    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.ACCOUNT_DELETE,
      entityType: 'USER',
      entityId: userId,
      metadata: { mode: 'soft' },
    });

    await user.destroy();

    return res.status(200).json({ 
      message: 'Account deleted successfully. You can contact support to restore it within 30 days.' 
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Hard delete user account (admin only)
 * DELETE /admin/users/:id
 */
const hardDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmation } = req.body;

    // Require explicit confirmation
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { "confirmation": "DELETE" } to proceed.' 
      });
    }

    // Use force: true to bypass paranoid mode and permanently delete
    const user = await User.findByPk(id, { paranoid: false });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Permanent deletion
    await user.destroy({ force: true });

    return res.status(200).json({ 
      message: `User ${id} permanently deleted. This action cannot be undone.` 
    });
  } catch (error) {
    console.error('Hard delete user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Restore soft-deleted user account (admin only)
 * POST /admin/users/:id/restore
 */
const restoreUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Find deleted user
    const user = await User.findByPk(id, { paranoid: false });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.deleted_at) {
      return res.status(400).json({ error: 'User is not deleted' });
    }

    // Restore user
    await user.restore();

    return res.status(200).json({ 
      message: 'User account restored successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Restore user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Browse and search researchers (public endpoint for nonprofits)
 * GET /users/browse/researchers
 * Query params: 
 *   - expertise: filter by expertise keywords
 *   - methods: filter by research methods
 *   - domains: filter by domains
 *   - minRate, maxRate: filter by hourly rate range
 *   - search: general search across multiple fields
 */
const browseResearchers = async (req, res) => {
  try {
    const { expertise, methods, domains, minRate, maxRate, search, limit = 20, offset = 0 } = req.query;

    // Build where clause for filtering
    const where = {
      role: 'researcher',
      account_status: 'active'
    };

    // Build include for researcher profile with filters
    const profileWhere = {};
    
    if (expertise) {
      profileWhere.expertise = { [require('sequelize').Op.iLike]: `%${expertise}%` };
    }
    
    if (methods) {
      profileWhere.methods = { [require('sequelize').Op.iLike]: `%${methods}%` };
    }
    
    if (domains) {
      profileWhere.domains = { [require('sequelize').Op.iLike]: `%${domains}%` };
    }
    
    if (minRate) {
      profileWhere.rate_min = { [require('sequelize').Op.gte]: parseFloat(minRate) };
    }
    
    if (maxRate) {
      profileWhere.rate_max = { [require('sequelize').Op.lte]: parseFloat(maxRate) };
    }

    // General search across multiple fields
    if (search) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
      
      // Also search in profile fields
      profileWhere[Op.or] = [
        { expertise: { [Op.iLike]: `%${search}%` } },
        { methods: { [Op.iLike]: `%${search}%` } },
        { domains: { [Op.iLike]: `%${search}%` } },
        { affiliation: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const researchers = await User.findAndCountAll({
      where,
      attributes: ['id', 'name', 'email', 'created_at'],
      include: [
        {
          model: ResearcherProfile,
          as: 'researcherProfile',
          where: Object.keys(profileWhere).length > 0 ? profileWhere : undefined,
          required: true, // Only include users who have researcher profiles
          attributes: [
            'affiliation',
            'domains',
            'methods',
            'tools',
            'rate_min',
            'rate_max',
            'availability',
            'expertise',
            'compliance_certifications'
          ]
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true // For accurate count with includes
    });

    return res.status(200).json({
      researchers: researchers.rows,
      total: researchers.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Browse researchers error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message});
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getPreferences,
  updatePreferences,
  deleteAccount,
  hardDeleteUser,
  restoreUser,
  browseResearchers
};
