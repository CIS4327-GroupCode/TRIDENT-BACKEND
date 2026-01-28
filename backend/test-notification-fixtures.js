/**
 * Test Notification Fixtures
 * Use these to seed database with realistic notification data for manual testing
 * 
 * Usage:
 *   node test-notification-fixtures.js
 */

const { Notification, User } = require('./src/database/models');

const testNotifications = [
  // Application notifications
  {
    type: 'application_received',
    title: 'New Project Application',
    message: 'John Doe has applied to your project "Community Health Impact Study".',
    link: '/projects/123/applications',
    metadata: {
      application_id: 1,
      project_id: 123,
      researcher_id: 10,
      researcher_name: 'John Doe'
    }
  },
  {
    type: 'application_accepted',
    title: 'Application Accepted',
    message: 'Your application to "Youth Education Program Evaluation" has been accepted!',
    link: '/projects/456',
    metadata: {
      application_id: 2,
      project_id: 456,
      nonprofit_id: 5
    }
  },
  {
    type: 'application_rejected',
    title: 'Application Update',
    message: 'Your application to "Housing Stability Research" was not selected this time.',
    link: '/projects/789',
    metadata: {
      application_id: 3,
      project_id: 789
    }
  },

  // Milestone notifications
  {
    type: 'milestone_created',
    title: 'New Milestone Added',
    message: 'A new milestone "Initial Data Collection" was added to your project.',
    link: '/projects/123/milestones',
    metadata: {
      milestone_id: 5,
      project_id: 123,
      milestone_title: 'Initial Data Collection'
    }
  },
  {
    type: 'milestone_deadline_approaching',
    title: 'Milestone Deadline Approaching',
    message: 'The milestone "Survey Distribution" is due in 3 days.',
    link: '/projects/123/milestones',
    metadata: {
      milestone_id: 6,
      project_id: 123,
      days_until_deadline: 3,
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    }
  },
  {
    type: 'milestone_overdue',
    title: 'Milestone Overdue',
    message: 'The milestone "Data Analysis Report" is now overdue by 2 days.',
    link: '/projects/456/milestones',
    metadata: {
      milestone_id: 7,
      project_id: 456,
      days_overdue: 2
    }
  },
  {
    type: 'milestone_completed',
    title: 'Milestone Completed',
    message: 'Milestone "IRB Approval" has been marked as complete.',
    link: '/projects/123/milestones',
    metadata: {
      milestone_id: 8,
      project_id: 123,
      completed_by: 10
    }
  },

  // Project status notifications
  {
    type: 'project_status_changed',
    title: 'Project Status Updated',
    message: 'Your project "Climate Resilience Assessment" status changed to "In Progress".',
    link: '/projects/234',
    metadata: {
      project_id: 234,
      old_status: 'pending',
      new_status: 'in_progress'
    }
  },
  {
    type: 'project_approved',
    title: 'Project Approved',
    message: 'Your project "Food Security Study" has been approved and is now live!',
    link: '/projects/567',
    metadata: {
      project_id: 567,
      approved_by: 1,
      approved_at: new Date()
    }
  },
  {
    type: 'project_created',
    title: 'Project Created Successfully',
    message: 'Your project "Mental Health Access" has been created and submitted for review.',
    link: '/projects/890',
    metadata: {
      project_id: 890
    }
  },

  // Message notifications
  {
    type: 'message_received',
    title: 'New Message',
    message: 'Jane Smith sent you a message about "Data Privacy Concerns".',
    link: '/messages',
    metadata: {
      sender_id: 15,
      sender_name: 'Jane Smith',
      thread_id: 25,
      subject: 'Data Privacy Concerns'
    }
  },
  {
    type: 'message_received',
    title: 'New Message',
    message: 'Dr. Chen replied to your message thread.',
    link: '/messages',
    metadata: {
      sender_id: 20,
      sender_name: 'Dr. Chen',
      thread_id: 30
    }
  },

  // Admin/System notifications
  {
    type: 'system_announcement',
    title: 'Platform Maintenance Scheduled',
    message: 'Trident will be under maintenance on Feb 1st from 2-4 AM EST. Please save your work.',
    link: '/notifications',
    metadata: {
      maintenance_date: new Date('2026-02-01T02:00:00Z'),
      duration_hours: 2
    }
  },
  {
    type: 'admin_message',
    title: 'Action Required: Complete Your Profile',
    message: 'Please complete your organization profile to improve matching accuracy.',
    link: '/settings',
    metadata: {
      action_type: 'complete_profile',
      priority: 'medium'
    }
  },
  {
    type: 'account_verified',
    title: 'Account Verified',
    message: 'Your account has been verified. You now have full access to all features.',
    link: '/dashboard/nonprofit',
    metadata: {
      verified_at: new Date()
    }
  },

  // Matching notifications
  {
    type: 'new_match_available',
    title: 'New Match Available',
    message: 'We found 3 researchers matching your project "Urban Green Spaces Impact".',
    link: '/projects/345/matches',
    metadata: {
      project_id: 345,
      match_count: 3
    }
  },

  // Rating notifications
  {
    type: 'rating_received',
    title: 'New Rating Received',
    message: 'Harbor Relief left you a 5-star rating with positive feedback.',
    link: '/dashboard/researcher',
    metadata: {
      rating: 5,
      project_id: 123,
      reviewer_name: 'Harbor Relief'
    }
  }
];

async function seedNotifications() {
  try {
    // Find first nonprofit and researcher users
    const nonprofit = await User.findOne({ where: { role: 'nonprofit' } });
    const researcher = await User.findOne({ where: { role: 'researcher' } });

    if (!nonprofit) {
      console.error('No nonprofit user found. Create one first.');
      return;
    }

    if (!researcher) {
      console.error('No researcher user found. Create one first.');
      return;
    }

    console.log(`Found nonprofit user: ${nonprofit.email} (ID: ${nonprofit.id})`);
    console.log(`Found researcher user: ${researcher.email} (ID: ${researcher.id})`);

    // Create notifications for nonprofit
    const nonprofitNotifications = testNotifications
      .filter(n => 
        n.type.includes('application_received') ||
        n.type.includes('milestone') ||
        n.type.includes('project_status') ||
        n.type.includes('message') ||
        n.type.includes('system') ||
        n.type.includes('admin')
      )
      .map(n => ({
        user_id: nonprofit.id,
        ...n,
        is_read: Math.random() > 0.5 // 50% chance of being read
      }));

    // Create notifications for researcher
    const researcherNotifications = testNotifications
      .filter(n => 
        n.type.includes('application_accepted') ||
        n.type.includes('application_rejected') ||
        n.type.includes('message') ||
        n.type.includes('rating') ||
        n.type.includes('new_match') ||
        n.type.includes('system')
      )
      .map(n => ({
        user_id: researcher.id,
        ...n,
        is_read: Math.random() > 0.5
      }));

    const created = await Notification.bulkCreate([
      ...nonprofitNotifications,
      ...researcherNotifications
    ]);

    console.log(`\n✅ Created ${created.length} test notifications:`);
    console.log(`   - ${nonprofitNotifications.length} for nonprofit (${nonprofit.email})`);
    console.log(`   - ${researcherNotifications.length} for researcher (${researcher.email})`);
    console.log('\nNotification types created:');
    
    const typeCounts = {};
    created.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });
    
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    console.log('\n📌 Test the following flows:');
    console.log('   1. Login as nonprofit → click bell → see application/milestone notifications');
    console.log('   2. Click notification → verify navigation to correct page');
    console.log('   3. Mark as read → verify badge count decreases');
    console.log('   4. Delete notification → verify it disappears');
    console.log('   5. Mark all as read → verify all become read');
    console.log('   6. Login as researcher → see application acceptance/rejection notifications');

  } catch (error) {
    console.error('Error seeding notifications:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  seedNotifications()
    .then(() => {
      console.log('\n✅ Seeding complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { testNotifications, seedNotifications };
