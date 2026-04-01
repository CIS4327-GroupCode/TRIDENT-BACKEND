const { Organization, User } = require('../database/models');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLogger');

function trimStringFields(input = {}) {
  const output = {};
  Object.keys(input).forEach((key) => {
    const value = input[key];
    output[key] = typeof value === 'string' ? value.trim() : value;
  });
  return output;
}

function isValidWebsite(urlValue) {
  try {
    const url = new URL(urlValue);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/**
 * Get current user's organization
 * GET /organizations/me
 */
const getOrganization = async (req, res) => {
  try {
    // Try user_id first (owner link), then fall back to org_id on user
    let org = await Organization.findOne({
      where: { user_id: req.user.id },
    });

    if (!org) {
      const user = await User.findByPk(req.user.id, { attributes: ['org_id'] });
      if (user?.org_id) {
        org = await Organization.findByPk(user.org_id);
      }
    }

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
      'type',
      'location',
      'website',
      'focus_areas',
      'budget_range',
      'team_size',
      'established_year',
    ];

    // Keep only allowed fields from body
    const updates = {};
    const sanitizedBody = trimStringFields(req.body || {});
    Object.keys(sanitizedBody).forEach((key) => {
      if (allowedFields.includes(key) && sanitizedBody[key] !== undefined) {
        updates[key] = sanitizedBody[key];
      }
    });

    if (updates.website && !isValidWebsite(updates.website)) {
      return res.status(400).json({ error: 'Website must be a valid http(s) URL' });
    }

    if (updates.team_size !== undefined) {
      const parsedTeamSize = Number(updates.team_size);
      if (!Number.isInteger(parsedTeamSize) || parsedTeamSize <= 0) {
        return res.status(400).json({ error: 'team_size must be a positive integer' });
      }
      updates.team_size = parsedTeamSize;
    }

    if (updates.established_year !== undefined) {
      const parsedYear = Number(updates.established_year);
      const currentYear = new Date().getFullYear() + 1;
      if (!Number.isInteger(parsedYear) || parsedYear < 1800 || parsedYear > currentYear) {
        return res.status(400).json({ error: 'established_year must be a valid year' });
      }
      updates.established_year = parsedYear;
    }

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

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.ORGANIZATION_UPDATE,
      entityType: 'ORGANIZATION',
      entityId: organization.id,
      metadata: { updatedFields: Object.keys(updates) },
    });

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