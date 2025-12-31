/**
 * Manual Test Script for Notification System
 * 
 * This script creates test notifications in the database to verify the frontend UI works.
 * 
 * Run this with: node create-test-notifications.js
 */

require('dotenv').config();
const { Notification, User } = require('./src/database/models');

async function createTestNotifications() {
  try {
    console.log('🔍 Finding test user...');
    
    // Find a user to create notifications for
    const user = await User.findOne({
      where: { role: 'nonprofit' },
      order: [['created_at', 'DESC']]
    });

    if (!user) {
      console.log('❌ No users found in database');
      console.log('Please create a user first by signing up through the frontend');
      process.exit(1);
    }

    console.log(`✓ Found user: ${user.name} (${user.email})`);
    console.log('');

    // Create test notifications
    const testNotifications = [
      {
        user_id: user.id,
        type: 'project_created',
        title: 'Project Created Successfully',
        message: 'Your project "Climate Data Analysis" has been created and is now visible to researchers.',
        link: '/projects/1',
        metadata: { project_id: 1, project_title: 'Climate Data Analysis' },
        is_read: false
      },
      {
        user_id: user.id,
        type: 'message_received',
        title: 'New Message',
        message: 'John Smith sent you a message about your project',
        link: '/messages',
        metadata: { sender_id: 2, sender_name: 'John Smith' },
        is_read: false
      },
      {
        user_id: user.id,
        type: 'milestone_deadline_approaching',
        title: 'Milestone Deadline Approaching',
        message: 'Milestone "Data Collection Phase" is due in 2 days',
        link: '/projects/1/milestones',
        metadata: { milestone_id: 5, project_id: 1, days_remaining: 2 },
        is_read: false
      },
      {
        user_id: user.id,
        type: 'project_approved',
        title: 'Project Approved',
        message: 'Great news! Your project "Ocean Microplastics Study" has been approved.',
        link: '/projects/2',
        metadata: { project_id: 2 },
        is_read: true // This one is already read
      },
      {
        user_id: user.id,
        type: 'system_announcement',
        title: 'Platform Maintenance',
        message: 'Scheduled maintenance will occur on Sunday at 2:00 AM EST.',
        link: '/announcements/1',
        metadata: { announcement_id: 1 },
        is_read: true
      }
    ];

    console.log('📝 Creating test notifications...');
    
    for (const notif of testNotifications) {
      const created = await Notification.create(notif);
      console.log(`  ✓ Created: ${created.title} (ID: ${created.id}, Read: ${created.is_read})`);
    }

    console.log('');
    console.log('✅ Test notifications created successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Open http://localhost:3000');
    console.log(`2. Log in as: ${user.email}`);
    console.log('3. Check the notification bell in the top right');
    console.log('4. You should see a badge with "3" (unread count)');
    console.log('5. Click the bell to see all 5 notifications');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test notifications:', error);
    process.exit(1);
  }
}

createTestNotifications();
