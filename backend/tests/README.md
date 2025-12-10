/**
 * README for Test Suite
 * Documentation for running and maintaining tests
 */

# TRIDENT Match Portal - Test Suite

## Overview

**Last Updated**: December 2, 2025  
**Test Count**: 59 tests  
**Pass Rate**: 100%

This test suite provides comprehensive unit testing for the TRIDENT Match Portal backend. Tests are designed to be **database-independent** and use mocking to isolate business logic.

## Test Structure

```
tests/
├── setup.js                    # Global test configuration
├── jest.config.js              # Jest configuration
├── mocks/                      # Mock implementations
│   ├── auth.js                 # Authentication middleware mocks
│   └── models.js               # Sequelize model mocks
└── unit/                       # Unit tests
    ├── authController.test.js
    ├── auth.middleware.test.js
    └── userController.test.js
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- authController.test.js
```

### Run with Coverage
```bash
npm test -- --coverage
```

### Run in Watch Mode
```bash
npm test -- --watch
```

### Run Verbose Output
```bash
npm test -- --verbose
```

## Writing Tests

### Test File Naming Convention
- Unit tests: `*.test.js` in `tests/unit/`
- Place in same subdirectory structure as source

### Basic Test Template

```javascript
const controllerFunction = require('../../src/controllers/myController');
const { Model } = require('../../src/database/models');

// Mock dependencies
jest.mock('../../src/database/models');

describe('My Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = { body: {}, params: {}, user: { id: 1 } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('myFunction', () => {
    it('should do something successfully', async () => {
      Model.findOne.mockResolvedValue({ id: 1, name: 'Test' });
      
      await controllerFunction.myFunction(req, res);
      
      expect(Model.findOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));
    });

    it('should handle errors', async () => {
      Model.findOne.mockRejectedValue(new Error('DB Error'));
      
      await controllerFunction.myFunction(req, res);
      
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
```

## Mocking Guide

### Mocking Sequelize Models

```javascript
const { User } = require('../../src/database/models');

jest.mock('../../src/database/models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
}));

// In tests:
User.findByPk.mockResolvedValue({ id: 1, name: 'Test' });
```

### Mocking Authentication

```javascript
const { mockAuthenticate } = require('../mocks/auth');

// Use in controller tests
app.use(mockAuthenticate({ id: 1, role: 'admin' }));
```

### Mocking bcrypt

```javascript
const bcrypt = require('bcrypt');

jest.mock('bcrypt');

bcrypt.hash.mockResolvedValue('hashed_password');
bcrypt.compare.mockResolvedValue(true);
```

### Mocking JWT

```javascript
const jwt = require('jsonwebtoken');

jest.mock('jsonwebtoken');

jwt.sign.mockReturnValue('mock-token');
jwt.verify.mockReturnValue({ userId: 1, role: 'admin' });
```

## Test Coverage

### Current Coverage Goals
- Statements: 50%
- Branches: 50%
- Functions: 50%
- Lines: 50%

### View Coverage Report
```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

## Common Testing Patterns

### Testing Error Handling
```javascript
it('should handle database errors', async () => {
  Model.findOne.mockRejectedValue(new Error('DB Error'));
  
  await controller.function(req, res);
  
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
});
```

### Testing Validation
```javascript
it('should validate required fields', async () => {
  req.body = {}; // Missing required field
  
  await controller.function(req, res);
  
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ error: expect.any(String) })
  );
});
```

### Testing Authorization
```javascript
it('should deny access for unauthorized users', async () => {
  req.user = { id: 1, role: 'researcher' }; // Not admin
  
  await controller.adminOnlyFunction(req, res);
  
  expect(res.status).toHaveBeenCalledWith(403);
});
```

## Debugging Tests

### Enable Console Output
Remove or comment out console mocking in `setup.js`:
```javascript
// global.console = { ... };
```

### Use `fit()` and `fdescribe()`
Run only specific tests:
```javascript
fit('should test only this', () => {
  // This test runs alone
});

fdescribe('Focus on this suite', () => {
  // Only this suite runs
});
```

### Use `.only` and `.skip`
```javascript
describe.only('Run only this suite', () => {});
it.skip('Skip this test', () => {});
```

## Best Practices

✅ **DO:**
- Clear mocks in `beforeEach`
- Test one behavior per test
- Use descriptive test names
- Mock all external dependencies
- Test both success and error paths
- Test edge cases and boundary conditions

❌ **DON'T:**
- Rely on database state
- Share state between tests
- Test implementation details
- Use real HTTP requests
- Use real database connections
- Skip error handling tests

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Troubleshooting

### "Cannot find module" errors
- Ensure mock paths match actual file structure
- Check jest.config.js moduleNameMapper

### "Jest did not exit" warnings
- Close database connections in `afterAll`
- Clear timers and intervals

### "ReferenceError: module is not defined"
- Add mock before importing controller
- Use `jest.mock()` at top of file

### Tests pass locally but fail in CI
- Check environment variables
- Ensure consistent Node version
- Verify all dependencies in package.json

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest Cheat Sheet](https://github.com/sapegin/jest-cheat-sheet)

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure coverage meets minimum thresholds
3. Update this README if adding new patterns
4. Run full test suite before committing

## Support

For testing issues or questions:
1. Check existing test files for examples
2. Review TESTING_ISSUES_AND_FIXES.md
3. Ask team members
4. Create GitHub issue with `testing` label
