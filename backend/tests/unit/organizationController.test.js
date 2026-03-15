/**
 * Unit Tests for Organization Controller
 */

jest.mock('../../src/database/models', () => ({
  Organization: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  User: {
    update: jest.fn()
  }
}));

jest.mock('../../src/utils/auditLogger', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE' }
}));

const organizationController = require('../../src/controllers/organizationController');
const { Organization, User } = require('../../src/database/models');

describe('Organization Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1, role: 'nonprofit' }, body: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });

  it('accepts extended allowlist fields', async () => {
    req.body = {
      name: 'Org Name',
      website: 'https://example.org',
      location: 'Madrid',
      team_size: 15,
      established_year: 2010,
      type: 'Foundation'
    };

    const mockOrg = { id: 10, update: jest.fn().mockResolvedValue(true) };
    Organization.findOne.mockResolvedValue(mockOrg);

    await organizationController.updateOrganization(req, res);

    expect(mockOrg.update).toHaveBeenCalledWith(expect.objectContaining({
      website: 'https://example.org',
      location: 'Madrid',
      team_size: 15,
      established_year: 2010,
      type: 'Foundation'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects invalid website format', async () => {
    req.body = { website: 'notaurl' };

    await organizationController.updateOrganization(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Website must be a valid http(s) URL' });
  });

  it('creates organization and links user when missing', async () => {
    req.body = { name: 'New Org', website: 'https://new.org' };
    Organization.findOne.mockResolvedValue(null);
    Organization.create.mockResolvedValue({ id: 25, user_id: 1, name: 'New Org' });

    await organizationController.updateOrganization(req, res);

    expect(Organization.create).toHaveBeenCalled();
    expect(User.update).toHaveBeenCalledWith({ org_id: 25 }, { where: { id: 1 } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
