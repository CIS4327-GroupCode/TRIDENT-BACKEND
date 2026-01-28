/**
 * Email Service Setup Script
 * Generates Ethereal Email credentials for local development testing
 * 
 * Run this once to get your local SMTP credentials:
 *   node setup-email-dev.js
 * 
 * Then copy the output into your .env file
 */

const nodemailer = require('nodemailer');

async function setupEtherealEmail() {
  console.log('🔧 Setting up Ethereal Email for development...\n');

  try {
    // Create a test account on Ethereal Email
    const testAccount = await nodemailer.createTestAccount();

    console.log('✅ Ethereal Email account created successfully!\n');
    console.log('📋 Copy these settings to your .env file:\n');
    console.log('─'.repeat(60));
    console.log(`SMTP_HOST=smtp.ethereal.email`);
    console.log(`SMTP_PORT=587`);
    console.log(`SMTP_SECURE=false`);
    console.log(`SMTP_USER=${testAccount.user}`);
    console.log(`SMTP_PASS=${testAccount.pass}`);
    console.log(`SMTP_FROM="TRIDENT Match Portal <noreply@trident.example.com>"`);
    console.log(`APP_URL=http://localhost:3000`);
    console.log('─'.repeat(60));
    console.log('\n📧 All emails will be viewable at: https://ethereal.email/messages');
    console.log(`🔑 Login with: ${testAccount.user} / ${testAccount.pass}\n`);
    console.log('💡 Ethereal Email is a fake SMTP service - emails are not actually sent.');
    console.log('   Perfect for development and testing!\n');

  } catch (error) {
    console.error('❌ Failed to create Ethereal account:', error.message);
    console.log('\n💡 You can also create an account manually at https://ethereal.email/');
    process.exit(1);
  }
}

setupEtherealEmail();
