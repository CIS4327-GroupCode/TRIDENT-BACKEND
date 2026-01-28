/**
 * Test Password Reset Flow
 * End-to-end test of the complete password reset process
 * 
 * Usage:
 *   node test-password-reset-flow.js
 */

require('dotenv').config();
const { User, PasswordReset, EmailVerification, sequelize } = require('./src/database/models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('./src/services/emailService');

// Import controllers for testing
const authController = require('./src/controllers/authController');

// Mock request/response objects
const createMockReq = (body = {}, query = {}) => ({ body, query });
const createMockRes = () => {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
};

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-minimum-32-characters-long';

let testUserId = null;
let testEmail = 'reset-test@example.com';
let testPassword = 'OldPassword123!';
let newPassword = 'NewPassword456!';

async function setupTest() {
  console.log('\n🔧 Setting up test database...');
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Cleanup existing test data (safely - may not exist yet)
    console.log('🧹 Cleaning up existing test data...');
    try {
      await PasswordReset.destroy({ where: {}, force: true, truncate: true });
    } catch (e) {
      // Table may not exist yet, that's ok
    }
    try {
      await EmailVerification.destroy({ where: {}, force: true, truncate: true });
    } catch (e) {
      // Table may not exist yet, that's ok
    }
    await User.destroy({ where: { email: testEmail }, force: true });
    console.log('✅ Test data cleaned up\n');
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

async function cleanupTest() {
  console.log('\n🧹 Cleaning up test database...');
  try {
    await sequelize.close();
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('⚠️  Cleanup warning:', error.message);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Register user
  if (
    await test('Test 1: Register user with email', async () => {
      const req = createMockReq({
        email: testEmail,
        name: 'Password Reset Tester',
        password: testPassword,
        role: 'researcher'
      });
      const res = createMockRes();

      await authController.register(req, res);

      if (res.statusCode !== 201) {
        throw new Error(`Expected 201, got ${res.statusCode}. Response: ${JSON.stringify(res.jsonData)}`);
      }

      // Should NOT get a token (email verification required)
      if (res.jsonData.token) {
        throw new Error('Should not return token before email verification');
      }
      if (!res.jsonData.message || !res.jsonData.email) {
        throw new Error('Should return message and email for verification');
      }

      // Verify user was created
      const user = await User.findOne({ where: { email: testEmail } });
      if (!user) throw new Error('User not created');
      testUserId = user.id;
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 2: Verify email first (so we can test password reset)
  if (
    await test('Test 2: Verify email to enable login', async () => {
      // Get verification record
      const verification = await EmailVerification.findOne({
        where: { user_id: testUserId }
      });
      if (!verification) throw new Error('Verification record not found');

      const req = createMockReq({ token: verification.token });
      const res = createMockRes();

      await authController.verifyEmail(req, res);

      if (res.statusCode !== 200) {
        throw new Error(`Expected 200, got ${res.statusCode}: ${res.jsonData.message}`);
      }

      if (!res.jsonData.success) {
        throw new Error('Verify email failed');
      }

      // Verify record should be deleted (marking user as verified)
      const stillExists = await EmailVerification.findOne({
        where: { user_id: testUserId }
      });
      if (stillExists) throw new Error('Verification record should be deleted');
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 3: Login with old password (to confirm it works)
  if (
    await test('Test 3: Login with original password', async () => {
      const req = createMockReq({
        email: testEmail,
        password: testPassword
      });
      const res = createMockRes();

      await authController.login(req, res);

      if (res.statusCode !== 200) {
        throw new Error(`Expected 200, got ${res.statusCode}: ${res.jsonData.message}`);
      }

      if (!res.jsonData.token) throw new Error('Login should return token');
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 4: Request password reset
  let resetToken = null;
  if (
    await test('Test 4: Request password reset', async () => {
      const req = createMockReq({
        email: testEmail
      });
      const res = createMockRes();

      await authController.requestPasswordReset(req, res);

      if (res.statusCode !== 200) {
        throw new Error(`Expected 200, got ${res.statusCode}`);
      }

      if (!res.jsonData.message) {
        throw new Error('Should return success message');
      }

      // Get the reset record
      const resetRecord = await PasswordReset.findOne({
        where: { user_id: testUserId }
      });
      if (!resetRecord) throw new Error('Password reset record not created');

      resetToken = resetRecord.token;
      if (!resetToken) throw new Error('Reset token not generated');
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 5: Try to login with old password (should still work until reset is completed)
  if (
    await test('Test 5: Old password still works before reset', async () => {
      const req = createMockReq({
        email: testEmail,
        password: testPassword
      });
      const res = createMockRes();

      await authController.login(req, res);

      if (res.statusCode !== 200) {
        throw new Error('Should still be able to login with old password');
      }
      if (!res.jsonData.token) throw new Error('Should return token');
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 6: Reset password with valid token
  if (
    await test('Test 6: Reset password with valid token', async () => {
      if (!resetToken) throw new Error('Reset token not available');

      const req = createMockReq({
        token: resetToken,
        newPassword: newPassword
      });
      const res = createMockRes();

      await authController.resetPassword(req, res);

      if (res.statusCode !== 200) {
        throw new Error(`Expected 200, got ${res.statusCode}: ${res.jsonData.message}`);
      }

      if (!res.jsonData.success) {
        throw new Error('Password reset should succeed');
      }

      // Verify reset record is deleted (marking reset as used)
      const stillExists = await PasswordReset.findOne({
        where: { user_id: testUserId }
      });
      if (stillExists) throw new Error('Reset record should be deleted after use');
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 7: Try to login with old password (should fail)
  if (
    await test('Test 7: Old password no longer works after reset', async () => {
      const req = createMockReq({
        email: testEmail,
        password: testPassword
      });
      const res = createMockRes();

      await authController.login(req, res);

      if (res.statusCode === 200 && res.jsonData.token) {
        throw new Error('Should not be able to login with old password');
      }
      if (res.statusCode !== 401) {
        throw new Error(`Expected 401 unauthorized, got ${res.statusCode}`);
      }
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 8: Login with new password
  if (
    await test('Test 8: Login with new password after reset', async () => {
      const req = createMockReq({
        email: testEmail,
        password: newPassword
      });
      const res = createMockRes();

      await authController.login(req, res);

      if (res.statusCode !== 200) {
        throw new Error(`Expected 200, got ${res.statusCode}: ${res.jsonData.message}`);
      }

      if (!res.jsonData.token) throw new Error('Should be able to login with new password');

      // Verify token is valid
      const decoded = jwt.verify(res.jsonData.token, JWT_SECRET);
      if (decoded.user_id !== testUserId) throw new Error('Token has incorrect user_id');
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 9: Reset token is single-use (can't reuse)
  if (
    await test('Test 9: Reset token is single-use', async () => {
      if (!resetToken) throw new Error('Reset token not available');

      const req = createMockReq({
        token: resetToken,
        newPassword: 'AnotherPassword123!'
      });
      const res = createMockRes();

      await authController.resetPassword(req, res);

      if (res.statusCode === 200) {
        throw new Error('Should not be able to reuse reset token');
      }
      if (res.statusCode !== 401) {
        throw new Error(`Expected 401, got ${res.statusCode}`);
      }
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  // Test 10: Expired reset token is rejected
  if (
    await test('Test 10: Expired reset token is rejected', async () => {
      // Create user for this test
      const user = await User.create({
        email: 'expired-test@example.com',
        name: 'Expired Test User',
        password: await bcrypt.hash('TestPassword123!', 10),
        role: 'nonprofit'
      });

      // Create expired reset token
      const expiredJwt = jwt.sign(
        { user_id: user.id, purpose: 'password_reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Create record with past expiry time
      await PasswordReset.create(
        {
          user_id: user.id,
          token: expiredJwt,
          token_expires_at: new Date(Date.now() - 1000) // 1 second in the past
        },
        { validate: false } // Skip validation for test
      );

      // Try to use expired token
      const req = createMockReq({
        token: expiredJwt,
        newPassword: 'NewPassword123!'
      });
      const res = createMockRes();

      await authController.resetPassword(req, res);

      if (res.statusCode === 200) {
        throw new Error('Should reject expired reset token');
      }
      if (res.statusCode !== 401) {
        throw new Error(`Expected 401, got ${res.statusCode}`);
      }
    })
  ) {
    passed++;
  } else {
    failed++;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log(`${'='.repeat(50)}\n`);

  return failed === 0;
}

async function main() {
  try {
    await setupTest();
    const success = await runTests();
    await cleanupTest();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error.message);
    await cleanupTest();
    process.exit(1);
  }
}

main();
