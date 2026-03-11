jest.mock('../../src/database/models', () => ({
  User: {
    sequelize: {
      transaction: jest.fn()
    },
    create: jest.fn()
  },
  Organization: {
    create: jest.fn()
  },
  ResearcherProfile: {
    create: jest.fn()
  }
}));

const { User, Organization, ResearcherProfile } = require('../../src/database/models');
const authModel = require('../../src/models/authModel');

describe('authModel.createUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links nonprofit users to the created organization via org_id', async () => {
    const transaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };

    User.sequelize.transaction.mockResolvedValue(transaction);

    const save = jest.fn().mockResolvedValue(undefined);
    User.create.mockResolvedValue({
      id: 11,
      name: 'Org Owner',
      email: 'owner@example.com',
      role: 'nonprofit',
      org_id: null,
      created_at: new Date('2026-01-01'),
      save
    });

    Organization.create.mockResolvedValue({ id: 44 });

    const result = await authModel.createUser(
      'Org Owner',
      'owner@example.com',
      'hashed',
      'nonprofit',
      false,
      {
        name: 'Data For Good',
        mission: 'Help communities',
        focus_tags: ['education']
      },
      null
    );

    expect(Organization.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Data For Good',
      user_id: 11,
      focus_areas: ['education']
    }), { transaction });
    expect(save).toHaveBeenCalledWith({ transaction });
    expect(transaction.commit).toHaveBeenCalled();
    expect(result.org_id).toBe(44);
  });

  it('creates researcher profile when researcherData is provided', async () => {
    const transaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };

    User.sequelize.transaction.mockResolvedValue(transaction);

    User.create.mockResolvedValue({
      id: 21,
      name: 'Research User',
      email: 'research@example.com',
      role: 'researcher',
      org_id: null,
      created_at: new Date('2026-01-01')
    });

    await authModel.createUser(
      'Research User',
      'research@example.com',
      'hashed',
      'researcher',
      false,
      null,
      {
        affiliation: 'University X',
        domains: ['health']
      }
    );

    expect(ResearcherProfile.create).toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalled();
  });
});
