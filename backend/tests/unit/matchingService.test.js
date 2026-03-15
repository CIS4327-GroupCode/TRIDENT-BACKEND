jest.mock('../../src/database/models/Project', () => ({
  findByPk: jest.fn(),
  findAll: jest.fn()
}));

jest.mock('../../src/database/models/ResearcherProfile', () => ({
  findAll: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../src/database/models/Organization', () => ({
  findByPk: jest.fn(),
  findAll: jest.fn()
}));

jest.mock('../../src/database/models/User', () => ({
  findAll: jest.fn()
}));

jest.mock('../../src/database/models/Match', () => ({
  findAll: jest.fn()
}));

jest.mock('../../src/database/models/Application', () => ({
  findAll: jest.fn()
}));

const Project = require('../../src/database/models/Project');
const ResearcherProfile = require('../../src/database/models/ResearcherProfile');
const Organization = require('../../src/database/models/Organization');
const User = require('../../src/database/models/User');
const Match = require('../../src/database/models/Match');
const Application = require('../../src/database/models/Application');

const matchingService = require('../../src/services/matchingService');

describe('matchingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('utility functions', () => {
    it('parseCommaSeparated handles null/empty', () => {
      expect(matchingService.parseCommaSeparated(null)).toEqual([]);
      expect(matchingService.parseCommaSeparated('')).toEqual([]);
    });

    it('parseCommaSeparated ignores non-string values', () => {
      expect(matchingService.parseCommaSeparated(123)).toEqual([]);
      expect(matchingService.parseCommaSeparated({ tags: 'a,b' })).toEqual([]);
    });

    it('parseCommaSeparated trims and lowercases', () => {
      expect(matchingService.parseCommaSeparated(' Survey,  Analysis , R ')).toEqual([
        'survey',
        'analysis',
        'r'
      ]);
    });

    it('parseComplianceCertifications supports strings and arrays', () => {
      expect(matchingService.parseComplianceCertifications('IRB, FERPA ')).toEqual(['irb', 'ferpa']);
      expect(matchingService.parseComplianceCertifications([' HIPAA ', 'IRB'])).toEqual(['hipaa', 'irb']);
      expect(matchingService.parseComplianceCertifications(null)).toEqual([]);
    });

    it('calculateJaccardSimilarity works for overlap cases', () => {
      expect(matchingService.calculateJaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
      expect(matchingService.calculateJaccardSimilarity(['a'], ['b'])).toBe(0);
      expect(matchingService.calculateJaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    });

    it('calculateJaccardSimilarity returns zero when one or both sets are empty', () => {
      expect(matchingService.calculateJaccardSimilarity([], [])).toBe(0);
      expect(matchingService.calculateJaccardSimilarity(new Set(['a']), new Set())).toBe(0);
    });

    it('checkRangeOverlap handles full/no overlap', () => {
      expect(matchingService.checkRangeOverlap({ min: 100, max: 200 }, { min: 100, max: 200 })).toBe(1);
      expect(matchingService.checkRangeOverlap({ min: 100, max: 150 }, { min: 200, max: 250 })).toBe(0);
    });

    it('checkRangeOverlap returns zero for incomplete ranges and partial overlap otherwise', () => {
      expect(matchingService.checkRangeOverlap({ min: 100, max: 200 }, { min: null, max: 250 })).toBe(0);
      expect(matchingService.checkRangeOverlap({ min: 100, max: 300 }, { min: 200, max: 400 })).toBeCloseTo(0.5);
    });
  });

  describe('scoring functions', () => {
    it('calculates expertise score with partial overlap', () => {
      const score = matchingService.calculateExpertiseScore('survey,analysis', 'survey,python');
      expect(score).toBe(10);
    });

    it('calculates methods score and defaults to 25 when no requirements', () => {
      expect(matchingService.calculateMethodsScore('', 'survey')).toBe(25);
      expect(matchingService.calculateMethodsScore('survey,interview', 'survey')).toBe(12.5);
    });

    it('calculates budget score including fallback hourly_rate fields', () => {
      const scoreWithFallback = matchingService.calculateBudgetScore(
        { budget_min: 2000, budget_max: 5000, estimated_hours: 40 },
        { hourly_rate_min: 40, hourly_rate_max: 70 }
      );

      expect(scoreWithFallback).toBeGreaterThan(0);
      expect(matchingService.calculateBudgetScore({ budget_min: 0, budget_max: 0 }, { rate_min: 50, rate_max: 60 })).toBe(0);
      expect(matchingService.calculateBudgetScore({ budget_min: 1000, budget_max: 2000 }, { rate_min: 0, rate_max: 0 })).toBe(0);
    });

    it('calculates availability and experience tiers', () => {
      expect(
        matchingService.calculateAvailabilityScore(
          { start_date: '2026-03-20' },
          { current_projects_count: 1, max_concurrent_projects: 3, available_start_date: '2026-03-01' }
        )
      ).toBe(10);

      expect(
        matchingService.calculateAvailabilityScore(
          { start_date: '2026-03-20' },
          { current_projects_count: 4, max_concurrent_projects: 3, available_start_date: '2026-03-30' }
        )
      ).toBe(0);

      expect(
        matchingService.calculateAvailabilityScore(
          { start_date: null },
          { current_projects_count: 0, max_concurrent_projects: 1, available_start_date: null }
        )
      ).toBe(10);

      expect(matchingService.calculateExperienceScore(0)).toBe(0);
      expect(matchingService.calculateExperienceScore(2)).toBe(3);
      expect(matchingService.calculateExperienceScore(5)).toBe(5);
      expect(matchingService.calculateExperienceScore(6)).toBe(7);
      expect(matchingService.calculateExperienceScore(20)).toBe(9);
      expect(matchingService.calculateExperienceScore(30)).toBe(10);
    });

    it('calculates domain score for overlap and empty inputs', () => {
      expect(matchingService.calculateDomainScore('health,education', 'health')).toBe(5);
      expect(matchingService.calculateDomainScore('', 'health')).toBe(0);
      expect(matchingService.calculateDomainScore('health', '')).toBe(0);
    });

    it('calculateMatchScore returns totals and insights', () => {
      const result = matchingService.calculateMatchScore(
        {
          problem: 'survey,analysis',
          methods_required: 'survey,interview',
          budget_min: 1000,
          budget_max: 5000,
          estimated_hours: 40,
          start_date: '2026-04-01',
          organization: { focus_areas: 'public health,education' }
        },
        {
          expertise: 'survey,analysis',
          methods: 'survey,interview',
          rate_min: 20,
          rate_max: 30,
          available_start_date: '2026-03-20',
          current_projects_count: 1,
          max_concurrent_projects: 3,
          projects_completed: 15,
          domains: 'public health'
        }
      );

      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.breakdown).toHaveProperty('expertise');
      expect(Array.isArray(result.strengths)).toBe(true);
      expect(Array.isArray(result.concerns)).toBe(true);
    });

    it('calculateMatchScore reports concerns on weak alignment', () => {
      const result = matchingService.calculateMatchScore(
        {
          problem: 'genomics',
          methods_required: 'ethnography',
          budget_min: 10000,
          budget_max: 15000,
          estimated_hours: 50,
          start_date: '2026-01-01',
          organization: { focus_areas: 'climate' }
        },
        {
          expertise: 'education',
          methods: 'survey',
          rate_min: 500,
          rate_max: 700,
          available_start_date: '2026-06-01',
          current_projects_count: 5,
          max_concurrent_projects: 3,
          projects_completed: 0,
          domains: 'public health'
        }
      );

      expect(result.concerns.length).toBeGreaterThan(0);
      expect(result.concerns).toContain('Missing some required methods');
      expect(result.concerns).toContain('Different research domain focus');
    });

    it('calculateMatchScore includes compliance insight for high-sensitivity projects', () => {
      const result = matchingService.calculateMatchScore(
        {
          problem: 'policy',
          methods_required: 'survey',
          budget_min: 1000,
          budget_max: 2000,
          data_sensitivity: 'high',
          organization: { focus_areas: 'health' }
        },
        {
          expertise: 'policy',
          methods: 'survey',
          domains: 'health',
          projects_completed: 3,
          current_projects_count: 0,
          max_concurrent_projects: 3,
          compliance_certifications: ''
        }
      );

      expect(result.breakdown).toHaveProperty('has_certifications', false);
      expect(result.concerns).toContain('No compliance certifications listed for high-sensitivity work');
    });
  });

  describe('match retrieval', () => {
    it('findMatchesForProject filters dismissed and marks hasApplied', async () => {
      Project.findByPk.mockResolvedValue({
        project_id: 22,
        org_id: 8,
        problem: 'survey',
        methods_required: 'survey',
        toJSON() {
          return { project_id: 22, org_id: 8, problem: 'survey', methods_required: 'survey' };
        }
      });
      Organization.findByPk.mockResolvedValue({
        id: 8,
        focus_areas: 'health',
        toJSON() {
          return { id: 8, focus_areas: 'health' };
        }
      });
      ResearcherProfile.findAll.mockResolvedValue([
        {
          user_id: 10,
          expertise: 'survey',
          methods: 'survey',
          toJSON() {
            return { user_id: 10, expertise: 'survey', methods: 'survey', projects_completed: 2, domains: 'health' };
          }
        },
        {
          user_id: 11,
          expertise: 'survey',
          methods: 'survey',
          toJSON() {
            return { user_id: 11, expertise: 'survey', methods: 'survey', projects_completed: 3, domains: 'health' };
          }
        }
      ]);
      User.findAll.mockResolvedValue([
        { id: 10, name: 'R1' },
        { id: 11, name: 'R2' }
      ]);
      Match.findAll.mockResolvedValue([{ researcher_id: 11 }]);
      Application.findAll.mockResolvedValue([{ researcher_id: 10 }]);

      const result = await matchingService.findMatchesForProject(22, {
        limit: 20,
        offset: 0,
        minScore: 0
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].researcher.user_id).toBe(10);
      expect(result.matches[0].hasApplied).toBe(true);
    });

    it('findMatchesForProject throws when project missing', async () => {
      Project.findByPk.mockResolvedValue(null);

      await expect(
        matchingService.findMatchesForProject(999, { limit: 20, offset: 0, minScore: 0 })
      ).rejects.toThrow('Project not found');
    });

    it('findMatchesForProject survives application lookup failure', async () => {
      Project.findByPk.mockResolvedValue({
        project_id: 22,
        org_id: 8,
        problem: 'survey',
        methods_required: 'survey',
        toJSON() {
          return { project_id: 22, org_id: 8, problem: 'survey', methods_required: 'survey' };
        }
      });
      Organization.findByPk.mockResolvedValue({
        id: 8,
        focus_areas: 'health',
        toJSON() {
          return { id: 8, focus_areas: 'health' };
        }
      });
      ResearcherProfile.findAll.mockResolvedValue([
        {
          user_id: 10,
          expertise: 'survey',
          methods: 'survey',
          toJSON() {
            return { user_id: 10, expertise: 'survey', methods: 'survey', projects_completed: 2, domains: 'health' };
          }
        }
      ]);
      User.findAll.mockResolvedValue([{ id: 10, name: 'R1' }]);
      Match.findAll.mockResolvedValue([]);
      Application.findAll.mockRejectedValue(new Error('no-column-project_id'));

      const result = await matchingService.findMatchesForProject(22, {
        limit: 20,
        offset: 0,
        minScore: 0
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].hasApplied).toBe(false);
    });

    it('findMatchesForProject handles projects without organization and paginates filtered results', async () => {
      Project.findByPk.mockResolvedValue({
        project_id: 22,
        org_id: null,
        problem: 'survey',
        methods_required: 'survey',
        toJSON() {
          return { project_id: 22, org_id: null, problem: 'survey', methods_required: 'survey' };
        }
      });
      Organization.findByPk.mockResolvedValue(null);
      ResearcherProfile.findAll.mockResolvedValue([
        {
          user_id: 10,
          expertise: 'survey',
          methods: 'survey',
          toJSON() {
            return { user_id: 10, expertise: 'survey', methods: 'survey', projects_completed: 3, domains: 'health' };
          }
        },
        {
          user_id: 12,
          expertise: 'survey',
          methods: 'survey',
          toJSON() {
            return { user_id: 12, expertise: 'survey', methods: 'survey', projects_completed: 10, domains: 'health' };
          }
        }
      ]);
      User.findAll.mockResolvedValue([
        { id: 10, name: 'R1' },
        { id: 12, name: 'R2' }
      ]);
      Match.findAll.mockResolvedValue([]);
      Application.findAll.mockResolvedValue([]);

      const result = await matchingService.findMatchesForProject(22, {
        limit: 1,
        offset: 0,
        minScore: 1
      });

      expect(result.matches).toHaveLength(1);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.matches[0].researcher.name).toBeTruthy();
    });

    it('findMatchesForProject filters to researchers with compliance certifications', async () => {
      Project.findByPk.mockResolvedValue({
        project_id: 22,
        org_id: 8,
        problem: 'survey',
        methods_required: 'survey',
        toJSON() {
          return { project_id: 22, org_id: 8, problem: 'survey', methods_required: 'survey' };
        }
      });
      Organization.findByPk.mockResolvedValue({
        id: 8,
        focus_areas: 'health',
        toJSON() {
          return { id: 8, focus_areas: 'health' };
        }
      });
      ResearcherProfile.findAll.mockResolvedValue([
        {
          user_id: 10,
          expertise: 'survey',
          methods: 'survey',
          compliance_certifications: 'IRB',
          toJSON() {
            return {
              user_id: 10,
              expertise: 'survey',
              methods: 'survey',
              projects_completed: 2,
              domains: 'health',
              compliance_certifications: 'IRB'
            };
          }
        },
        {
          user_id: 11,
          expertise: 'survey',
          methods: 'survey',
          compliance_certifications: '',
          toJSON() {
            return {
              user_id: 11,
              expertise: 'survey',
              methods: 'survey',
              projects_completed: 3,
              domains: 'health',
              compliance_certifications: ''
            };
          }
        }
      ]);
      User.findAll.mockResolvedValue([
        { id: 10, name: 'R1' },
        { id: 11, name: 'R2' }
      ]);
      Match.findAll.mockResolvedValue([]);
      Application.findAll.mockResolvedValue([]);

      const result = await matchingService.findMatchesForProject(22, {
        limit: 20,
        offset: 0,
        minScore: 0,
        requireCompliance: true,
        complianceFilter: 'irb'
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].researcher.user_id).toBe(10);
      expect(result.matches[0].hasComplianceCertifications).toBe(true);
    });

    it('findMatchesForResearcher filters dismissed projects and sets hasApplied', async () => {
      ResearcherProfile.findOne.mockResolvedValue({
        user_id: 10,
        methods: 'survey',
        expertise: 'survey',
        domains: 'health',
        projects_completed: 5,
        toJSON() {
          return {
            user_id: 10,
            methods: 'survey',
            expertise: 'survey',
            domains: 'health',
            projects_completed: 5
          };
        }
      });
      Project.findAll.mockResolvedValue([
        {
          project_id: 1,
          org_id: 8,
          title: 'P1',
          methods_required: 'survey',
          toJSON() {
            return { project_id: 1, org_id: 8, title: 'P1', methods_required: 'survey' };
          }
        },
        {
          project_id: 2,
          org_id: 8,
          title: 'P2',
          methods_required: 'survey',
          toJSON() {
            return { project_id: 2, org_id: 8, title: 'P2', methods_required: 'survey' };
          }
        }
      ]);
      Organization.findAll.mockResolvedValue([
        {
          id: 8,
          name: 'Org',
          focus_areas: 'health',
          toJSON() {
            return { id: 8, name: 'Org', focus_areas: 'health' };
          }
        }
      ]);
      Match.findAll.mockResolvedValue([{ brief_id: 2 }]);
      Application.findAll.mockResolvedValue([{ project_id: 1 }]);

      const result = await matchingService.findMatchesForResearcher(10, {
        limit: 20,
        offset: 0,
        minScore: 0
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].project.project_id).toBe(1);
      expect(result.matches[0].hasApplied).toBe(true);
    });

    it('findMatchesForResearcher throws when profile missing', async () => {
      ResearcherProfile.findOne.mockResolvedValue(null);

      await expect(
        matchingService.findMatchesForResearcher(123)
      ).rejects.toThrow('Researcher profile not found');
    });

    it('findMatchesForResearcher survives application lookup failure', async () => {
      ResearcherProfile.findOne.mockResolvedValue({
        user_id: 10,
        methods: 'survey',
        expertise: 'survey',
        domains: 'health',
        projects_completed: 5,
        toJSON() {
          return {
            user_id: 10,
            methods: 'survey',
            expertise: 'survey',
            domains: 'health',
            projects_completed: 5
          };
        }
      });
      Project.findAll.mockResolvedValue([
        {
          project_id: 1,
          org_id: 8,
          title: 'P1',
          methods_required: 'survey',
          toJSON() {
            return { project_id: 1, org_id: 8, title: 'P1', methods_required: 'survey' };
          }
        }
      ]);
      Organization.findAll.mockResolvedValue([
        {
          id: 8,
          name: 'Org',
          focus_areas: 'health',
          toJSON() {
            return { id: 8, name: 'Org', focus_areas: 'health' };
          }
        }
      ]);
      Match.findAll.mockResolvedValue([]);
      Application.findAll.mockRejectedValue(new Error('no-column-project_id'));

      const result = await matchingService.findMatchesForResearcher(10, {
        limit: 20,
        offset: 0,
        minScore: 0
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].hasApplied).toBe(false);
    });

    it('findMatchesForResearcher uses default options and returns organization as null when missing', async () => {
      ResearcherProfile.findOne.mockResolvedValue({
        user_id: 10,
        methods: 'survey',
        expertise: 'survey',
        domains: 'health',
        projects_completed: 5,
        toJSON() {
          return {
            user_id: 10,
            methods: 'survey',
            expertise: 'survey',
            domains: 'health',
            projects_completed: 5
          };
        }
      });
      Project.findAll.mockResolvedValue([
        {
          project_id: 100,
          org_id: null,
          title: 'No Org Project',
          methods_required: 'survey',
          status: 'open',
          toJSON() {
            return { project_id: 100, org_id: null, title: 'No Org Project', methods_required: 'survey', status: 'open' };
          }
        }
      ]);
      Organization.findAll.mockResolvedValue([]);
      Match.findAll.mockResolvedValue([]);
      Application.findAll.mockResolvedValue([]);

      const result = await matchingService.findMatchesForResearcher(10);

      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.offset).toBe(0);
      expect(result.matches[0].project.organization).toBeNull();
    });
  });
});
