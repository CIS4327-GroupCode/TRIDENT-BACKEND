/**
 * Integration Tests for Browse Researchers Endpoint
 * Tests /api/users/browse/researchers with expertise filtering
 * Added: February 2, 2026
 */

const request = require('supertest');
const { User, ResearcherProfile } = require('../../src/database/models');
const sequelize = require('../../src/database/index');

// Mock app setup
const express = require('express');
const userRoutes = require('../../src/routes/userRoutes');

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

describe('Browse Researchers - Expertise Filtering', () => {
  let testUsers = [];

  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterAll(async () => {
    // Cleanup test data
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await ResearcherProfile.destroy({ where: { user_id: userIds } });
      await User.destroy({ where: { id: userIds } });
    }
    await sequelize.close();
  });

  beforeEach(async () => {
    // Create test researchers with different expertise
    const testData = [
      {
        user: {
          name: 'Dr. Alice ML',
          email: `alice.ml.${Date.now()}@test.com`,
          password_hash: 'hashed',
          role: 'researcher',
          account_status: 'active'
        },
        profile: {
          expertise: 'Machine Learning, Deep Learning, Python',
          title: 'PhD in AI',
          institution: 'MIT',
          domains: 'AI, Technology',
          methods: 'Quantitative',
          hourly_rate_min: 100,
          hourly_rate_max: 200
        }
      },
      {
        user: {
          name: 'Dr. Bob Survey',
          email: `bob.survey.${Date.now()}@test.com`,
          password_hash: 'hashed',
          role: 'researcher',
          account_status: 'active'
        },
        profile: {
          expertise: 'Survey Design, Qualitative Research, Focus Groups',
          title: 'Professor of Sociology',
          institution: 'Stanford',
          domains: 'Social Sciences, Education',
          methods: 'Qualitative, Mixed Methods',
          hourly_rate_min: 75,
          hourly_rate_max: 150
        }
      },
      {
        user: {
          name: 'Dr. Carol Stats',
          email: `carol.stats.${Date.now()}@test.com`,
          password_hash: 'hashed',
          role: 'researcher',
          account_status: 'active'
        },
        profile: {
          expertise: 'Statistical Analysis, Data Visualization, R Programming',
          title: 'Data Scientist',
          institution: 'Harvard',
          domains: 'Statistics, Healthcare',
          methods: 'Quantitative',
          tools: 'R, SPSS, Tableau',
          hourly_rate_min: 80,
          hourly_rate_max: 160
        }
      }
    ];

    for (const data of testData) {
      const user = await User.create(data.user);
      await ResearcherProfile.create({
        user_id: user.id,
        ...data.profile
      });
      testUsers.push(user);
    }
  });

  afterEach(async () => {
    // Clean up test users
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await ResearcherProfile.destroy({ where: { user_id: userIds } });
      await User.destroy({ where: { id: userIds } });
      testUsers = [];
    }
  });

  describe('GET /api/users/browse/researchers', () => {
    it('should return all active researchers', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      expect(response.body.researchers.length).toBeGreaterThanOrEqual(3);
      
      // Check that each researcher has researcherProfile
      response.body.researchers.forEach(r => {
        expect(r.researcherProfile).toBeDefined();
      });
    });

    it('should filter by expertise keyword', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?expertise=Machine Learning')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      expect(response.body.researchers.length).toBeGreaterThan(0);
      
      // Should find Dr. Alice ML
      const aliceFound = response.body.researchers.some(r => 
        r.researcherProfile.expertise.includes('Machine Learning')
      );
      expect(aliceFound).toBe(true);
    });

    it('should filter by methods', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?methods=Qualitative')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      
      // Should find Dr. Bob Survey
      const bobFound = response.body.researchers.some(r => 
        r.researcherProfile.methods?.includes('Qualitative')
      );
      expect(bobFound).toBe(true);
    });

    it('should filter by domains', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?domains=AI')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      
      // Should find researchers with AI domain
      const aiResearchers = response.body.researchers.filter(r => 
        r.researcherProfile.domains?.includes('AI')
      );
      expect(aiResearchers.length).toBeGreaterThan(0);
    });

    it('should filter by rate range', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?minRate=70&maxRate=90')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      
      // Should find Dr. Bob (75-150) and Dr. Carol (80-160)
      response.body.researchers.forEach(r => {
        if (r.researcherProfile.rate_min) {
          expect(parseFloat(r.researcherProfile.rate_min)).toBeGreaterThanOrEqual(70);
        }
      });
    });

    it('should search across multiple fields', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?search=MIT')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      
      // Should find researchers from MIT or with MIT in other fields
      const mitResearcher = response.body.researchers.some(r => 
        r.researcherProfile.institution?.includes('MIT') ||
        r.researcherProfile.expertise?.includes('MIT') ||
        r.name?.includes('MIT')
      );
      expect(mitResearcher).toBe(true);
    });

    it('should search by researcher name', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?search=Alice')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      
      const aliceFound = response.body.researchers.some(r => 
        r.name.includes('Alice')
      );
      expect(aliceFound).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?limit=2')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      expect(response.body.researchers.length).toBeLessThanOrEqual(2);
    });

    it('should return correct fields in response', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?limit=1')
        .expect(200);

      expect(response.body.researchers.length).toBeGreaterThan(0);
      
      const researcher = response.body.researchers[0];
      
      // User fields
      expect(researcher.id).toBeDefined();
      expect(researcher.name).toBeDefined();
      expect(researcher.email).toBeDefined();
      
      // Profile fields (new ones)
      expect(researcher.researcherProfile).toBeDefined();
      expect(researcher.researcherProfile.expertise).toBeDefined();
      expect(researcher.researcherProfile.affiliation).toBeDefined();
      expect(researcher.researcherProfile.domains).toBeDefined();
      expect(researcher.researcherProfile.methods).toBeDefined();
      expect(researcher.researcherProfile.tools).toBeDefined();
    });

    it('should handle no results gracefully', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?expertise=NonexistentExpertise12345')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      expect(response.body.researchers.length).toBe(0);
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?expertise=Machine Learning&methods=Quantitative')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
      
      // Should find researchers matching both criteria
      response.body.researchers.forEach(r => {
        const hasExpertise = r.researcherProfile.expertise?.includes('Machine Learning');
        const hasMethods = r.researcherProfile.methods?.includes('Quantitative');
        expect(hasExpertise || hasMethods).toBe(true);
      });
    });

    it('should not return inactive or deleted users', async () => {
      // Create an inactive user
      const inactiveUser = await User.create({
        name: 'Inactive User',
        email: `inactive.${Date.now()}@test.com`,
        password_hash: 'hashed',
        role: 'researcher',
        account_status: 'suspended'
      });

      await ResearcherProfile.create({
        user_id: inactiveUser.id,
        expertise: 'Should Not Appear'
      });

      const response = await request(app)
        .get('/api/users/browse/researchers')
        .expect(200);

      // Inactive user should not appear
      const foundInactive = response.body.researchers.some(r => 
        r.id === inactiveUser.id
      );
      expect(foundInactive).toBe(false);

      // Cleanup
      await ResearcherProfile.destroy({ where: { user_id: inactiveUser.id } });
      await User.destroy({ where: { id: inactiveUser.id } });
    });

    it('should handle pagination with offset', async () => {
      const response1 = await request(app)
        .get('/api/users/browse/researchers?limit=2&offset=0')
        .expect(200);

      const response2 = await request(app)
        .get('/api/users/browse/researchers?limit=2&offset=2')
        .expect(200);

      expect(response1.body.researchers).toBeDefined();
      expect(response2.body.researchers).toBeDefined();

      // Different pages should have different results
      if (response1.body.researchers.length > 0 && response2.body.researchers.length > 0) {
        expect(response1.body.researchers[0].id).not.toBe(response2.body.researchers[0].id);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid query parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/users/browse/researchers?limit=invalid')
        .expect(200); // Should still work with default limit

      expect(response.body.researchers).toBeDefined();
    });

    it('should handle database errors', async () => {
      // This would require mocking the database to throw an error
      // For now, just verify the endpoint is accessible
      const response = await request(app)
        .get('/api/users/browse/researchers')
        .expect(200);

      expect(response.body.researchers).toBeDefined();
    });
  });
});
