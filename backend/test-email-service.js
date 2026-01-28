/**
 * Test Email Service
 * Sends test emails to verify configuration
 * 
 * Usage:
 *   node test-email-service.js
 */
require('dotenv').config();
const emailService = require('./src/services/emailService');


async function testEmailService() {
  console.log('📧 Testing Email Service\n');

  try {
    // Test 1: Verify connection
    console.log('1️⃣ Testing SMTP connection...');
    const isConnected = await emailService.testConnection();
    
    if (!isConnected) {
      console.error('❌ Connection test failed. Please check your SMTP configuration in .env');
      console.log('error log:', isConnected);
      process.exit(1);
    }
    console.log('');

    // Test 2: Send verification email
    console.log('2️⃣ Sending verification email...');
    const verifyResult = await emailService.sendVerificationEmail(
      'test@example.com',
      'Test User',
      'test-verification-token-123'
    );
    console.log(`✅ Verification email sent - Message ID: ${verifyResult.messageId}`);
    console.log(`   Preview URL: ${nodemailer.getTestMessageUrl(verifyResult)}`);
    console.log('');

    // Test 3: Send password reset email
    console.log('3️⃣ Sending password reset email...');
    const resetResult = await emailService.sendPasswordResetEmail(
      'test@example.com',
      'Test User',
      'test-reset-token-456'
    );
    console.log(`✅ Password reset email sent - Message ID: ${resetResult.messageId}`);
    console.log(`   Preview URL: ${nodemailer.getTestMessageUrl(resetResult)}`);
    console.log('');

    // Test 4: Send notification email
    console.log('4️⃣ Sending notification email...');
    const notificationResult = await emailService.sendNotificationEmail(
      'test@example.com',
      'Test User',
      {
        type: 'project_created',
        title: 'New Project Created',
        message: 'Your project "Test Project" has been created successfully.',
        link: '/projects/123'
      }
    );
    console.log(`✅ Notification email sent - Message ID: ${notificationResult.messageId}`);
    console.log(`   Preview URL: ${nodemailer.getTestMessageUrl(notificationResult)}`);
    console.log('');

    // Test 5: Send weekly digest
    console.log('5️⃣ Sending weekly digest email...');
    const digestResult = await emailService.sendWeeklyDigest(
      'test@example.com',
      'Test User',
      {
        newMessages: 5,
        newMatches: 3,
        upcomingMilestones: 2,
        projectUpdates: 7
      }
    );
    console.log(`✅ Weekly digest sent - Message ID: ${digestResult.messageId}`);
    console.log(`   Preview URL: ${nodemailer.getTestMessageUrl(digestResult)}`);
    console.log('');

    console.log('🎉 All email tests passed!\n');
    console.log('📬 View all test emails at: https://ethereal.email/messages\n');

  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.log('\nFull error:', error);
    process.exit(1);
  }
}

// Import nodemailer for preview URLs
const nodemailer = require('nodemailer');

testEmailService();
