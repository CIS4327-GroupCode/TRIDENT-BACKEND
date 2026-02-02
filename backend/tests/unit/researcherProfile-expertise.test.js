/**
 * Unit Tests for Expertise Fields Migration
 * Tests the new expertise, title, institution, and related fields
 * Added: February 2, 2026
 */

const { User, ResearcherProfile } = require('../../src/database/models');
const sequelize = require('../../src/database/index');

describe('ResearcherProfile - Expertise Fields', () => {
  beforeAll(async () => {
    // Ensure database connection is established
    await sequelize.authenticate();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('Model Field Definitions', () => {
    it('should have expertise field defined', () => {
      const expertiseField = ResearcherProfile.rawAttributes.expertise;
      expect(expertiseField).toBeDefined();
      expect(expertiseField.type.constructor.name).toBe('TEXT');
    });

    it('should have title field defined', () => {
      const titleField = ResearcherProfile.rawAttributes.title;
      expect(titleField).toBeDefined();
      expect(titleField.type.constructor.name).toBe('STRING');
    });

    it('should have institution field defined', () => {
      const institutionField = ResearcherProfile.rawAttributes.institution;
      expect(institutionField).toBeDefined();
      expect(institutionField.type.constructor.name).toBe('STRING');
    });

    it('should have research_interests field defined', () => {
      const interestsField = ResearcherProfile.rawAttributes.research_interests;
      expect(interestsField).toBeDefined();
      expect(interestsField.type.constructor.name).toBe('TEXT');
    });

    it('should have compliance_certifications field defined', () => {
      const certificationsField = ResearcherProfile.rawAttributes.compliance_certifications;
      expect(certificationsField).toBeDefined();
      expect(certificationsField.type.constructor.name).toBe('TEXT');
    });

    it('should have projects_completed field defined with default value', () => {
      const projectsField = ResearcherProfile.rawAttributes.projects_completed;
      expect(projectsField).toBeDefined();
      expect(projectsField.type.constructor.name).toBe('INTEGER');
      expect(projectsField.defaultValue).toBe(0);
    });

    it('should have hourly_rate_min and hourly_rate_max fields', () => {
      const rateMinField = ResearcherProfile.rawAttributes.hourly_rate_min;
      const rateMaxField = ResearcherProfile.rawAttributes.hourly_rate_max;
      
      expect(rateMinField).toBeDefined();
      expect(rateMaxField).toBeDefined();
      expect(rateMinField.type.constructor.name).toBe('DECIMAL');
      expect(rateMaxField.type.constructor.name).toBe('DECIMAL');
    });
  });

  describe('Database Operations', () => {
    let testUser;
    let testUserId;

    beforeEach(async () => {
      // Create a valid user first (required for foreign key constraint)
      testUser = await User.create({
        name: `Test User ${Date.now()}`,
        email: `test.${Date.now()}.${Math.random()}@test.com`,
        password_hash: 'hashed_password',
        role: 'researcher',
        account_status: 'active'
      });
      testUserId = testUser.id;
    });

    afterEach(async () => {
      // Clean up test data
      try {
        await ResearcherProfile.destroy({ where: { user_id: testUserId } });
        await User.destroy({ where: { id: testUserId } });
      } catch (err) {
        // Ignore cleanup errors
      }
    });

    it('should create profile with expertise field', async () => {
      const profileData = {
        user_id: testUserId,
        expertise: 'Machine Learning, Natural Language Processing, Data Analysis',
        title: 'PhD Candidate',
        institution: 'MIT',
        domains: 'AI, Healthcare',
        methods: 'Quantitative, Mixed Methods'
      };

      const profile = await ResearcherProfile.create(profileData);

      expect(profile).toBeDefined();
      expect(profile.user_id).toBe(testUserId);
      expect(profile.expertise).toBe('Machine Learning, Natural Language Processing, Data Analysis');
      expect(profile.title).toBe('PhD Candidate');
      expect(profile.institution).toBe('MIT');
    });

    it('should create profile with all new fields', async () => {
      const profileData = {
        user_id: testUserId,
        expertise: 'Survey Design, Statistical Analysis',
        title: 'Assistant Professor',
        institution: 'Stanford University',
        research_interests: 'Focus on educational outcomes and youth development',
        compliance_certifications: 'IRB Certified, CITI Training',
        projects_completed: 5,
        hourly_rate_min: 75.00,
        hourly_rate_max: 150.00,
        domains: 'Education, Psychology',
        methods: 'Qualitative, Survey'
      };

      const profile = await ResearcherProfile.create(profileData);

      expect(profile.expertise).toBe('Survey Design, Statistical Analysis');
      expect(profile.title).toBe('Assistant Professor');
      expect(profile.institution).toBe('Stanford University');
      expect(profile.research_interests).toBe('Focus on educational outcomes and youth development');
      expect(profile.compliance_certifications).toBe('IRB Certified, CITI Training');
      expect(profile.projects_completed).toBe(5);
      expect(parseFloat(profile.hourly_rate_min)).toBe(75.00);
      expect(parseFloat(profile.hourly_rate_max)).toBe(150.00);
    });

    it('should allow null values for optional fields', async () => {
      const profileData = {
        user_id: testUserId,
        expertise: null,
        title: null,
        institution: null,
        research_interests: null,
        compliance_certifications: null
      };

      const profile = await ResearcherProfile.create(profileData);

      expect(profile.expertise).toBeNull();
      expect(profile.title).toBeNull();
      expect(profile.institution).toBeNull();
      expect(profile.research_interests).toBeNull();
      expect(profile.compliance_certifications).toBeNull();
    });

    it('should default projects_completed to 0 if not provided', async () => {
      const profileData = {
        user_id: testUserId,
        expertise: 'Data Science'
      };

      const profile = await ResearcherProfile.create(profileData);

      expect(profile.projects_completed).toBe(0);
    });

    it('should update expertise field', async () => {
      // Create initial profile
      const profile = await ResearcherProfile.create({
        user_id: testUserId,
        expertise: 'Initial Expertise'
      });

      // Update expertise
      profile.expertise = 'Updated Expertise, Machine Learning, AI';
      await profile.save();

      // Fetch and verify
      const updated = await ResearcherProfile.findOne({ where: { user_id: testUserId } });
      expect(updated.expertise).toBe('Updated Expertise, Machine Learning, AI');
    });

    it('should handle long expertise text', async () => {
      const longExpertise = 'Machine Learning, Natural Language Processing, Computer Vision, ' +
        'Deep Learning, Neural Networks, Statistical Analysis, Data Visualization, ' +
        'Python Programming, R Programming, SQL, Big Data Analytics, Cloud Computing';

      const profile = await ResearcherProfile.create({
        user_id: testUserId,
        expertise: longExpertise
      });

      expect(profile.expertise).toBe(longExpertise);
      expect(profile.expertise.length).toBeGreaterThan(100);
    });
  });

  describe('Query and Filter Operations', () => {
    it('should find profiles by expertise using LIKE', async () => {
      // Create test users
      const user1 = await User.create({
        name: 'Test User ML',
        email: `ml.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });
      
      const user2 = await User.create({
        name: 'Test User Survey',
        email: `survey.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });

      try {
        await ResearcherProfile.create({
          user_id: user1.id,
          expertise: 'Machine Learning, AI, Python'
        });

        await ResearcherProfile.create({
          user_id: user2.id,
          expertise: 'Survey Design, Qualitative Methods'
        });

        const { Op } = require('sequelize');
        const profiles = await ResearcherProfile.findAll({
          where: {
            expertise: { [Op.iLike]: '%Machine Learning%' }
          }
        });

        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles.some(p => p.user_id === user1.id)).toBe(true);
      } finally {
        await ResearcherProfile.destroy({ where: { user_id: [user1.id, user2.id] } });
        await User.destroy({ where: { id: [user1.id, user2.id] } });
      }
    });

    it('should find profiles by institution', async () => {
      const user1 = await User.create({
        name: 'Test User Harvard',
        email: `harvard.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });

      try {
        await ResearcherProfile.create({
          user_id: user1.id,
          institution: 'Harvard University',
          expertise: 'Economics'
        });

        const { Op } = require('sequelize');
        const profiles = await ResearcherProfile.findAll({
          where: {
            institution: { [Op.iLike]: '%Harvard%' }
          }
        });

        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles.some(p => p.user_id === user1.id)).toBe(true);
      } finally {
        await ResearcherProfile.destroy({ where: { user_id: user1.id } });
        await User.destroy({ where: { id: user1.id } });
      }
    });

    it('should filter by projects_completed', async () => {
      const user1 = await User.create({
        name: 'Test User Experienced',
        email: `exp.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });

      try {
        await ResearcherProfile.create({
          user_id: user1.id,
          expertise: 'Data Science',
          projects_completed: 10
        });

        const { Op } = require('sequelize');
        const profiles = await ResearcherProfile.findAll({
          where: {
            projects_completed: { [Op.gte]: 5 }
          }
        });

        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles.some(p => p.user_id === user1.id)).toBe(true);
      } finally {
        await ResearcherProfile.destroy({ where: { user_id: user1.id } });
        await User.destroy({ where: { id: user1.id } });
      }
    });

    it('should filter by hourly rate range', async () => {
      const user1 = await User.create({
        name: 'Test User Consultant',
        email: `consult.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });

      try {
        await ResearcherProfile.create({
          user_id: user1.id,
          expertise: 'Consulting',
          hourly_rate_min: 100.00,
          hourly_rate_max: 200.00
        });

        const { Op } = require('sequelize');
        const profiles = await ResearcherProfile.findAll({
          where: {
            hourly_rate_min: { [Op.lte]: 150 },
            hourly_rate_max: { [Op.gte]: 100 }
          }
        });

        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles.some(p => p.user_id === user1.id)).toBe(true);
      } finally {
        await ResearcherProfile.destroy({ where: { user_id: user1.id } });
        await User.destroy({ where: { id: user1.id } });
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should still work with existing fields (domains, methods, tools)', async () => {
      const user = await User.create({
        name: 'Test User Compat',
        email: `compat.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });

      try {
        const profile = await ResearcherProfile.create({
          user_id: user.id,
          domains: 'Healthcare, Education',
          methods: 'Quantitative, Survey',
          tools: 'SPSS, R, Python',
          rate_min: 50.00,
          rate_max: 100.00,
          availability: '20 hours/week'
        });

        expect(profile.domains).toBe('Healthcare, Education');
        expect(profile.methods).toBe('Quantitative, Survey');
        expect(profile.tools).toBe('SPSS, R, Python');
        expect(parseFloat(profile.rate_min)).toBe(50.00);
        expect(parseFloat(profile.rate_max)).toBe(100.00);
        expect(profile.availability).toBe('20 hours/week');
      } finally {
        await ResearcherProfile.destroy({ where: { user_id: user.id } });
        await User.destroy({ where: { id: user.id } });
      }
    });

    it('should support both rate_min/max and hourly_rate_min/max', async () => {
      const user = await User.create({
        name: 'Test User Rates',
        email: `rates.${Date.now()}@test.com`,
        password_hash: 'hash',
        role: 'researcher',
        account_status: 'active'
      });

      try {
        const profile = await ResearcherProfile.create({
          user_id: user.id,
          rate_min: 75.00,
          rate_max: 125.00,
          hourly_rate_min: 80.00,
          hourly_rate_max: 130.00
        });

        expect(parseFloat(profile.rate_min)).toBe(75.00);
        expect(parseFloat(profile.hourly_rate_min)).toBe(80.00);
        // Both fields should be independent
      } finally {
        await ResearcherProfile.destroy({ where: { user_id: user.id } });
        await User.destroy({ where: { id: user.id } });
      }
    });
  });
});
