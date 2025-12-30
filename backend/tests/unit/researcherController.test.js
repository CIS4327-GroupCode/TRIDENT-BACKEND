/**
 * Unit Tests for Researcher Controller
 * Tests researcher profile management, academic history, and certifications
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/database/models', () => ({
  ResearcherProfile: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  AcademicHistory: {
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn()
  },
  Certification: {
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn()
  },
  Application: {},
  Project: {},
  Organization: {}
}));

const researcherController = require('../../src/controllers/researcherController');
const { ResearcherProfile, AcademicHistory, Certification } = require('../../src/database/models');

describe('Researcher Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 1, role: 'researcher' },
      body: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getResearcherProfile', () => {
    it('should return researcher profile', async () => {
      const mockProfile = {
        id: 1,
        user_id: 1,
        title: 'PhD Researcher',
        institution: 'Test University',
        expertise: 'Data Analysis'
      };

      ResearcherProfile.findOne.mockResolvedValue(mockProfile);

      await researcherController.getResearcherProfile(req, res);

      expect(ResearcherProfile.findOne).toHaveBeenCalledWith({
        where: { user_id: 1 }
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ profile: mockProfile });
    });

    it('should return 403 if user is not researcher', async () => {
      req.user.role = 'nonprofit';

      await researcherController.getResearcherProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only researcher users can access researcher profile settings'
      });
    });

    it('should return 404 if profile not found', async () => {
      ResearcherProfile.findOne.mockResolvedValue(null);

      await researcherController.getResearcherProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Researcher profile not found'
      });
    });

    it('should handle database errors', async () => {
      ResearcherProfile.findOne.mockRejectedValue(new Error('Database error'));

      await researcherController.getResearcherProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('updateResearcherProfile', () => {
    it('should update researcher profile successfully', async () => {
      req.body = {
        title: 'Senior Researcher',
        institution: 'Updated University',
        expertise: 'Machine Learning'
      };

      const mockProfile = {
        id: 1,
        user_id: 1,
        title: 'PhD Researcher',
        update: jest.fn().mockResolvedValue(true)
      };

      ResearcherProfile.findOne.mockResolvedValue(mockProfile);

      await researcherController.updateResearcherProfile(req, res);

      expect(mockProfile.update).toHaveBeenCalledWith({
        title: 'Senior Researcher',
        institution: 'Updated University',
        expertise: 'Machine Learning'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 403 if user is not researcher', async () => {
      req.user.role = 'nonprofit';

      await researcherController.updateResearcherProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should validate hourly rate range', async () => {
      req.body = {
        hourly_rate_min: 100,
        hourly_rate_max: 50 // Max less than min
      };

      const mockProfile = {
        id: 1,
        update: jest.fn()
      };

      ResearcherProfile.findOne.mockResolvedValue(mockProfile);

      await researcherController.updateResearcherProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Minimum rate cannot exceed maximum rate'
      });
    });

    it('should return 400 if no valid fields provided', async () => {
      req.body = { invalid_field: 'test' };

      await researcherController.updateResearcherProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No valid update fields provided'
      });
    });

    it('should filter out disallowed fields', async () => {
      req.body = {
        title: 'New Title',
        id: 999, // Should be filtered
        user_id: 999 // Should be filtered
      };

      const mockProfile = {
        id: 1,
        update: jest.fn().mockResolvedValue(true)
      };

      ResearcherProfile.findOne.mockResolvedValue(mockProfile);

      await researcherController.updateResearcherProfile(req, res);

      expect(mockProfile.update).toHaveBeenCalledWith({ title: 'New Title' });
      expect(mockProfile.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 999 })
      );
    });
  });

  describe('getAcademicHistory', () => {
    it('should return academic history for user', async () => {
      const mockAcademics = [
        {
          id: 1,
          degree: 'PhD',
          field: 'Computer Science',
          institution: 'MIT',
          year: 2020
        },
        {
          id: 2,
          degree: 'MSc',
          field: 'Data Science',
          institution: 'Stanford',
          year: 2015
        }
      ];

      AcademicHistory.findAll.mockResolvedValue(mockAcademics);

      await researcherController.getAcademicHistory(req, res);

      expect(AcademicHistory.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 1 }
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ academics: mockAcademics });
    });

    it('should handle database errors', async () => {
      AcademicHistory.findAll.mockRejectedValue(new Error('Database error'));

      await researcherController.getAcademicHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('createAcademicHistory', () => {
    it('should create academic history entry', async () => {
      req.body = {
        degree: 'PhD',
        field: 'Biology',
        institution: 'Harvard',
        year: 2021
      };

      const mockAcademic = {
        id: 1,
        user_id: 1,
        ...req.body
      };

      AcademicHistory.create.mockResolvedValue(mockAcademic);

      await researcherController.createAcademicHistory(req, res);

      expect(AcademicHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 1,
          degree: 'PhD',
          field: 'Biology'
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 400 if required fields missing', async () => {
      req.body = { field: 'Biology' }; // Missing degree and institution

      await researcherController.createAcademicHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Degree and institution are required'
      });
    });

    it('should handle database errors', async () => {
      req.body = {
        degree: 'PhD',
        institution: 'Test'
      };

      AcademicHistory.create.mockRejectedValue(new Error('Database error'));

      await researcherController.createAcademicHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('updateAcademicHistory', () => {
    it('should update academic history entry', async () => {
      req.params.id = 1;
      req.body = {
        degree: 'PhD (Updated)',
        year: 2022
      };

      const mockAcademic = {
        id: 1,
        user_id: 1,
        degree: 'PhD',
        update: jest.fn().mockResolvedValue(true)
      };

      AcademicHistory.findOne.mockResolvedValue(mockAcademic);

      await researcherController.updateAcademicHistory(req, res);

      expect(mockAcademic.update).toHaveBeenCalledWith({
        degree: 'PhD (Updated)',
        year: 2022
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 if academic entry not found', async () => {
      req.params.id = 999;
      req.body = { degree: 'PhD' };

      AcademicHistory.findOne.mockResolvedValue(null);

      await researcherController.updateAcademicHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
