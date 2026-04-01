const { User, Organization, ResearcherProfile } = require("../database/models");

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return null;
};

// REGISTER ROUTE
const findUserByEmail = async (email) => {  
    const exists = await User.findOne({ 
      where: { email },
      attributes: ['id']
    });
    return !!exists;
}

const createUser = async (name, email, password_hash, role, mfa_enabled, organizationData, researcherData) => {
    // Create user and associated profile in a transaction
    const sequelize = User.sequelize;
    const transaction = await sequelize.transaction();
    
    try {
      // Create user
      const user = await User.create({
        name,
        email,
        password_hash,
        role: role || 'researcher',
        mfa_enabled: !!mfa_enabled
      }, { transaction });

      // If nonprofit, create organization profile
      if (role === 'nonprofit' && organizationData) {
        const organization = await Organization.create({
          name: organizationData.name || name,
          EIN: organizationData.EIN || null,
          mission: organizationData.mission || null,
          focus_tags: organizationData.focus_tags ? JSON.stringify(organizationData.focus_tags) : null,
          compliance_flags: organizationData.compliance_flags ? JSON.stringify(organizationData.compliance_flags) : null,
          contacts: organizationData.contacts ? JSON.stringify(organizationData.contacts) : null,
          user_id: user.id,
          website: organizationData.website || organizationData.contacts?.website || null,
          focus_areas: parseArrayField(organizationData.focus_areas || organizationData.focus_tags)
        }, { transaction });

        // Ensure downstream flows use the same org_id reference for nonprofit ownership checks.
        user.org_id = organization.id;
        await user.save({ transaction });
      }

      // If researcher, create researcher profile
      if (role === 'researcher' && researcherData) {
        await ResearcherProfile.create({
          user_id: user.id,
          affiliation: researcherData.affiliation || null,
          domains: researcherData.domains ? JSON.stringify(researcherData.domains) : null,
          methods: researcherData.methods ? JSON.stringify(researcherData.methods) : null,
          tools: researcherData.tools ? JSON.stringify(researcherData.tools) : null,
          rate_min: researcherData.rate_min || null,
          rate_max: researcherData.rate_max || null,
          availability: researcherData.availability || null
        }, { transaction });
      }

      await transaction.commit();

      // Return plain object matching old format
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        org_id: user.org_id || null,
        created_at: user.created_at
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
}

// LOGIN ROUTE
const getUserByEmail = async (email) => {
    const user = await User.findOne({ 
      where: { email },
      attributes: ['id', 'name', 'email', 'role', 'org_id', 'created_at', 'password_hash', 'mfa_enabled']
    });
    
    if (!user) return null;
    
    // Return plain object matching old format
    return user.toJSON();
}

module.exports = {
    findUserByEmail,
    createUser,
    getUserByEmail
}