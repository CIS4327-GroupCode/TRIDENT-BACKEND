/**
 * Unit Tests for Researcher Controller
 */

jest.mock('../../src/database/models', () => ({
  ResearcherProfile: {
    findOne: jest.fn()
  },
  AcademicHistory: {
    create: jest.fn(),
    findOne: jest.fn()
  },
  Certification: {
    create: jest.fn(),
    findOne: jest.fn()
  },
  Application: {},
  Project: {},
  Organization: {},
  User: {}
}));

jest.mock('../../src/utils/auditLogger', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: {
    RESEARCHER_PROFILE_UPDATE: 'RESEARCHER_PROFILE_UPDATE',
    ACADEMIC_HISTORY_CREATE: 'ACADEMIC_HISTORY_CREATE',
    CERTIFICATION_CREATE: 'CERTIFICATION_CREATE'
  }
}));

const researcherController = require('../../src/controllers/researcherController');
const { ResearcherProfile, AcademicHistory, Certification } = require('../../src/database/models');

describe('Researcher Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1, role: 'researcher' }, body: {}, params: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });

  it('updates researcher profile with trimmed values', async () => {
    req.body = { title: '  Senior Researcher  ', expertise: '  AI  ' };

    const mockProfile = {
      id: 7,
      toJSON: jest.fn().mockReturnValue({ title: 'Senior Researcher', expertise: 'AI' }),
      update: jest.fn().mockResolvedValue(true)
    };
    ResearcherProfile.findOne.mockResolvedValue(mockProfile);

    await researcherController.updateResearcherProfile(req, res);

    expect(mockProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Senior Researcher',
      expertise: 'AI'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('creates academic history with required fields', async () => {
    req.body = { degree: 'PhD', institution: 'MIT', field: 'CS', year: 2023 };
    AcademicHistory.create.mockResolvedValue({ id: 11, user_id: 1, ...req.body });

    await researcherController.createAcademicHistory(req, res);

    expect(AcademicHistory.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 1, degree: 'PhD' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('creates certification with required fields', async () => {
    req.body = { name: 'CITI', issuer: 'NIH', year: 2022 };
    Certification.create.mockResolvedValue({ id: 12, user_id: 1, ...req.body });

    await researcherController.createCertification(req, res);

    expect(Certification.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 1, name: 'CITI', issuer: 'NIH' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
