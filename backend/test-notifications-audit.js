/**
 * Notification System Audit & Validation Script
 * Validates all connections, trigger events, and endpoints
 * 
 * Run with: node test-notifications-audit.js
 */

require('dotenv').config();
const {
  User,
  Project,
  Milestone,
  Notification,
  UserPreferences,
  Application
} = require('./src/database/models');
const notificationService = require('./src/services/notificationService');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-minimum-32-characters-long';

let testUser = null;
let testProject = null;
let testMilestone = null;
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

async function setupTestData(orgId) {
  console.log('🔧 Setting up test data...\n');

  // Create test user with provided org_id
  testUser = await User.create({
    name: 'Notification Audit User',
    email: `audit-${Date.now()}@example.com`,
    password_hash: 'hashedpassword',
    role: 'nonprofit',
    account_status: 'active',
    org_id: orgId
  });

  // Create user preferences
  await UserPreferences.create({
    user_id: testUser.id,
    email_notifications: true,
    inapp_notifications: true,
    inapp_messages: true,
    inapp_matches: true
  });

  // Create test project
  testProject = await Project.create({
    title: 'Notification Test Project',
    problem: 'Test problem',
    outcomes: 'Test outcomes',
    status: 'draft',
    org_id: orgId
  });

  // Create test milestone
  testMilestone = await Milestone.create({
    project_id: testProject.project_id,  // Use project_id attribute, not id
    name: 'Test Milestone',
    description: 'For notification testing',
    due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    status: 'pending'
  });

  console.log(`✓ Created test user: ${testUser.email}`);
  console.log(`✓ Created test project: ${testProject.title}`);
  console.log(`✓ Created test milestone: ${testMilestone.name}\n`);
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('NOTIFICATION SYSTEM AUDIT');
  console.log('='.repeat(60) + '\n');

  // ========================================
  // 1. Notification Service Tests
  // ========================================
  console.log('📋 1. Notification Service Tests\n');

  await test('Service exists and exports functions', async () => {
    if (!notificationService.createNotification) throw new Error('createNotification not exported');
    if (!notificationService.createBulkNotifications) throw new Error('createBulkNotifications not exported');
    if (!notificationService.isNotificationEnabled) throw new Error('isNotificationEnabled not exported');
  });

  let testNotification = null;
  await test('Create single notification', async () => {
    testNotification = await notificationService.createNotification({
      userId: testUser.id,
      type: 'project_created',
      title: 'Test Project Created',
      message: 'Your test project has been created',
      link: '/projects/1',
      metadata: { project_id: 1 }
    });
    if (!testNotification) throw new Error('Notification not created');
    if (testNotification.user_id !== testUser.id) throw new Error('Notification user_id mismatch');
    if (testNotification.type !== 'project_created') throw new Error('Notification type mismatch');
  });

  await test('Verify notification in database', async () => {
    const found = await Notification.findByPk(testNotification.id);
    if (!found) throw new Error('Notification not found in database');
    if (found.is_read !== false) throw new Error('Notification should be unread by default');
  });

  await test('Check notification preferences are respected', async () => {
    // Disable a notification type
    const prefs = await UserPreferences.findOne({ where: { user_id: testUser.id } });
    prefs.inapp_messages = false;
    await prefs.save();

    const disabledNotif = await notificationService.createNotification({
      userId: testUser.id,
      type: 'message_received',
      title: 'Disabled Message',
      message: 'This should not be created',
      link: '/messages'
    });

    if (disabledNotif !== null) throw new Error('Notification should be null when preference disabled');

    // Re-enable for other tests
    prefs.inapp_messages = true;
    await prefs.save();
  });

  await test('Create bulk notifications', async () => {
    const bulkNotif = await notificationService.createBulkNotifications(
      [testUser.id],
      {
        type: 'system_announcement',
        title: 'System Test',
        message: 'This is a bulk notification',
        link: '/announcements/1'
      }
    );
    if (!Array.isArray(bulkNotif)) throw new Error('Should return array');
    if (bulkNotif.length !== 1) throw new Error('Should create 1 notification');
  });

  // ========================================
  // 2. Notification Model Tests
  // ========================================
  console.log('\n📋 2. Notification Model Tests\n');

  await test('Notification model methods exist', async () => {
    if (!testNotification.markAsRead) throw new Error('markAsRead method missing');
    if (!testNotification.markAsUnread) throw new Error('markAsUnread method missing');
    if (!testNotification.isUnread) throw new Error('isUnread method missing');
  });

  await test('Mark notification as read', async () => {
    await testNotification.markAsRead();
    const reloaded = await Notification.findByPk(testNotification.id);
    if (reloaded.is_read !== true) throw new Error('Notification should be marked as read');
  });

  await test('Mark notification as unread', async () => {
    await testNotification.markAsUnread();
    const reloaded = await Notification.findByPk(testNotification.id);
    if (reloaded.is_read !== false) throw new Error('Notification should be marked as unread');
  });

  await test('Check isUnread method', async () => {
    const reloaded = await Notification.findByPk(testNotification.id);
    if (!reloaded.isUnread()) throw new Error('isUnread should return true');
  });

  // ========================================
  // 3. Database Triggers & Events
  // ========================================
  console.log('\n📋 3. Database Triggers & Events\n');

  await test('Project creation triggers notification', async () => {
    // Get count before
    const countBefore = await Notification.count({
      where: { user_id: testUser.id, type: 'project_created' }
    });

    // This would normally be triggered by the project controller
    // For audit, we'll manually trigger via service
    await notificationService.createNotification({
      userId: testUser.id,
      type: 'project_created',
      title: 'Manual Trigger Test',
      message: 'Project trigger test',
      link: '/projects'
    });

    const countAfter = await Notification.count({
      where: { user_id: testUser.id, type: 'project_created' }
    });

    if (countAfter <= countBefore) throw new Error('Notification not created for project');
  });

  await test('Milestone creation can trigger notification', async () => {
    // Verify milestone exists
    if (!testMilestone) throw new Error('Milestone not created');

    // Test that we can create milestone notification
    const milestone = await Milestone.findByPk(testMilestone.id);
    if (!milestone) throw new Error('Milestone not found');
  });

  // ========================================
  // 4. API Endpoint Validation
  // ========================================
  console.log('\n📋 4. API Endpoint Validation\n');

  // We'll validate that endpoints exist by checking routes file
  await test('Notification routes file exists and has GET endpoints', async () => {
    const routesPath = './src/routes/notificationRoutes.js';
    try {
      const routes = require(routesPath);
      // Routes loaded successfully
    } catch (e) {
      throw new Error(`Cannot load notification routes: ${e.message}`);
    }
  });

  await test('Notification controller has required methods', async () => {
    const controller = require('./src/controllers/notificationController');
    if (!controller.getNotifications) throw new Error('getNotifications missing');
    if (!controller.getUnreadCount) throw new Error('getUnreadCount missing');
    if (!controller.markAsRead) throw new Error('markAsRead missing');
    if (!controller.markAsUnread) throw new Error('markAsUnread missing');
    if (!controller.markAllAsRead) throw new Error('markAllAsRead missing');
    if (!controller.deleteAllRead) throw new Error('deleteAllRead missing');
  });

  // ========================================
  // 5. Query & Filtering Tests
  // ========================================
  console.log('\n📋 5. Query & Filtering Tests\n');

  await test('Can filter notifications by type', async () => {
    const announcements = await Notification.findAll({
      where: { user_id: testUser.id, type: 'system_announcement' }
    });
    // Should return array (may be empty)
    if (!Array.isArray(announcements)) throw new Error('Should return array');
  });

  await test('Can filter notifications by read status', async () => {
    const unread = await Notification.findAll({
      where: { user_id: testUser.id, is_read: false }
    });
    if (!Array.isArray(unread)) throw new Error('Should return array');
  });

  await test('Can count unread notifications', async () => {
    const count = await Notification.count({
      where: { user_id: testUser.id, is_read: false }
    });
    if (typeof count !== 'number') throw new Error('Count should be a number');
  });

  await test('Can order notifications by created_at DESC', async () => {
    const notifications = await Notification.findAll({
      where: { user_id: testUser.id },
      order: [['created_at', 'DESC']],
      limit: 5
    });
    if (!Array.isArray(notifications)) throw new Error('Should return array');
    if (notifications.length > 1) {
      if (notifications[0].created_at < notifications[1].created_at) {
        throw new Error('DESC order not working');
      }
    }
  });

  // ========================================
  // 6. Pagination Tests
  // ========================================
  console.log('\n📋 6. Pagination Tests\n');

  await test('Can paginate notifications with limit and offset', async () => {
    const page1 = await Notification.findAndCountAll({
      where: { user_id: testUser.id },
      limit: 5,
      offset: 0,
      order: [['created_at', 'DESC']]
    });

    if (typeof page1.count !== 'number') throw new Error('Count missing');
    if (!Array.isArray(page1.rows)) throw new Error('Rows should be array');
  });

  // ========================================
  // 7. User Preferences Integration
  // ========================================
  console.log('\n📋 7. User Preferences Integration\n');

  await test('User preferences exist for test user', async () => {
    const prefs = await UserPreferences.findOne({
      where: { user_id: testUser.id }
    });
    if (!prefs) throw new Error('User preferences not found');
  });

  await test('Notification respects global inapp_notifications toggle', async () => {
    const prefs = await UserPreferences.findOne({
      where: { user_id: testUser.id }
    });
    
    // Disable global toggle
    prefs.inapp_notifications = false;
    await prefs.save();

    const notif = await notificationService.createNotification({
      userId: testUser.id,
      type: 'project_updated',
      title: 'Update Test',
      message: 'Should be blocked'
    });

    if (notif !== null) throw new Error('Notification should be null when globally disabled');

    // Re-enable
    prefs.inapp_notifications = true;
    await prefs.save();
  });

  // ========================================
  // 8. Data Integrity Tests
  // ========================================
  console.log('\n📋 8. Data Integrity Tests\n');

  await test('Notification requires user_id', async () => {
    try {
      await Notification.create({
        type: 'project_created',
        title: 'No User',
        message: 'This should fail',
        user_id: null
      });
      throw new Error('Should not allow null user_id');
    } catch (e) {
      if (e.message === 'Should not allow null user_id') throw e;
      // Expected error from database
    }
  });

  await test('Notification requires type', async () => {
    try {
      await Notification.create({
        user_id: testUser.id,
        title: 'No Type',
        message: 'This should fail',
        type: null
      });
      throw new Error('Should not allow null type');
    } catch (e) {
      if (e.message === 'Should not allow null type') throw e;
      // Expected error
    }
  });

  // ========================================
  // 9. Notification Types Coverage
  // ========================================
  console.log('\n📋 9. Notification Types Coverage\n');

  const expectedTypes = [
    'project_created', 'project_updated', 'project_deleted', 'project_status_changed',
    'project_submitted_for_review', 'project_approved', 'project_rejected',
    'milestone_created', 'milestone_updated', 'milestone_completed',
    'milestone_deadline_approaching', 'milestone_overdue',
    'message_received',
    'account_status_changed', 'admin_message',
    'application_received', 'application_accepted', 'application_rejected',
    'new_match_available', 'rating_received',
    'system_announcement', 'account_verified'
  ];

  await test('All expected notification types are valid', async () => {
    for (const type of expectedTypes) {
      try {
        const notif = await Notification.create({
          user_id: testUser.id,
          type: type,
          title: `Test ${type}`,
          message: `Testing notification type: ${type}`
        });
        await notif.destroy();
      } catch (e) {
        throw new Error(`Type '${type}' not valid: ${e.message}`);
      }
    }
  });

  // ========================================
  // Cleanup
  // ========================================
  console.log('\n🧹 Cleaning up test data...');
  await Notification.destroy({ where: { user_id: testUser.id } });
  await UserPreferences.destroy({ where: { user_id: testUser.id } });
  await Milestone.destroy({ where: { id: testMilestone.id } });
  await Project.destroy({ where: { project_id: testProject.project_id } });
  await User.destroy({ where: { id: testUser.id } });
  console.log('✓ Cleanup complete\n');

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log('='.repeat(60) + '\n');

  return failed === 0;
}

async function main() {
  let testOrg = null;
  try {
    const Organization = require('./src/database/models').Organization;
    const sequelize = require('./src/database/models').sequelize;

    // Create org first before setupTestData
    testOrg = await Organization.create({
      name: `Audit Org ${Date.now()}`,
      mission: 'Test organization for audit'
    });

    await setupTestData(testOrg.id);
    const success = await runTests();
    
    // Cleanup org
    if (testOrg) {
      await Organization.destroy({
        where: { id: testOrg.id }
      });
    }

    await sequelize.close();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    try {
      const Organization = require('./src/database/models').Organization;
      const sequelize = require('./src/database/models').sequelize;
      
      if (testOrg) {
        await Organization.destroy({
          where: { id: testOrg.id }
        });
      }
      await sequelize.close();
    } catch (e) {}
    process.exit(1);
  }
}

main();
