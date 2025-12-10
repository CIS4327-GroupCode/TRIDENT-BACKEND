require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('./src/database/models');

async function testAdminLogin() {
  try {
    console.log('Testing admin login flow...\n');
    
    // Find admin user
    const admin = await User.findOne({ 
      where: { email: 'admin@trident.org' },
      paranoid: false
    });
    
    if (!admin) {
      console.log('❌ Admin user not found!');
      return;
    }
    
    console.log('✓ Admin user found:');
    console.log(`  ID: ${admin.id}`);
    console.log(`  Name: ${admin.name}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Role: ${admin.role}`);
    console.log(`  Account Status: ${admin.account_status}`);
    console.log(`  Deleted At: ${admin.deleted_at || 'null'}`);
    console.log();
    
    // Test password
    const testPassword = 'Password123!';
    const passwordMatch = await bcrypt.compare(testPassword, admin.password_hash);
    console.log(`✓ Password check: ${passwordMatch ? 'PASS' : 'FAIL'}`);
    console.log();
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: admin.id, role: admin.role, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✓ Generated JWT token:');
    console.log(`  ${token.substring(0, 50)}...`);
    console.log();
    
    // Decode and verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✓ Token decoded:');
    console.log(`  userId: ${decoded.userId}`);
    console.log(`  role: ${decoded.role}`);
    console.log(`  email: ${decoded.email}`);
    console.log();
    
    // Simulate middleware check
    const userCheck = await User.findByPk(decoded.userId, {
      attributes: ['id', 'name', 'email', 'role', 'account_status', 'deleted_at'],
      paranoid: false
    });
    
    console.log('✓ Middleware user lookup:');
    console.log(`  Found: ${!!userCheck}`);
    console.log(`  Deleted: ${!!userCheck?.deleted_at}`);
    console.log(`  Status: ${userCheck?.account_status}`);
    console.log(`  Role: ${userCheck?.role}`);
    console.log();
    
    // Check authorization
    if (userCheck?.role === 'admin' && userCheck?.account_status === 'active' && !userCheck?.deleted_at) {
      console.log('✅ ADMIN AUTHENTICATION SUCCESSFUL!');
      console.log('Admin has full access to the platform.');
    } else {
      console.log('❌ ADMIN AUTHENTICATION FAILED!');
      if (userCheck?.deleted_at) console.log('   Reason: Account is suspended');
      if (userCheck?.account_status !== 'active') console.log('   Reason: Account status is', userCheck?.account_status);
      if (userCheck?.role !== 'admin') console.log('   Reason: Role is not admin');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testAdminLogin();
