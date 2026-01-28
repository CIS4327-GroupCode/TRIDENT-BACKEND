# Email Service Documentation

## Overview

TRIDENT uses **Nodemailer** for email delivery - a provider-agnostic solution that works with any SMTP service (Ethereal, SendGrid, Mailgun, AWS SES, etc.).

## Quick Start

### 1. Setup Development Environment

Generate Ethereal Email credentials (free, no signup):

```bash
node setup-email-dev.js
```

Copy the output to your `.env` file.

### 2. Test Email Service

```bash
node test-email-service.js
```

View sent emails at https://ethereal.email/messages

---

## Available Email Templates

### 1. **Verification Email** (`sendVerificationEmail`)
Sent when a user signs up to verify their email address.

```javascript
const emailService = require('./src/services/emailService');

await emailService.sendVerificationEmail(
  'user@example.com',
  'John Doe',
  'jwt-or-uuid-token'
);
```

**Features:**
- Clean, branded HTML template
- CTA button with fallback link
- 24-hour expiration notice
- Plain text fallback

---

### 2. **Password Reset Email** (`sendPasswordResetEmail`)
Sent when a user requests a password reset.

```javascript
await emailService.sendPasswordResetEmail(
  'user@example.com',
  'John Doe',
  'reset-token-123'
);
```

**Features:**
- Secure reset link
- 1-hour expiration
- Safety notice if not requested

---

### 3. **Notification Email** (`sendNotificationEmail`)
Generic notification template for in-app events.

```javascript
await emailService.sendNotificationEmail(
  'user@example.com',
  'John Doe',
  {
    type: 'project_created',
    title: 'New Project Created',
    message: 'Your project "Ocean Research" has been created.',
    link: '/projects/123' // Optional
  }
);
```

**Use cases:**
- Application received/accepted/rejected
- New messages
- New matches
- Milestone reminders
- Project updates

---

### 4. **Weekly Digest** (`sendWeeklyDigest`)
Summary of weekly activity.

```javascript
await emailService.sendWeeklyDigest(
  'user@example.com',
  'John Doe',
  {
    newMessages: 5,
    newMatches: 3,
    upcomingMilestones: 2,
    projectUpdates: 7
  }
);
```

---

## Environment Configuration

### Development (Ethereal Email)

```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ethereal-user@ethereal.email
SMTP_PASS=your-ethereal-password
SMTP_FROM="TRIDENT <noreply@trident.example.com>"
APP_URL=http://localhost:3000
```

**Advantages:**
- ✅ Zero cost
- ✅ No signup required
- ✅ Instant setup
- ✅ Web UI to view emails
- ✅ No risk of sending real emails during testing

---

### Production (SendGrid)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your_actual_sendgrid_api_key
SMTP_FROM="TRIDENT <noreply@trident.com>"
APP_URL=https://trident-frontend-livid.vercel.app
```

**Steps to setup SendGrid:**
1. Create account at https://sendgrid.com
2. Generate API key (Settings → API Keys)
3. Verify sender domain (Settings → Sender Authentication)
4. Update `.env.production` with credentials
5. Deploy - **zero code changes needed**

---

### Production (Mailgun)

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@mg.trident.com
SMTP_PASS=your_mailgun_smtp_password
SMTP_FROM="TRIDENT <noreply@mg.trident.com>"
APP_URL=https://trident-frontend-livid.vercel.app
```

---

### Production (AWS SES)

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_ses_smtp_username
SMTP_PASS=your_ses_smtp_password
SMTP_FROM="TRIDENT <noreply@trident.com>"
APP_URL=https://trident-frontend-livid.vercel.app
```

---

## Integration with Existing Systems

### User Registration (authController.js)

```javascript
const emailService = require('../services/emailService');
const jwt = require('jsonwebtoken');

// In your register function:
const user = await authModels.createUser(/* ... */);

// Generate email verification token
const verificationToken = jwt.sign(
  { userId: user.id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

// Send verification email
try {
  await emailService.sendVerificationEmail(
    user.email,
    user.name,
    verificationToken
  );
} catch (emailError) {
  console.error('Failed to send verification email:', emailError);
  // Continue anyway - don't block registration
}
```

---

### Password Reset Flow

**Step 1: Request Reset (new endpoint)**
```javascript
// POST /api/auth/request-password-reset
const resetToken = jwt.sign(
  { userId: user.id },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

await emailService.sendPasswordResetEmail(
  user.email,
  user.name,
  resetToken
);
```

**Step 2: Verify Token & Reset (new endpoint)**
```javascript
// POST /api/auth/reset-password
const decoded = jwt.verify(token, process.env.JWT_SECRET);
// Update password...
```

---

### Notification Integration (notificationService.js)

```javascript
const emailService = require('./emailService');
const { UserPreferences, User } = require('../database/models');

// Enhance existing createNotification function:
const createNotification = async (notificationData) => {
  const { userId, type, title, message, link } = notificationData;

  // Check user preferences
  const preferences = await UserPreferences.findOne({ where: { user_id: userId } });
  
  // Create in-app notification (existing logic)
  const notification = await Notification.create(/* ... */);

  // Send email if user has email notifications enabled
  if (preferences?.email_notifications && shouldSendEmailForType(type, preferences)) {
    const user = await User.findByPk(userId);
    
    try {
      await emailService.sendNotificationEmail(
        user.email,
        user.name,
        { type, title, message, link }
      );
    } catch (error) {
      console.error('Failed to send notification email:', error);
      // Don't block - notification still created in-app
    }
  }

  return notification;
};

// Helper to check if email should be sent for this notification type
function shouldSendEmailForType(type, preferences) {
  const typeMap = {
    'message_received': preferences.email_messages,
    'new_match_available': preferences.email_matches,
    'milestone_deadline_approaching': preferences.email_milestones,
    'project_status_changed': preferences.email_project_updates,
    'application_received': preferences.email_notifications,
    'application_accepted': preferences.email_notifications,
    'application_rejected': preferences.email_notifications
  };
  
  return typeMap[type] !== false; // Default to true if not mapped
}
```

---

## Health Check

Add to your app startup or health endpoint:

```javascript
const emailService = require('./services/emailService');

// On server start:
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Test email connection
  const emailReady = await emailService.testConnection();
  if (!emailReady) {
    console.warn('⚠️  Email service not configured properly - emails will fail');
  }
});
```

---

## Migration Guide

### Switching Providers (No Code Changes!)

1. **Update `.env` file only:**
   ```bash
   # Change from Ethereal to SendGrid:
   SMTP_HOST=smtp.sendgrid.net  # Changed
   SMTP_USER=apikey              # Changed
   SMTP_PASS=SG.new_api_key      # Changed
   SMTP_FROM="TRIDENT <noreply@trident.com>"  # Changed (use verified domain)
   ```

2. **Restart server**
3. **Test:** `node test-email-service.js`
4. **Deploy** - Done!

No code changes needed. Ever.

---

## Best Practices

### 1. Always Use Try-Catch
```javascript
try {
  await emailService.sendVerificationEmail(/* ... */);
} catch (error) {
  console.error('Email failed:', error);
  // Log to monitoring service (Sentry, etc.)
  // Don't block the user flow
}
```

### 2. Never Block Critical Flows
Email sending should be **asynchronous** and **non-blocking**:
- User registration should succeed even if email fails
- Notifications should be created even if email fails
- Log failures for manual follow-up

### 3. Respect User Preferences
Always check `UserPreferences` before sending:
```javascript
if (!preferences.email_notifications) return; // Don't send
if (type === 'message' && !preferences.email_messages) return;
```

### 4. Rate Limiting
Avoid spam by:
- Only sending weekly digest once per week
- Batching notifications into digests when possible
- Implementing cooldown periods for frequent notifications

---

## Troubleshooting

### "Connection refused" or "ECONNREFUSED"
- Check `SMTP_HOST` and `SMTP_PORT` in `.env`
- Verify credentials are correct
- Check firewall/network restrictions

### "Authentication failed"
- Verify `SMTP_USER` and `SMTP_PASS`
- For SendGrid: use `apikey` as username (literal string)
- For Gmail: use app-specific password, not regular password

### Emails not showing up in inbox
- Check spam folder
- Verify sender domain is authenticated (SPF/DKIM)
- Use a reputable provider (SendGrid, Mailgun) for production

### Preview URLs not working
- Only works with Ethereal Email
- For real providers, check their dashboard/logs instead

---

## Future Enhancements

### 1. Email Queue (Bull + Redis)
For high-volume production use:
```javascript
const emailQueue = require('./queue/emailQueue');

// Instead of:
await emailService.sendVerificationEmail(/* ... */);

// Use:
await emailQueue.add('verification-email', {
  email, name, token
});
```

### 2. Email Templates with React
Use `react-email` for modern component-based templates:
```bash
npm install react-email
```

### 3. Tracking & Analytics
- Track open rates (SendGrid tracking pixels)
- Click tracking on CTA buttons
- Bounce/complaint handling

### 4. A/B Testing
Test different subject lines, CTA copy, send times

---

## Support

- **Email issues:** Check `.env` configuration first
- **Template customization:** Edit `src/services/emailService.js`
- **Provider migration:** Update `.env` only, no code changes
- **Testing:** Use `node test-email-service.js`

---

**Last Updated:** January 2026
