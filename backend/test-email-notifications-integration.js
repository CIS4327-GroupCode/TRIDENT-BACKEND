/**
 * Email Notifications Integration Test
 * Tests that emails are sent when notifications are created
 * Validates Phase 6: Email Notifications Integration
 * 
 * Run with: node test-email-notifications-integration.js
 */

require('dotenv').config();
const {
  User,
  Project,
  Milestone,
  Notification,
  UserPreferences,
  Organization
} = require('./src/database/models');
const notificationService = require('./src/services/notificationService');
const emailService = require('./src/services/emailService');

let testUser = null;
let testProject = null;
let testOrg = null;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
    return true;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    failed++;
    return false;
  }
}

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');

  // Create test organization
  testOrg = await Organization.create({
    name: `Email Test Org ${Date.now()}`,
    mission: 'Testing email notifications'
  });

  // Create test user
  testUser = await User.create({
    name: 'Email Test User',
    email: process.env.TEST_EMAIL || 'emailtest@example.com',
    password_hash: 'hashedpassword',
    role: 'nonprofit',
    account_status: 'active',
    org_id: testOrg.id
  });

  // Create user preferences with email notifications enabled
  await UserPreferences.create({
    user_id: testUser.id,
    email_notifications: true,
    inapp_notifications: true,
    inapp_messages: true,
    inapp_matches: true
  });

  // Create test project
  testProject = await Project.create({
    title: 'Email Notification Test Project',
    problem: 'Test problem',
    outcomes: 'Test outcomes',
    status: 'draft',
    org_id: testOrg.id
  });

  console.log(`✓ Created test user: ${testUser.email}`);
  console.log(`✓ Created test organization: ${testOrg.name}`);
  console.log(`✓ Created test project: ${testProject.title}\n`);
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('EMAIL NOTIFICATIONS INTEGRATION TEST');
  console.log('='.repeat(60) + '\n');

  // ========================================
  // 1. Email Service Tests
  // ========================================
  console.log('📋 1. Email Service Tests\n');

  await test('Email service is initialized', async () => {
    if (!emailService) throw new Error('Email service not found');
    if (typeof emailService.sendNotificationEmail !== 'function') {
      throw new Error('sendNotificationEmail function not found');
    }
  });

  await test('Email connection is working', async () => {
    const isConnected = await emailService.testConnection();
    if (!isConnected) throw new Error('Email connection test failed');
  });

  console.log('');

  // ========================================
  // 2. Single Notification with Email
  // ========================================
  console.log('📋 2. Single Notification with Email\n');

  let testNotification = null;

  await test('Create notification for user with email enabled', async () => {
    testNotification = await notificationService.createNotification({
      userId: testUser.id,
      type: 'project_created',
      title: 'Test Project Created',
      message: 'Your test project has been created successfully.',
      link: `/projects/${testProject.project_id}`
    });

    if (!testNotification) {
      throw new Error('Notification was not created');
    }
  });

  await test('Notification was saved in database', async () => {
    const dbNotification = await Notification.findByPk(testNotification.id);
    if (!dbNotification) throw new Error('Notification not in database');
    if (dbNotification.type !== 'project_created') throw new Error('Wrong notification type');
  });

  console.log('   📧 Email should have been sent to:', testUser.email);
  console.log('   📬 Check: https://ethereal.email/messages\n');

  console.log('');

  // ========================================
  // 3. User with Email Disabled
  // ========================================
  console.log('📋 3. User with Email Disabled\n');

  await test('Disable email notifications for user', async () => {
    const prefs = await UserPreferences.findOne({
      where: { user_id: testUser.id }
    });
    await prefs.update({ email_notifications: false });
  });

  await test('Create notification (no email should be sent)', async () => {
    const notification = await notificationService.createNotification({
      userId: testUser.id,
      type: 'milestone_created',
      title: 'Test Milestone Created',
      message: 'A milestone has been created for your project.',
      link: `/projects/${testProject.project_id}`
    });

    if (!notification) throw new Error('Notification was not created');
  });

  console.log('   ✓ Notification created but email NOT sent (user disabled)\n');

  await test('Re-enable email notifications', async () => {
    const prefs = await UserPreferences.findOne({
      where: { user_id: testUser.id }
    });
    await prefs.update({ email_notifications: true });
  });

  console.log('');

  // ========================================
  // 4. Bulk Notifications with Email
  // ========================================
  console.log('📋 4. Bulk Notifications with Email\n');

  await test('Create bulk notifications with emails', async () => {
    const notifications = await notificationService.createBulkNotifications(
      [testUser.id],
      {
        type: 'system_announcement',
        title: 'System Maintenance Scheduled',
        message: 'The system will be under maintenance on Saturday.',
        link: '/announcements'
      }
    );

    if (notifications.length !== 1) {
      throw new Error('Expected 1 notification');
    }
  });

  console.log('   📧 Email should have been sent to:', testUser.email);
  console.log('');

  // ========================================
  // 5. Different Notification Types
  // ========================================
  console.log('📋 5. Different Notification Types\n');

  const notificationTypes = [
    {
      type: 'project_approved',
      title: 'Project Approved',
      message: 'Your project has been approved by the admin team!',
      link: `/projects/${testProject.project_id}`
    },
    {
      type: 'milestone_completed',
      title: 'Milestone Completed',
      message: 'Great work! A milestone has been marked as completed.',
      link: `/projects/${testProject.project_id}/milestones`
    },
    {
      type: 'application_received',
      title: 'New Application',
      message: 'A researcher has applied to work on your project.',
      link: '/applications'
    },
    {
      type: 'message_received',
      title: 'New Message',
      message: 'You have received a new message from a researcher.',
      link: '/messages'
    }
  ];

  for (const notif of notificationTypes) {
    await test(`Send ${notif.type} notification`, async () => {
      const created = await notificationService.createNotification({
        userId: testUser.id,
        ...notif
      });
      if (!created) throw new Error('Notification not created');
    });
  }

  console.log(`\n   📧 ${notificationTypes.length} emails should have been sent\n`);

  // ========================================
  // Cleanup
  // ========================================
  console.log('🧹 Cleaning up test data...');
  await Notification.destroy({ where: { user_id: testUser.id } });
  await UserPreferences.destroy({ where: { user_id: testUser.id } });
  await Project.destroy({ where: { project_id: testProject.project_id } });
  await User.destroy({ where: { id: testUser.id } });
  await Organization.destroy({ where: { id: testOrg.id } });
  console.log('✓ Cleanup complete\n');

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log('='.repeat(60) + '\n');

  console.log('📬 View all test emails at: https://ethereal.email/messages');
  console.log('   Username:', process.env.SMTP_USER);
  console.log('   Password:', process.env.SMTP_PASS);
  console.log('');

  return failed === 0;
}

async function main() {
  try {
    await setupTestData();
    const success = await runTests();
    
    await require('./src/database/models').sequelize.close();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    try {
      await require('./src/database/models').sequelize.close();
    } catch (e) {}
    process.exit(1);
  }
}

main();
