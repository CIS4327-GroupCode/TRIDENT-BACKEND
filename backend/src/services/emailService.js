/**
 * Email Service
 * Handles all email sending functionality using Nodemailer
 * Provider-agnostic: supports Ethereal (dev), SendGrid, Mailgun, AWS SES
 */

const nodemailer = require('nodemailer');

/**
 * Create email transporter based on environment variables
 * Automatically detects and configures based on available credentials
 */
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  // Log configuration in development (without exposing credentials)
  if (process.env.NODE_ENV !== 'production') {
    console.log('📧 Email service initialized:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      from: process.env.SMTP_FROM
    });
  }

  return nodemailer.createTransport(config);
};

const transporter = createTransporter();

/**
 * Send verification email for new user sign-up
 * @param {string} email - Recipient email address
 * @param {string} name - User's name
 * @param {string} verificationToken - JWT or UUID token for verification
 * @returns {Promise<Object>} Nodemailer result
 */
const sendVerificationEmail = async (email, name, verificationToken) => {
  const verifyLink = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e0e0e0;">
                  <h1 style="margin: 0; color: #00bfa5; font-size: 28px; font-weight: 600;">TRIDENT</h1>
                  <p style="margin: 8px 0 0; color: #666; font-size: 14px;">Match Portal</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 16px; color: #333; font-size: 24px; font-weight: 600;">Welcome, ${name}!</h2>
                  <p style="margin: 0 0 16px; color: #555; font-size: 16px; line-height: 1.5;">
                    Thank you for signing up for TRIDENT Match Portal. To complete your registration and activate your account, please verify your email address.
                  </p>
                  <p style="margin: 0 0 24px; color: #555; font-size: 16px; line-height: 1.5;">
                    Click the button below to verify your email:
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 0 auto;">
                    <tr>
                      <td style="border-radius: 4px; background-color: #00bfa5;">
                        <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">Verify Email Address</a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 24px 0 16px; color: #777; font-size: 14px; line-height: 1.5;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0; padding: 12px; background-color: #f5f5f5; border-radius: 4px; word-break: break-all;">
                    <a href="${verifyLink}" style="color: #00bfa5; text-decoration: none; font-size: 13px;">${verifyLink}</a>
                  </p>
                  
                  <p style="margin: 24px 0 0; color: #999; font-size: 13px; line-height: 1.5;">
                    This link will expire in 24 hours. If you didn't create an account with TRIDENT, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} TRIDENT Match Portal. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"TRIDENT Match Portal" <noreply@trident.example.com>',
    to: email,
    subject: 'Verify Your TRIDENT Account',
    html,
    text: `Welcome to TRIDENT, ${name}!\n\nPlease verify your email address by clicking this link: ${verifyLink}\n\nThis link will expire in 24 hours.`
  };

  return await transporter.sendMail(mailOptions);
};

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} name - User's name
 * @param {string} resetToken - JWT or UUID token for password reset
 * @returns {Promise<Object>} Nodemailer result
 */
const sendPasswordResetEmail = async (email, name, resetToken) => {
  const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e0e0e0;">
                  <h1 style="margin: 0; color: #00bfa5; font-size: 28px; font-weight: 600;">TRIDENT</h1>
                  <p style="margin: 8px 0 0; color: #666; font-size: 14px;">Match Portal</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 16px; color: #333; font-size: 24px; font-weight: 600;">Reset Your Password</h2>
                  <p style="margin: 0 0 16px; color: #555; font-size: 16px; line-height: 1.5;">
                    Hi ${name},
                  </p>
                  <p style="margin: 0 0 16px; color: #555; font-size: 16px; line-height: 1.5;">
                    We received a request to reset your password for your TRIDENT account. Click the button below to create a new password.
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 0 auto;">
                    <tr>
                      <td style="border-radius: 4px; background-color: #00bfa5;">
                        <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">Reset Password</a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 24px 0 16px; color: #777; font-size: 14px; line-height: 1.5;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0; padding: 12px; background-color: #f5f5f5; border-radius: 4px; word-break: break-all;">
                    <a href="${resetLink}" style="color: #00bfa5; text-decoration: none; font-size: 13px;">${resetLink}</a>
                  </p>
                  
                  <p style="margin: 24px 0 0; color: #999; font-size: 13px; line-height: 1.5;">
                    This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} TRIDENT Match Portal. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"TRIDENT Match Portal" <noreply@trident.example.com>',
    to: email,
    subject: 'Reset Your TRIDENT Password',
    html,
    text: `Hi ${name},\n\nYou requested to reset your password. Click this link to create a new password: ${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`
  };

  return await transporter.sendMail(mailOptions);
};

/**
 * Send notification email based on type
 * @param {string} email - Recipient email address
 * @param {string} name - User's name
 * @param {Object} notification - Notification object with type, title, message, link
 * @returns {Promise<Object>} Nodemailer result
 */
const sendNotificationEmail = async (email, name, notification) => {
  const { type, title, message, link } = notification;
  const actionLink = link ? `${process.env.APP_URL || 'http://localhost:3000'}${link}` : null;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e0e0e0;">
                  <h1 style="margin: 0; color: #00bfa5; font-size: 28px; font-weight: 600;">TRIDENT</h1>
                  <p style="margin: 8px 0 0; color: #666; font-size: 14px;">Match Portal</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 16px; color: #333; font-size: 24px; font-weight: 600;">${title}</h2>
                  <p style="margin: 0 0 16px; color: #555; font-size: 16px; line-height: 1.5;">
                    Hi ${name},
                  </p>
                  <p style="margin: 0 0 ${actionLink ? '24px' : '16px'}; color: #555; font-size: 16px; line-height: 1.5;">
                    ${message}
                  </p>
                  
                  ${actionLink ? `
                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 0 auto;">
                    <tr>
                      <td style="border-radius: 4px; background-color: #00bfa5;">
                        <a href="${actionLink}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">View Details</a>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                  
                  <p style="margin: 24px 0 0; color: #999; font-size: 13px; line-height: 1.5;">
                    You're receiving this because you have email notifications enabled. You can manage your preferences in your account settings.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} TRIDENT Match Portal. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"TRIDENT Match Portal" <noreply@trident.example.com>',
    to: email,
    subject: title,
    html,
    text: `Hi ${name},\n\n${message}${actionLink ? `\n\nView details: ${actionLink}` : ''}\n\nYou can manage your email preferences in your account settings.`
  };

  return await transporter.sendMail(mailOptions);
};

/**
 * Send weekly digest email
 * @param {string} email - Recipient email address
 * @param {string} name - User's name
 * @param {Object} digestData - Weekly activity summary
 * @returns {Promise<Object>} Nodemailer result
 */
const sendWeeklyDigest = async (email, name, digestData) => {
  const {
    newMessages = 0,
    newMatches = 0,
    upcomingMilestones = 0,
    projectUpdates = 0
  } = digestData;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Weekly TRIDENT Digest</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e0e0e0;">
                  <h1 style="margin: 0; color: #00bfa5; font-size: 28px; font-weight: 600;">TRIDENT</h1>
                  <p style="margin: 8px 0 0; color: #666; font-size: 14px;">Weekly Digest</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 16px; color: #333; font-size: 24px; font-weight: 600;">Your Week at a Glance</h2>
                  <p style="margin: 0 0 24px; color: #555; font-size: 16px; line-height: 1.5;">
                    Hi ${name}, here's what happened this week:
                  </p>
                  
                  <!-- Stats Grid -->
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                    <tr>
                      <td style="width: 50%; padding: 16px; background-color: #f9f9f9; border-radius: 4px;">
                        <p style="margin: 0 0 4px; color: #00bfa5; font-size: 32px; font-weight: 700;">${newMessages}</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">New Messages</p>
                      </td>
                      <td style="width: 16px;"></td>
                      <td style="width: 50%; padding: 16px; background-color: #f9f9f9; border-radius: 4px;">
                        <p style="margin: 0 0 4px; color: #00bfa5; font-size: 32px; font-weight: 700;">${newMatches}</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">New Matches</p>
                      </td>
                    </tr>
                    <tr><td colspan="3" style="height: 16px;"></td></tr>
                    <tr>
                      <td style="width: 50%; padding: 16px; background-color: #f9f9f9; border-radius: 4px;">
                        <p style="margin: 0 0 4px; color: #00bfa5; font-size: 32px; font-weight: 700;">${upcomingMilestones}</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">Upcoming Milestones</p>
                      </td>
                      <td style="width: 16px;"></td>
                      <td style="width: 50%; padding: 16px; background-color: #f9f9f9; border-radius: 4px;">
                        <p style="margin: 0 0 4px; color: #00bfa5; font-size: 32px; font-weight: 700;">${projectUpdates}</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">Project Updates</p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 0 auto;">
                    <tr>
                      <td style="border-radius: 4px; background-color: #00bfa5;">
                        <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">View Dashboard</a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 24px 0 0; color: #999; font-size: 13px; line-height: 1.5;">
                    You're receiving this weekly digest because you opted in. You can manage your email preferences in your account settings.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} TRIDENT Match Portal. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"TRIDENT Match Portal" <noreply@trident.example.com>',
    to: email,
    subject: 'Your Weekly TRIDENT Digest',
    html,
    text: `Hi ${name},\n\nYour week at a glance:\n- ${newMessages} new messages\n- ${newMatches} new matches\n- ${upcomingMilestones} upcoming milestones\n- ${projectUpdates} project updates\n\nView your dashboard: ${process.env.APP_URL}/dashboard`
  };

  return await transporter.sendMail(mailOptions);
};

/**
 * Test email connection (useful for health checks)
 * @returns {Promise<boolean>} True if connection successful
 */
const testConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email service connection verified');
    return true;
  } catch (error) {
    console.error('❌ Email service connection failed:', error.message);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNotificationEmail,
  sendWeeklyDigest,
  testConnection,
  transporter // Export for custom use cases
};
