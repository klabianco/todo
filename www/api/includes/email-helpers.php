<?php
/**
 * Email notification helper functions
 */

// Load email configuration
require_once __DIR__ . '/../../config/email-config.php';

/**
 * Get user's email address from their preferences
 * @param string $userId The user ID
 * @return string|null Email address or null if not set
 */
function get_user_email($userId) {
    global $data_dir;
    $user_dir = $data_dir . '/users/' . $userId;
    $email_file = $user_dir . '/email.json';

    if (file_exists($email_file)) {
        $data = json_decode(file_get_contents($email_file), true);
        return $data['email'] ?? null;
    }

    return null;
}

/**
 * Set user's email address in their preferences
 * @param string $userId The user ID
 * @param string $email Email address
 * @return bool Success
 */
function set_user_email($userId, $email) {
    global $data_dir;
    $user_dir = $data_dir . '/users/' . $userId;
    if (!file_exists($user_dir)) {
        mkdir($user_dir, 0755, true);
    }

    $email_file = $user_dir . '/email.json';
    $data = ['email' => $email, 'updated' => date('c')];

    return file_put_contents($email_file, json_encode($data)) !== false;
}

/**
 * Get notification preferences for a user
 * @param string $userId The user ID
 * @return array Notification preferences
 */
function get_notification_preferences($userId) {
    global $data_dir;
    $user_dir = $data_dir . '/users/' . $userId;
    $prefs_file = $user_dir . '/notification-prefs.json';

    $defaults = [
        'task_completed' => NOTIFY_TASK_COMPLETED,
        'shared_list_updated' => NOTIFY_SHARED_LIST_UPDATED,
        'new_shared_task' => NOTIFY_NEW_SHARED_TASK,
        'task_assigned' => NOTIFY_TASK_ASSIGNED
    ];

    if (file_exists($prefs_file)) {
        $data = json_decode(file_get_contents($prefs_file), true);
        return array_merge($defaults, $data);
    }

    return $defaults;
}

/**
 * Check rate limiting for notifications
 * @param string $userId User ID
 * @param string $eventType Type of event
 * @param string $eventId Optional event identifier
 * @return bool True if notification should be sent
 */
function check_rate_limit($userId, $eventType, $eventId = null) {
    global $data_dir;
    $user_dir = $data_dir . '/users/' . $userId;
    $rate_limit_file = $user_dir . '/notification-rate-limit.json';

    $key = $eventType . ($eventId ? ':' . $eventId : '');
    $now = time();

    $rate_limits = [];
    if (file_exists($rate_limit_file)) {
        $rate_limits = json_decode(file_get_contents($rate_limit_file), true) ?: [];
    }

    // Check if this event was recently sent
    if (isset($rate_limits[$key])) {
        $last_sent = $rate_limits[$key];
        if (($now - $last_sent) < EMAIL_RATE_LIMIT_SECONDS) {
            return false; // Too soon, skip notification
        }
    }

    // Update rate limit
    $rate_limits[$key] = $now;

    // Clean old entries (older than 24 hours)
    $rate_limits = array_filter($rate_limits, function($timestamp) use ($now) {
        return ($now - $timestamp) < 86400;
    });

    file_put_contents($rate_limit_file, json_encode($rate_limits));

    return true;
}

/**
 * Send email using PHP mail() or SMTP
 * @param string $to Recipient email address
 * @param string $subject Email subject
 * @param string $body Email body (HTML)
 * @return bool Success
 */
function send_email($to, $subject, $body) {
    if (!EMAIL_NOTIFICATIONS_ENABLED) {
        return false;
    }

    if (EMAIL_USE_SMTP) {
        return send_email_smtp($to, $subject, $body);
    } else {
        return send_email_basic($to, $subject, $body);
    }
}

/**
 * Send email using basic PHP mail()
 */
function send_email_basic($to, $subject, $body) {
    $headers = [
        'From: ' . EMAIL_FROM_NAME . ' <' . EMAIL_FROM_ADDRESS . '>',
        'Reply-To: ' . EMAIL_FROM_ADDRESS,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8'
    ];

    return mail($to, $subject, $body, implode("\r\n", $headers));
}

/**
 * Send email using SMTP (requires PHPMailer or similar)
 * This is a placeholder - you would need to install PHPMailer
 */
function send_email_smtp($to, $subject, $body) {
    // For production, install PHPMailer:
    // composer require phpmailer/phpmailer

    // Example with PHPMailer (requires installation):
    /*
    use PHPMailer\PHPMailer\PHPMailer;
    use PHPMailer\PHPMailer\Exception;

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = EMAIL_SMTP_HOST;
        $mail->SMTPAuth = true;
        $mail->Username = EMAIL_SMTP_USERNAME;
        $mail->Password = EMAIL_SMTP_PASSWORD;
        $mail->SMTPSecure = EMAIL_SMTP_ENCRYPTION;
        $mail->Port = EMAIL_SMTP_PORT;

        $mail->setFrom(EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME);
        $mail->addAddress($to);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $body;

        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log("Email send failed: {$mail->ErrorInfo}");
        return false;
    }
    */

    // Fallback to basic mail for now
    return send_email_basic($to, $subject, $body);
}

/**
 * Generate HTML email template
 */
function get_email_template($title, $content, $actionUrl = null, $actionText = null) {
    $action_button = '';
    if ($actionUrl && $actionText) {
        $action_button = '
            <table role="presentation" style="margin: 20px auto;">
                <tr>
                    <td style="background-color: #3b82f6; border-radius: 6px; padding: 12px 24px;">
                        <a href="' . htmlspecialchars($actionUrl) . '"
                           style="color: #ffffff; text-decoration: none; font-weight: 600; display: inline-block;">
                            ' . htmlspecialchars($actionText) . '
                        </a>
                    </td>
                </tr>
            </table>';
    }

    return '
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>' . htmlspecialchars($title) . '</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif;
                 line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">' . htmlspecialchars($title) . '</h1>
            <div style="color: #4b5563; font-size: 16px;">
                ' . $content . '
            </div>
            ' . $action_button . '
        </div>
        <div style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
            <p>You received this email because you have notifications enabled in your Todo App.</p>
            <p style="margin-top: 10px;">
                <a href="' . $_SERVER['HTTP_HOST'] . '/settings" style="color: #3b82f6; text-decoration: none;">
                    Manage notification preferences
                </a>
            </p>
        </div>
    </body>
    </html>';
}

/**
 * Send notification when a task is completed
 */
function notify_task_completed($userId, $taskText, $listUrl = null) {
    $email = get_user_email($userId);
    if (!$email) return false;

    $prefs = get_notification_preferences($userId);
    if (!$prefs['task_completed']) return false;

    if (!check_rate_limit($userId, 'task_completed', null)) {
        return false; // Rate limited
    }

    $content = '<p>Great job! You completed:</p><p style="font-weight: 600; font-size: 18px; margin: 15px 0;">' .
               htmlspecialchars($taskText) . '</p>';

    $subject = '✅ Task Completed: ' . $taskText;
    $body = get_email_template(
        'Task Completed!',
        $content,
        $listUrl,
        'View Your List'
    );

    return send_email($email, $subject, $body);
}

/**
 * Send notification when a shared list is updated
 */
function notify_shared_list_updated($userId, $listTitle, $listUrl, $changes) {
    $email = get_user_email($userId);
    if (!$email) return false;

    $prefs = get_notification_preferences($userId);
    if (!$prefs['shared_list_updated']) return false;

    if (!check_rate_limit($userId, 'shared_list_updated', $listUrl)) {
        return false; // Rate limited
    }

    $content = '<p>The shared list <strong>' . htmlspecialchars($listTitle) . '</strong> has been updated.</p>';
    if ($changes) {
        $content .= '<p>Changes:</p><ul style="margin: 10px 0;">';
        foreach ($changes as $change) {
            $content .= '<li>' . htmlspecialchars($change) . '</li>';
        }
        $content .= '</ul>';
    }

    $subject = '📋 Shared List Updated: ' . $listTitle;
    $body = get_email_template(
        'Shared List Updated',
        $content,
        $listUrl,
        'View Shared List'
    );

    return send_email($email, $subject, $body);
}

/**
 * Send notification when a new task is added to a shared list
 */
function notify_new_shared_task($userId, $taskText, $listTitle, $listUrl) {
    $email = get_user_email($userId);
    if (!$email) return false;

    $prefs = get_notification_preferences($userId);
    if (!$prefs['new_shared_task']) return false;

    if (!check_rate_limit($userId, 'new_shared_task', $listUrl)) {
        return false; // Rate limited
    }

    $content = '<p>A new task was added to <strong>' . htmlspecialchars($listTitle) . '</strong>:</p>' .
               '<p style="font-weight: 600; font-size: 16px; margin: 15px 0;">' .
               htmlspecialchars($taskText) . '</p>';

    $subject = '➕ New Task: ' . $taskText;
    $body = get_email_template(
        'New Task Added',
        $content,
        $listUrl,
        'View Shared List'
    );

    return send_email($email, $subject, $body);
}

/**
 * Send daily task summary
 */
function notify_daily_summary($userId, $tasks) {
    $email = get_user_email($userId);
    if (!$email) return false;

    if (!check_rate_limit($userId, 'daily_summary', date('Y-m-d'))) {
        return false; // Already sent today
    }

    $total = count($tasks);
    $completed = count(array_filter($tasks, function($t) { return $t['completed'] ?? false; }));
    $pending = $total - $completed;

    $content = '<p>Here\'s your daily task summary:</p>' .
               '<div style="margin: 20px 0; padding: 20px; background-color: #ffffff; border-radius: 6px;">' .
               '<p style="margin: 5px 0;"><strong>Total Tasks:</strong> ' . $total . '</p>' .
               '<p style="margin: 5px 0;"><strong>Completed:</strong> ' . $completed . '</p>' .
               '<p style="margin: 5px 0;"><strong>Pending:</strong> ' . $pending . '</p>' .
               '</div>';

    if ($pending > 0) {
        $content .= '<p><strong>Pending Tasks:</strong></p><ul style="margin: 10px 0;">';
        foreach ($tasks as $task) {
            if (!($task['completed'] ?? false)) {
                $content .= '<li>' . htmlspecialchars($task['task']) . '</li>';
            }
        }
        $content .= '</ul>';
    }

    $subject = '📊 Daily Task Summary - ' . date('F j, Y');
    $body = get_email_template(
        'Daily Task Summary',
        $content,
        'https://' . $_SERVER['HTTP_HOST'],
        'View Your Tasks'
    );

    return send_email($email, $subject, $body);
}
?>
