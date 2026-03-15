const { ResearcherProfile, AcademicHistory, Certification, Application, Project, Organization, User } = require('../database/models');
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
 * Parse comma-separated string into array
 * @param {string} str - Comma-separated string
 * @returns {string[]} Array of values
 */
function parseCommaSeparated(str) {
  if (!str || typeof str !== 'string') return [];
  return str
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Calculate profile completeness percentage
 * @param {Object} profile - Researcher profile object
 * @returns {number} Completeness percentage (0-100)
 */
function computeProfileCompleteness(profile) {
  const fields = [
    { key: 'affiliation',        check: v => !!v },
    { key: 'title',              check: v => !!v },
    { key: 'expertise',          check: v => parseCommaSeparated(v).length > 0 },
    { key: 'domains',            check: v => parseCommaSeparated(v).length > 0 },
    { key: 'methods',            check: v => parseCommaSeparated(v).length > 0 },
    { key: 'hourly_rate_min',    check: v => !!v && parseFloat(v) > 0 },
    { key: 'research_interests', check: v => v && v.length >= 20 },
    { key: 'availability',       check: v => !!v },
  ];
  const filled = fields.filter(f => f.check(profile[f.key])).length;
  return Math.round((filled / fields.length) * 100);
}

/**
 * Get current user's researcher profile
 * GET /researchers/me
 */
const getResearcherProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is researcher
    if (req.user.role !== 'researcher') {
      return res.status(403).json({ error: 'Only researcher users can access researcher profile settings' });
    }

    const profile = await ResearcherProfile.findOne({ where: { user_id: userId } });

    if (!profile) {
      return res.status(404).json({ error: 'Researcher profile not found' });
    }

    // Calculate and include completeness
    const completeness = computeProfileCompleteness(profile.toJSON());

    return res.status(200).json({ profile, completeness });
  } catch (error) {
    console.error('Get researcher profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update current user's researcher profile
 * PUT /researchers/me
 */
const updateResearcherProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is researcher
    if (req.user.role !== 'researcher') {
      return res.status(403).json({ error: 'Only researcher users can update researcher profile settings' });
    }

    const allowedFields = [
      'title',
      'affiliation',
      'institution',
      'domains',
      'methods',
      'tools',
      'expertise',
      'research_interests',
      'compliance_certifications',
      'hourly_rate_min',
      'hourly_rate_max',
      'availability',
      'max_concurrent_projects',
      'projects_completed'
    ];

    // Filter only allowed fields from request body
    const updates = {};
    const sanitizedBody = trimStringFields(req.body || {});
    Object.keys(sanitizedBody).forEach(key => {
      if (allowedFields.includes(key) && sanitizedBody[key] !== undefined) {
        updates[key] = sanitizedBody[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    // Validate hourly rate range
    if (updates.hourly_rate_min !== undefined && updates.hourly_rate_max !== undefined) {
      if (updates.hourly_rate_min > updates.hourly_rate_max) {
        return res.status(400).json({ error: 'Minimum rate cannot exceed maximum rate' });
      }
    }

    const profile = await ResearcherProfile.findOne({ where: { user_id: userId } });

    if (!profile) {
      return res.status(404).json({ error: 'Researcher profile not found' });
    }

    // Sync rate aliases for backward compatibility
    if (updates.hourly_rate_min !== undefined) updates.rate_min = updates.hourly_rate_min;
    if (updates.hourly_rate_max !== undefined) updates.rate_max = updates.hourly_rate_max;

    // Update profile
    await profile.update(updates);

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.RESEARCHER_PROFILE_UPDATE,
      entityType: 'RESEARCHER_PROFILE',
      entityId: profile.id,
      metadata: { updatedFields: Object.keys(updates) },
    });

    // Calculate and include completeness
    const completeness = computeProfileCompleteness(profile.toJSON());

    return res.status(200).json({ 
      message: 'Researcher profile updated successfully',
      profile,
      completeness
    });
  } catch (error) {
    console.error('Update researcher profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get researcher's academic history
 * GET /researchers/me/academic
 */
const getAcademicHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const academics = await AcademicHistory.findAll({
      where: { user_id: userId },
      order: [['year', 'DESC'], ['created_at', 'DESC']]
    });

    return res.status(200).json({ academics });
  } catch (error) {
    console.error('Get academic history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create academic history entry
 * POST /researchers/me/academic
 */
const createAcademicHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { degree, field, institution, year } = trimStringFields(req.body || {});

    if (!degree || !institution) {
      return res.status(400).json({ error: 'Degree and institution are required' });
    }

    const academic = await AcademicHistory.create({
      user_id: userId,
      degree,
      field,
      institution,
      year
    });

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.ACADEMIC_HISTORY_CREATE,
      entityType: 'ACADEMIC_HISTORY',
      entityId: academic.id,
      metadata: { degree, institution },
    });

    return res.status(201).json({ 
      message: 'Academic entry created successfully',
      academic 
    });
  } catch (error) {
    console.error('Create academic history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update academic history entry
 * PUT /researchers/me/academic/:id
 */
const updateAcademicHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { degree, field, institution, year } = trimStringFields(req.body || {});

    const academic = await AcademicHistory.findOne({
      where: { id, user_id: userId }
    });

    if (!academic) {
      return res.status(404).json({ error: 'Academic entry not found' });
    }

    const updates = {};
    if (degree !== undefined) updates.degree = degree;
    if (field !== undefined) updates.field = field;
    if (institution !== undefined) updates.institution = institution;
    if (year !== undefined) updates.year = year;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    await academic.update(updates);

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.ACADEMIC_HISTORY_UPDATE,
      entityType: 'ACADEMIC_HISTORY',
      entityId: academic.id,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({ 
      message: 'Academic entry updated successfully',
      academic 
    });
  } catch (error) {
    console.error('Update academic history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete academic history entry
 * DELETE /researchers/me/academic/:id
 */
const deleteAcademicHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const academic = await AcademicHistory.findOne({
      where: { id, user_id: userId }
    });

    if (!academic) {
      return res.status(404).json({ error: 'Academic entry not found' });
    }

    await academic.destroy();

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.ACADEMIC_HISTORY_DELETE,
      entityType: 'ACADEMIC_HISTORY',
      entityId: Number(id),
      metadata: {},
    });

    return res.status(200).json({ message: 'Academic entry deleted successfully' });
  } catch (error) {
    console.error('Delete academic history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get researcher's certifications
 * GET /researchers/me/certifications
 */
const getCertifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const certifications = await Certification.findAll({
      where: { user_id: userId },
      order: [['year', 'DESC'], ['created_at', 'DESC']]
    });

    return res.status(200).json({ certifications });
  } catch (error) {
    console.error('Get certifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create certification entry
 * POST /researchers/me/certifications
 */
const createCertification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, issuer, year, credential_id } = trimStringFields(req.body || {});

    if (!name || !issuer) {
      return res.status(400).json({ error: 'Name and issuer are required' });
    }

    const certification = await Certification.create({
      user_id: userId,
      name,
      issuer,
      year,
      credential_id
    });

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.CERTIFICATION_CREATE,
      entityType: 'CERTIFICATION',
      entityId: certification.id,
      metadata: { name, issuer },
    });

    return res.status(201).json({ 
      message: 'Certification created successfully',
      certification 
    });
  } catch (error) {
    console.error('Create certification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update certification entry
 * PUT /researchers/me/certifications/:id
 */
const updateCertification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, issuer, year, credential_id } = trimStringFields(req.body || {});

    const certification = await Certification.findOne({
      where: { id, user_id: userId }
    });

    if (!certification) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (issuer !== undefined) updates.issuer = issuer;
    if (year !== undefined) updates.year = year;
    if (credential_id !== undefined) updates.credential_id = credential_id;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    await certification.update(updates);

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.CERTIFICATION_UPDATE,
      entityType: 'CERTIFICATION',
      entityId: certification.id,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({ 
      message: 'Certification updated successfully',
      certification 
    });
  } catch (error) {
    console.error('Update certification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete certification entry
 * DELETE /researchers/me/certifications/:id
 */
const deleteCertification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const certification = await Certification.findOne({
      where: { id, user_id: userId }
    });

    if (!certification) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    await certification.destroy();

    void logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.CERTIFICATION_DELETE,
      entityType: 'CERTIFICATION',
      entityId: Number(id),
      metadata: {},
    });

    return res.status(200).json({ message: 'Certification deleted successfully' });
  } catch (error) {
    console.error('Delete certification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get researcher's projects (via applications/agreements)
 * GET /researchers/me/projects
 */
const getResearcherProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get researcher profile to get researcher_id
    const researcherProfile = await ResearcherProfile.findOne({
      where: { user_id: userId }
    });

    if (!researcherProfile) {
      return res.status(404).json({ error: 'Researcher profile not found' });
    }

    // Get applications/agreements for this researcher
    const applications = await Application.findAll({
      where: { researcher_id: researcherProfile.user_id },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'mission', 'focus_tags']
        }
      ],
      order: [['id', 'DESC']]
    });

    // Transform applications to project format
    const projects = applications.map(app => ({
      id: app.id,
      type: app.type || 'Collaboration Agreement',
      status: app.type === 'completed' ? 'completed' : 'in_progress',
      organization: app.organization ? {
        name: app.organization.name,
        mission: app.organization.mission,
        focus_tags: app.organization.focus_tags
      } : null,
      budget_info: app.budget_info,
      value: app.value,
      created_at: app.created_at
    }));

    // Separate current and completed projects
    const currentProjects = projects.filter(p => p.status === 'in_progress');
    const completedProjects = projects.filter(p => p.status === 'completed');

    return res.status(200).json({ 
      projects: {
        current: currentProjects,
        completed: completedProjects,
        total: projects.length
      }
    });
  } catch (error) {
    console.error('Get researcher projects error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get a researcher's public profile by user ID
 * GET /researchers/:id
 * Auth: any authenticated user (nonprofit, researcher, admin)
 */
const getResearcherProfileById = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await ResearcherProfile.findOne({
      where: { user_id: id }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Researcher profile not found' });
    }

    // Fetch user info (only active, non-deleted users)
    const user = await User.findOne({
      where: { id, account_status: 'active', deleted_at: null },
      attributes: ['id', 'name', 'email', 'role']
    });

    if (!user) {
      return res.status(404).json({ error: 'Researcher not found' });
    }

    // Fetch academic history and certifications
    const academics = await AcademicHistory.findAll({
      where: { user_id: id },
      order: [['year', 'DESC']]
    });

    const certifications = await Certification.findAll({
      where: { user_id: id },
      order: [['year', 'DESC']]
    });

    return res.status(200).json({
      profile: profile.toSafeObject(),
      user: user.toSafeObject(),
      academics,
      certifications
    });
  } catch (error) {
    console.error('Get researcher profile by ID error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getResearcherProfile,
  updateResearcherProfile,
  getAcademicHistory,
  createAcademicHistory,
  updateAcademicHistory,
  deleteAcademicHistory,
  getCertifications,
  createCertification,
  updateCertification,
  deleteCertification,
  getResearcherProjects,
  getResearcherProfileById
};
