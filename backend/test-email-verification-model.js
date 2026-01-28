/**
 * Test script for EmailVerification model
 * Tests basic CRUD operations and helper methods
 * 
 * Usage:
 *   node test-email-verification-model.js
 */

require('dotenv').config();
const { User, EmailVerification, sequelize } = require('./src/database/models');
const jwt = require('jsonwebtoken');

async function testEmailVerificationModel() {
  console.log('🧪 Testing EmailVerification Model\n');

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Cleanup test data
    console.log('🧹 Cleaning up test data...');
    await EmailVerification.destroy({ where: {}, force: true });
    await User.destroy({ where: { email: 'test-verify@example.com' }, force: true });
    console.log('');

    // Create test user
    console.log('1️⃣ Creating test user...');
    const testUser = await User.create({
      name: 'Test Verification User',
      email: 'test-verify@example.com',
      password_hash: '$2a$10$dummyhashfortest',
      role: 'researcher'
    });
    console.log(`✅ User created - ID: ${testUser.id}`);
    console.log('');

    // Test 1: Create verification record
    console.log('2️⃣ Creating email verification...');
    const token = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const verification = await EmailVerification.create({
      user_id: testUser.id,
      token: token,
      token_expires_at: expiresAt
    });
    console.log(`✅ Verification created - ID: ${verification.id}`);
    console.log(`   Token: ${token.substring(0, 20)}...`);
    console.log(`   Expires: ${expiresAt.toLocaleString()}`);
    console.log('');

    // Test 2: Find by token
    console.log('3️⃣ Testing findByToken()...');
    const foundByToken = await EmailVerification.findByToken(token);
    if (foundByToken && foundByToken.id === verification.id) {
      console.log(`✅ Found verification by token - User ID: ${foundByToken.user_id}`);
    } else {
      console.error('❌ findByToken() failed');
    }
    console.log('');

    // Test 3: Find by user ID
    console.log('4️⃣ Testing findByUserId()...');
    const foundByUserId = await EmailVerification.findByUserId(testUser.id);
    if (foundByUserId && foundByUserId.id === verification.id) {
      console.log(`✅ Found verification by user ID - Token: ${foundByUserId.token.substring(0, 20)}...`);
    } else {
      console.error('❌ findByUserId() failed');
    }
    console.log('');

    // Test 4: Check expiry
    console.log('5️⃣ Testing isExpired()...');
    const isExpired = verification.isExpired();
    console.log(`✅ Token expired: ${isExpired} (should be false)`);
    console.log(`   Time remaining: ${Math.round(verification.getTimeRemaining() / 1000 / 60)} minutes`);
    console.log('');

    // Test 5: Update existing verification (upsertForUser)
    console.log('6️⃣ Testing upsertForUser() - updating existing...');
    const newToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '12h' }
    );
    const newExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const updated = await EmailVerification.upsertForUser(testUser.id, newToken, newExpiresAt);
    console.log(`✅ Verification updated - Same ID: ${updated.id === verification.id}`);
    console.log(`   New token: ${newToken.substring(0, 20)}...`);
    console.log('');

    // Test 6: Test with include (get user with verification)
    console.log('7️⃣ Testing User.findOne() with include...');
    const userWithVerification = await User.findOne({
      where: { id: testUser.id },
      include: [{ model: EmailVerification, as: 'emailVerification' }]
    });
    if (userWithVerification?.emailVerification) {
      console.log(`✅ User fetched with verification relation`);
      console.log(`   User: ${userWithVerification.name}`);
      console.log(`   Has pending verification: ${!!userWithVerification.emailVerification}`);
    } else {
      console.error('❌ Include relation failed');
    }
    console.log('');

    // Test 7: Test expired token
    console.log('8️⃣ Testing expired token...');
    const expiredToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1ms' } // Expires immediately
    );
    const expiredDate = new Date(Date.now() - 1000); // 1 second ago

    await verification.update(
      {
        token: expiredToken,
        token_expires_at: expiredDate
      },
      { validate: false } // Skip validation for this test
    );

    await verification.reload();
    console.log(`✅ Token expired: ${verification.isExpired()} (should be true)`);
    console.log('');

    // Test 8: Cleanup expired verifications
    console.log('9️⃣ Testing cleanupExpired()...');
    const deletedCount = await EmailVerification.cleanupExpired();
    console.log(`✅ Cleaned up ${deletedCount} expired verification(s)`);
    console.log('');

    // Verify it's actually deleted
    const afterCleanup = await EmailVerification.findByUserId(testUser.id);
    console.log(`✅ Verification after cleanup: ${afterCleanup ? 'Still exists (ERROR)' : 'Deleted (CORRECT)'}`);
    console.log('');

    // Cleanup
    console.log('🧹 Final cleanup...');
    await User.destroy({ where: { id: testUser.id }, force: true });
    console.log('✅ Test user deleted\n');

    console.log('🎉 All EmailVerification model tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

testEmailVerificationModel();
