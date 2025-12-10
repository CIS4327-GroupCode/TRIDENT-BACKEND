/**
 * Mock Sequelize Models
 * Use for unit testing without database dependencies
 */

/**
 * Create a mock Sequelize model with common methods
 */
const createMockModel = (modelName, defaultData = {}) => {
  const mockData = { ...defaultData };

  return {
    // Query methods
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    count: jest.fn(),
    
    // Create/Update/Delete methods
    create: jest.fn(),
    bulkCreate: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    restore: jest.fn(),
    
    // Instance methods
    save: jest.fn(),
    reload: jest.fn(),
    toJSON: jest.fn(() => mockData),
    
    // Model info
    name: modelName,
    tableName: modelName.toLowerCase(),
    
    // Sequelize instance mock
    sequelize: {
      transaction: jest.fn(() => ({
        commit: jest.fn(),
        rollback: jest.fn()
      })),
      query: jest.fn(),
      Op: {
        or: Symbol('or'),
        and: Symbol('and'),
        gt: Symbol('gt'),
        gte: Symbol('gte'),
        lt: Symbol('lt'),
        lte: Symbol('lte'),
        like: Symbol('like'),
        iLike: Symbol('iLike'),
        in: Symbol('in'),
        notIn: Symbol('notIn')
      }
    }
  };
};

/**
 * Mock User model
 */
const mockUserModel = () => createMockModel('User', {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  role: 'researcher',
  account_status: 'active',
  mfa_enabled: false,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null
});

/**
 * Mock Organization model
 */
const mockOrganizationModel = () => createMockModel('Organization', {
  id: 1,
  name: 'Test Organization',
  EIN: '12-3456789',
  mission: 'Test mission',
  focus_tags: 'Education, Technology',
  compliance_flags: 'HIPAA',
  contacts: 'contact@test.org'
});

/**
 * Mock Project model
 */
const mockProjectModel = () => createMockModel('Project', {
  project_id: 1,
  title: 'Test Project',
  problem: 'Test problem',
  outcomes: 'Test outcomes',
  methods_required: 'Statistical Analysis',
  timeline: '6 months',
  budget_min: 10000,
  data_sensitivity: 'Medium',
  status: 'open',
  org_id: 1,
  created_at: new Date(),
  updated_at: new Date()
});

/**
 * Mock Milestone model
 */
const mockMilestoneModel = () => createMockModel('Milestone', {
  id: 1,
  project_id: 1,
  name: 'Test Milestone',
  description: 'Test description',
  due_date: new Date(),
  status: 'pending',
  completed_at: null
});

/**
 * Mock ResearcherProfile model
 */
const mockResearcherProfileModel = () => createMockModel('ResearcherProfile', {
  id: 1,
  user_id: 1,
  affiliation: 'Test University',
  domains: 'Machine Learning, Statistics',
  methods: 'Quantitative Research',
  tools: 'Python, R',
  rate_min: 50,
  rate_max: 150,
  availability: '20 hours/week'
});

/**
 * Mock UserPreferences model
 */
const mockUserPreferencesModel = () => createMockModel('UserPreferences', {
  id: 1,
  user_id: 1,
  email_notifications: true,
  email_messages: true,
  email_matches: true,
  email_milestones: true,
  email_project_updates: true,
  inapp_notifications: true,
  inapp_messages: true,
  inapp_matches: true,
  weekly_digest: false,
  monthly_report: false,
  marketing_emails: false
});

/**
 * Mock ProjectReview model
 */
const mockProjectReviewModel = () => createMockModel('ProjectReview', {
  id: 1,
  project_id: 1,
  reviewer_id: 2,
  action: 'approved',
  previous_status: 'pending_review',
  new_status: 'approved',
  feedback: 'Looks good',
  changes_requested: null,
  reviewed_at: new Date()
});

/**
 * Create mock Sequelize instance with transaction support
 */
const createMockSequelize = () => ({
  transaction: jest.fn(async (callback) => {
    const transaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }),
  query: jest.fn(),
  Op: {
    or: Symbol('or'),
    and: Symbol('and'),
    gt: Symbol('gt'),
    gte: Symbol('gte'),
    lt: Symbol('lt'),
    lte: Symbol('lte'),
    like: Symbol('like'),
    iLike: Symbol('iLike'),
    in: Symbol('in'),
    notIn: Symbol('notIn')
  }
});

module.exports = {
  createMockModel,
  mockUserModel,
  mockOrganizationModel,
  mockProjectModel,
  mockMilestoneModel,
  mockResearcherProfileModel,
  mockUserPreferencesModel,
  mockProjectReviewModel,
  createMockSequelize
};
