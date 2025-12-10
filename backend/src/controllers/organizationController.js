const { Organization, User } = require('../database/models');

/**
 * Get current user's organization
 * GET /organizations/me
 */
const getOrganization = async (req, res) => {
  try {
    const org = await Organization.findOne({
      where: { user_id: req.user.id },
    });

    // If no organization exists yet, return empty object
    if (!org) {
      return res.json({});
    }

    return res.json(org);
  } catch (err) {
    console.error('Get organization error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Create or update current user's organization
 * PUT /organizations/me
 */
const updateOrganization = async (req, res) => {
  try {
    const userId = req.user.id;

    // Only nonprofits should have org profiles
    if (req.user.role !== 'nonprofit') {
      return res
        .status(403)
        .json({ error: 'Only nonprofit users can update organization settings' });
    }

    const allowedFields = [
      'name',
      'EIN',
      'mission',
      'focus_tags',
      'compliance_flags',
      'contacts',
    ];

    // Keep only allowed fields from body
    const updates = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key) && req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    // Try to find existing org for this user
    let organization = await Organization.findOne({ where: { user_id: userId } });

    if (!organization) {
      // No org yet → create one
      organization = await Organization.create({
        ...updates,
        user_id: userId,
      });

      // Link user to this org
      await User.update(
        { org_id: organization.id },
        { where: { id: userId } }
      );
    } else {
      // Org exists → just update
      await organization.update(updates);
    }

    return res.status(200).json({
      message: 'Organization saved successfully',
      organization,
    });
  } catch (error) {
    console.error('Update organization error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getOrganization,
  updateOrganization,
};