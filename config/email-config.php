<?php
/**
 * Email notification configuration
 * Configure your email settings here
 */

// Email notification settings
define('EMAIL_NOTIFICATIONS_ENABLED', true);

// SMTP Settings (recommended for production)
define('EMAIL_USE_SMTP', false); // Set to true to use SMTP instead of PHP mail()
define('EMAIL_SMTP_HOST', 'smtp.gmail.com');
define('EMAIL_SMTP_PORT', 587);
define('EMAIL_SMTP_USERNAME', ''); // Your SMTP username
define('EMAIL_SMTP_PASSWORD', ''); // Your SMTP password
define('EMAIL_SMTP_ENCRYPTION', 'tls'); // 'tls' or 'ssl'

// From email address
define('EMAIL_FROM_ADDRESS', 'noreply@todo.o9p.net');
define('EMAIL_FROM_NAME', 'Todo App');

// Notification types enabled
define('NOTIFY_TASK_COMPLETED', true);
define('NOTIFY_SHARED_LIST_UPDATED', true);
define('NOTIFY_NEW_SHARED_TASK', true);
define('NOTIFY_TASK_ASSIGNED', true);

// Rate limiting (prevent spam)
define('EMAIL_RATE_LIMIT_SECONDS', 300); // 5 minutes between notifications for same event type
?>
