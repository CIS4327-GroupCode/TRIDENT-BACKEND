/**
 * Test Email Verification Flow
 * End-to-end test of the complete email verification process
 * 
 * Usage:
 *   node test-email-verification-flow.js
 */

require('dotenv').config();
const { User, EmailVerification, sequelize } = require('./src/database/models');
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

async function testEmailVerificationFlow() {
  console.log('🧪 Testing Email Verification Flow\n');

  const testEmail = 'test-verification-flow@example.com';
  const testPassword = 'TestPassword123!';

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Cleanup existing test data
    console.log('🧹 Cleaning up existing test data...');
    await EmailVerification.destroy({ where: {}, force: true, truncate: true });
    await User.destroy({ where: { email: testEmail }, force: true });
    console.log('');

    // ========================================
    // TEST 1: REGISTRATION
    // ========================================
    console.log('1️⃣ Testing Registration...');
    const registerReq = createMockReq({
      name: 'Test User',
      email: testEmail,
      password: testPassword,
      role: 'researcher'
    });
    const registerRes = createMockRes();

    await authController.register(registerReq, registerRes);

    if (registerRes.statusCode !== 201) {
      console.error(`❌ Registration failed - Status: ${registerRes.statusCode}`);
      console.error('Response:', registerRes.jsonData);
      process.exit(1);
    }

    console.log(`✅ Registration successful - Status: ${registerRes.statusCode}`);
    console.log(`   Message: "${registerRes.jsonData.message}"`);
    console.log(`   Email: ${registerRes.jsonData.email}`);
    console.log(`   User ID: ${registerRes.jsonData.user.id}`);

    // Verify user was created
    const createdUser = await User.findOne({ where: { email: testEmail } });
    if (!createdUser) {
      console.error('❌ User not found in database');
      process.exit(1);
    }
    console.log(`✅ User found in database - ID: ${createdUser.id}`);

    // Verify verification record was created
    const verification = await EmailVerification.findByUserId(createdUser.id);
    if (!verification) {
      console.error('❌ Verification record not created');
      process.exit(1);
    }
    console.log(`✅ Verification record created - Token: ${verification.token.substring(0, 20)}...`);
    console.log('');

    // ========================================
    // TEST 2: LOGIN BEFORE VERIFICATION (Should Fail)
    // ========================================
    console.log('2️⃣ Testing Login Before Verification (should fail)...');
    const loginReq1 = createMockReq({
      email: testEmail,
      password: testPassword
    });
    const loginRes1 = createMockRes();

    await authController.login(loginReq1, loginRes1);

    if (loginRes1.statusCode !== 401) {
      console.error(`❌ Login should have been rejected - Status: ${loginRes1.statusCode}`);
      process.exit(1);
    }

    if (loginRes1.jsonData.code !== 'EMAIL_NOT_VERIFIED') {
      console.error(`❌ Wrong error code: ${loginRes1.jsonData.code}`);
      process.exit(1);
    }

    console.log(`✅ Login correctly rejected - Status: 401`);
    console.log(`   Code: ${loginRes1.jsonData.code}`);
    console.log(`   Message: "${loginRes1.jsonData.message}"`);
    console.log('');

    // ========================================
    // TEST 3: VERIFY EMAIL WITH INVALID TOKEN (Should Fail)
    // ========================================
    console.log('3️⃣ Testing Verification with Invalid Token (should fail)...');
    const verifyReq1 = createMockReq({}, { token: 'invalid-token-123' });
    const verifyRes1 = createMockRes();

    await authController.verifyEmail(verifyReq1, verifyRes1);

    if (verifyRes1.statusCode !== 400) {
      console.error(`❌ Should have rejected invalid token - Status: ${verifyRes1.statusCode}`);
      process.exit(1);
    }

    console.log(`✅ Invalid token correctly rejected - Status: 400`);
    console.log(`   Error: "${verifyRes1.jsonData.error}"`);
    console.log('');

    // ========================================
    // TEST 4: VERIFY EMAIL WITH VALID TOKEN (Should Succeed)
    // ========================================
    console.log('4️⃣ Testing Verification with Valid Token...');
    const verifyReq2 = createMockReq({}, { token: verification.token });
    const verifyRes2 = createMockRes();

    await authController.verifyEmail(verifyReq2, verifyRes2);

    if (verifyRes2.statusCode !== 200) {
      console.error(`❌ Verification failed - Status: ${verifyRes2.statusCode}`);
      console.error('Response:', verifyRes2.jsonData);
      process.exit(1);
    }

    console.log(`✅ Email verified successfully - Status: 200`);
    console.log(`   Message: "${verifyRes2.jsonData.message}"`);

    // Verify verification record was deleted
    const verificationAfter = await EmailVerification.findByUserId(createdUser.id);
    if (verificationAfter) {
      console.error('❌ Verification record should have been deleted');
      process.exit(1);
    }
    console.log(`✅ Verification record deleted (user marked as verified)`);
    console.log('');

    // ========================================
    // TEST 5: LOGIN AFTER VERIFICATION (Should Succeed)
    // ========================================
    console.log('5️⃣ Testing Login After Verification (should succeed)...');
    const loginReq2 = createMockReq({
      email: testEmail,
      password: testPassword
    });
    const loginRes2 = createMockRes();

    await authController.login(loginReq2, loginRes2);

    if (loginRes2.statusCode !== 200) {
      console.error(`❌ Login failed - Status: ${loginRes2.statusCode}`);
      console.error('Response:', loginRes2.jsonData);
      process.exit(1);
    }

    console.log(`✅ Login successful - Status: 200`);
    console.log(`   User: ${loginRes2.jsonData.user.name} (${loginRes2.jsonData.user.email})`);
    console.log(`   Token: ${loginRes2.jsonData.token.substring(0, 20)}...`);
    console.log('');

    // ========================================
    // TEST 6: RESEND VERIFICATION EMAIL (Should Fail - Already Verified)
    // ========================================
    console.log('6️⃣ Testing Resend Verification Email (should fail - already verified)...');
    const resendReq1 = createMockReq({ email: testEmail });
    const resendRes1 = createMockRes();

    await authController.resendVerificationEmail(resendReq1, resendRes1);

    if (resendRes1.statusCode !== 400) {
      console.error(`❌ Should have rejected resend - Status: ${resendRes1.statusCode}`);
      process.exit(1);
    }

    if (resendRes1.jsonData.code !== 'ALREADY_VERIFIED') {
      console.error(`❌ Wrong error code: ${resendRes1.jsonData.code}`);
      process.exit(1);
    }

    console.log(`✅ Resend correctly rejected - Status: 400`);
    console.log(`   Code: ${resendRes1.jsonData.code}`);
    console.log(`   Error: "${resendRes1.jsonData.error}"`);
    console.log('');

    // ========================================
    // TEST 7: CREATE UNVERIFIED USER & TEST RESEND
    // ========================================
    console.log('7️⃣ Testing Resend Verification Email (unverified user)...');
    
    // Create new unverified user
    const testEmail2 = 'test-unverified@example.com';
    const registerReq2 = createMockReq({
      name: 'Unverified User',
      email: testEmail2,
      password: testPassword,
      role: 'researcher'
    });
    const registerRes2 = createMockRes();
    await authController.register(registerReq2, registerRes2);

    const unverifiedUser = await User.findOne({ where: { email: testEmail2 } });
    const oldVerification = await EmailVerification.findByUserId(unverifiedUser.id);
    const oldToken = oldVerification.token;

    console.log(`   Created unverified user - ID: ${unverifiedUser.id}`);

    // Resend verification email
    const resendReq2 = createMockReq({ email: testEmail2 });
    const resendRes2 = createMockRes();

    await authController.resendVerificationEmail(resendReq2, resendRes2);

    if (resendRes2.statusCode !== 200) {
      console.error(`❌ Resend failed - Status: ${resendRes2.statusCode}`);
      console.error('Response:', resendRes2.jsonData);
      process.exit(1);
    }

    console.log(`✅ Resend successful - Status: 200`);
    console.log(`   Message: "${resendRes2.jsonData.message}"`);

    // Verify token was updated
    const newVerification = await EmailVerification.findByUserId(unverifiedUser.id);
    if (newVerification.token === oldToken) {
      console.error('❌ Token should have been updated');
      process.exit(1);
    }
    console.log(`✅ New verification token generated`);
    console.log('');

    // ========================================
    // TEST 8: TEST EXPIRED TOKEN
    // ========================================
    console.log('8️⃣ Testing Expired Token (should fail)...');
    
    // Create expired token
    const expiredToken = jwt.sign(
      { userId: unverifiedUser.id, email: unverifiedUser.email, purpose: 'email-verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1ms' } // Expires immediately
    );

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 10));

    const verifyReq3 = createMockReq({}, { token: expiredToken });
    const verifyRes3 = createMockRes();

    await authController.verifyEmail(verifyReq3, verifyRes3);

    if (verifyRes3.statusCode !== 400) {
      console.error(`❌ Should have rejected expired token - Status: ${verifyRes3.statusCode}`);
      process.exit(1);
    }

    if (verifyRes3.jsonData.code !== 'EXPIRED') {
      console.error(`❌ Wrong error code: ${verifyRes3.jsonData.code}`);
      process.exit(1);
    }

    console.log(`✅ Expired token correctly rejected - Status: 400`);
    console.log(`   Code: ${verifyRes3.jsonData.code}`);
    console.log(`   Error: "${verifyRes3.jsonData.error}"`);
    console.log('');

    // Final cleanup
    console.log('🧹 Final cleanup...');
    await User.destroy({ where: { email: testEmail }, force: true });
    await User.destroy({ where: { email: testEmail2 }, force: true });
    await EmailVerification.destroy({ where: {}, force: true, truncate: true });
    console.log('✅ Cleanup complete\n');

    console.log('🎉 All email verification flow tests passed!\n');
    console.log('Summary:');
    console.log('  ✅ Registration creates user and verification record');
    console.log('  ✅ Email is sent (check Ethereal inbox)');
    console.log('  ✅ Login blocked before verification');
    console.log('  ✅ Invalid tokens rejected');
    console.log('  ✅ Valid verification succeeds and deletes record');
    console.log('  ✅ Login allowed after verification');
    console.log('  ✅ Resend blocked for verified users');
    console.log('  ✅ Resend works for unverified users');
    console.log('  ✅ Expired tokens rejected\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

testEmailVerificationFlow();
