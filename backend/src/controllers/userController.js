const { User, UserPreferences, Organization, ResearcherProfile } = require('../database/models');
const bcrypt = require('bcrypt');

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
          attributes: ['id', 'name', 'mission', 'focus_tags', 'EIN', 'contacts']
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
    const { name, email } = req.body;

    // Validate input
    if (!name && !email) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;

    await user.save();

    // Return updated user
    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'role', 'created_at', 'updated_at']
    });

    return res.status(200).json({ 
      message: 'Profile updated successfully',
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
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: 'Password changed successfully' });
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

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getPreferences,
  updatePreferences,
  deleteAccount,
  hardDeleteUser,
  restoreUser
};
