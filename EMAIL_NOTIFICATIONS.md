# Email Notifications System

This todo app now supports email notifications for various events.

## Features

- Email notifications for:
  - Task completions
  - Shared list updates
  - New tasks added to shared lists
  - Daily task summaries

## Configuration

### 1. Email Settings

Edit `/config/email-config.php` to configure your email settings:

```php
// Enable/disable notifications
define('EMAIL_NOTIFICATIONS_ENABLED', true);

// Use SMTP (recommended for production)
define('EMAIL_USE_SMTP', false); // Set to true for SMTP

// SMTP settings (if using SMTP)
define('EMAIL_SMTP_HOST', 'smtp.gmail.com');
define('EMAIL_SMTP_PORT', 587);
define('EMAIL_SMTP_USERNAME', 'your-email@gmail.com');
define('EMAIL_SMTP_PASSWORD', 'your-app-password');
define('EMAIL_SMTP_ENCRYPTION', 'tls');

// From address
define('EMAIL_FROM_ADDRESS', 'noreply@todo.o9p.net');
define('EMAIL_FROM_NAME', 'Todo App');
```

### 2. Using SMTP (Recommended)

For production use, it's recommended to use SMTP instead of PHP's built-in mail() function:

1. Install PHPMailer (optional, for advanced SMTP):
   ```bash
   composer require phpmailer/phpmailer
   ```

2. Update `EMAIL_USE_SMTP` to `true` in the config

3. Configure your SMTP credentials

### 3. Using Gmail SMTP

If using Gmail:

1. Enable 2-factor authentication on your Google account
2. Generate an "App Password" at https://myaccount.google.com/apppasswords
3. Use the app password in `EMAIL_SMTP_PASSWORD`

## API Endpoints

### Set User Email

**PUT** `/api/user/email`

```json
{
  "email": "user@example.com"
}
```

### Get User Email

**GET** `/api/user/email`

Response:
```json
{
  "email": "user@example.com"
}
```

### Update Notification Preferences

**PUT** `/api/user/notification-prefs`

```json
{
  "preferences": {
    "task_completed": true,
    "shared_list_updated": true,
    "new_shared_task": true,
    "task_assigned": true
  }
}
```

### Get Notification Preferences

**GET** `/api/user/notification-prefs`

Response:
```json
{
  "preferences": {
    "task_completed": true,
    "shared_list_updated": true,
    "new_shared_task": true,
    "task_assigned": true
  }
}
```

### Test Notifications

**POST** `/api/test-notification`

```json
{
  "type": "task_completed"
}
```

Types: `task_completed`, `shared_list_updated`, `new_shared_task`

## Usage

### Setting Up Email (via curl)

```bash
# Set your email
curl -X PUT https://todo.o9p.net/api/user/email \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com"}'

# Test notification
curl -X POST https://todo.o9p.net/api/test-notification \
  -H "Content-Type: application/json" \
  -d '{"type": "task_completed"}'
```

### JavaScript Integration

```javascript
// Set user email
async function setUserEmail(email) {
  const response = await fetch('/api/user/email', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  return await response.json();
}

// Update notification preferences
async function updateNotificationPrefs(prefs) {
  const response = await fetch('/api/user/notification-prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences: prefs })
  });
  return await response.json();
}

// Test notification
async function testNotification(type) {
  const response = await fetch('/api/test-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type })
  });
  return await response.json();
}
```

## Rate Limiting

Notifications are rate-limited to prevent spam:
- Same event type: 5 minutes between notifications
- Daily summaries: Once per day

## Email Templates

All emails use a consistent HTML template with:
- Responsive design
- Clear call-to-action buttons
- Unsubscribe/settings link
- Professional styling

## Troubleshooting

### Emails not sending

1. Check `EMAIL_NOTIFICATIONS_ENABLED` is `true`
2. Verify email configuration in `/config/email-config.php`
3. Check PHP error logs for mail() errors
4. Test SMTP credentials if using SMTP
5. Ensure your server can send emails (check with hosting provider)

### Gmail "Less secure app access" error

Gmail no longer supports "less secure apps". You must:
1. Enable 2FA on your Google account
2. Create an "App Password"
3. Use the app password in your config

### Testing

Use the test endpoint to verify email delivery:

```bash
curl -X POST https://todo.o9p.net/api/test-notification \
  -H "Content-Type: application/json" \
  -d '{"type": "task_completed"}'
```

## Future Enhancements

Potential improvements:
- Web UI for managing email preferences
- Scheduled notifications (reminders)
- Digest emails (weekly summary)
- Notification for scheduled tasks
- Multiple email recipients for shared lists
- Custom notification templates
- Webhook integration
- Push notifications (for mobile app)

## Security

- Email addresses are stored securely per user
- Rate limiting prevents spam
- No emails are sent to unverified addresses
- Users can opt-out anytime
- Email addresses are never shared

## Files

- `/config/email-config.php` - Email configuration
- `/www/api/includes/email-helpers.php` - Email helper functions
- `/www/api/index.php` - API endpoints (user/email, user/notification-prefs, test-notification)

## Support

For issues or questions, please check:
1. Server email logs
2. PHP error logs
3. SMTP provider documentation
4. This README
