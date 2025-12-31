/**
 * Quick API Test for Notification Endpoints
 * 
 * Tests all notification API endpoints to verify Phase 1 is working
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

// Test user credentials
const TEST_USER = {
  email: 'david.t@seniorwellness.org',
  password: 'password123' // Update this if different
};

async function testNotificationAPI() {
  let authToken = null;

  try {
    console.log('🧪 Testing Notification API Endpoints\n');

    // Step 1: Login to get auth token
    console.log('1️⃣ Testing Authentication...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, TEST_USER);
    authToken = loginResponse.data.token;
    console.log(`   ✓ Login successful - Token: ${authToken.substring(0, 20)}...\n`);

    // Step 2: Get unread count
    console.log('2️⃣ Testing GET /api/notifications/unread-count');
    const unreadResponse = await axios.get(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log(`   ✓ Unread count: ${unreadResponse.data.unreadCount}`);
    console.log(`   Response:`, unreadResponse.data);
    console.log('');

    // Step 3: Get all notifications
    console.log('3️⃣ Testing GET /api/notifications');
    const notificationsResponse = await axios.get(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log(`   ✓ Retrieved ${notificationsResponse.data.notifications.length} notifications`);
    console.log(`   Total: ${notificationsResponse.data.total}, Page: ${notificationsResponse.data.page}`);
    
    if (notificationsResponse.data.notifications.length > 0) {
      const firstNotif = notificationsResponse.data.notifications[0];
      console.log(`   First notification:`, {
        id: firstNotif.id,
        title: firstNotif.title,
        is_read: firstNotif.is_read
      });
    }
    console.log('');

    // Step 4: Test filtering - only unread
    console.log('4️⃣ Testing GET /api/notifications?unread=true');
    const unreadOnlyResponse = await axios.get(`${BASE_URL}/notifications?unread=true`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log(`   ✓ Retrieved ${unreadOnlyResponse.data.notifications.length} unread notifications`);
    console.log('');

    // Step 5: Mark one as read
    if (notificationsResponse.data.notifications.length > 0) {
      const unreadNotif = notificationsResponse.data.notifications.find(n => !n.is_read);
      
      if (unreadNotif) {
        console.log(`5️⃣ Testing PUT /api/notifications/${unreadNotif.id}/read`);
        const markReadResponse = await axios.put(
          `${BASE_URL}/notifications/${unreadNotif.id}/read`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        console.log(`   ✓ Marked notification ${unreadNotif.id} as read`);
        console.log(`   Response:`, markReadResponse.data);
        console.log('');

        // Step 6: Mark as unread again
        console.log(`6️⃣ Testing PUT /api/notifications/${unreadNotif.id}/unread`);
        const markUnreadResponse = await axios.put(
          `${BASE_URL}/notifications/${unreadNotif.id}/unread`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        console.log(`   ✓ Marked notification ${unreadNotif.id} as unread`);
        console.log(`   Response:`, markUnreadResponse.data);
        console.log('');
      }
    }

    // Step 7: Mark all as read
    console.log('7️⃣ Testing PUT /api/notifications/read-all');
    const markAllReadResponse = await axios.put(
      `${BASE_URL}/notifications/read-all`,
      {},
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log(`   ✓ Marked all notifications as read`);
    console.log(`   Updated count: ${markAllReadResponse.data.updatedCount}`);
    console.log('');

    // Step 8: Delete all read notifications
    console.log('8️⃣ Testing DELETE /api/notifications/read');
    const deleteReadResponse = await axios.delete(`${BASE_URL}/notifications/read`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log(`   ✓ Deleted all read notifications`);
    console.log(`   Deleted count: ${deleteReadResponse.data.deletedCount}`);
    console.log('');

    console.log('✅ ALL API TESTS PASSED!');
    console.log('');
    console.log('Phase 1 Backend is working correctly! ✓');
    console.log('');

  } catch (error) {
    console.error('❌ API Test Failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    process.exit(1);
  }
}

testNotificationAPI();
