<?php
/**
 * Push notification helper functions for Expo Push Notifications
 */

/**
 * Get user's push tokens
 * @param string $userId The user ID
 * @return array Array of push token objects
 */
function get_user_push_tokens($userId) {
    global $data_dir, $use_sqlite;

    if ($use_sqlite) {
        return db_get_push_tokens($userId);
    }

    $user_dir = $data_dir . '/users/' . $userId;
    $tokens_file = $user_dir . '/push-tokens.json';

    if (file_exists($tokens_file)) {
        $data = json_decode(file_get_contents($tokens_file), true);
        return $data['tokens'] ?? [];
    }

    return [];
}

/**
 * Add or update a push token for a user
 * @param string $userId The user ID
 * @param string $token Expo push token
 * @param string $platform Platform (ios/android)
 * @param string $deviceName Device name
 * @return bool Success
 */
function add_user_push_token($userId, $token, $platform, $deviceName = null) {
    global $data_dir, $use_sqlite;

    if ($use_sqlite) {
        return db_add_push_token($userId, $token, $platform, $deviceName);
    }

    $user_dir = $data_dir . '/users/' . $userId;
    if (!file_exists($user_dir)) {
        mkdir($user_dir, 0755, true);
    }

    $tokens_file = $user_dir . '/push-tokens.json';
    $tokens = get_user_push_tokens($userId);

    // Check if token already exists
    $found = false;
    foreach ($tokens as &$t) {
        if ($t['token'] === $token) {
            $t['platform'] = $platform;
            $t['deviceName'] = $deviceName;
            $t['updated'] = date('c');
            $found = true;
            break;
        }
    }

    // Add new token if not found
    if (!$found) {
        $tokens[] = [
            'token' => $token,
            'platform' => $platform,
            'deviceName' => $deviceName,
            'created' => date('c'),
            'updated' => date('c')
        ];
    }

    $data = ['tokens' => $tokens, 'updated' => date('c')];
    return file_put_contents($tokens_file, json_encode($data)) !== false;
}

/**
 * Remove a push token
 * @param string $userId The user ID
 * @param string $token Token to remove
 * @return bool Success
 */
function remove_user_push_token($userId, $token) {
    global $data_dir, $use_sqlite;

    if ($use_sqlite) {
        return db_remove_push_token($userId, $token);
    }

    $user_dir = $data_dir . '/users/' . $userId;
    $tokens_file = $user_dir . '/push-tokens.json';

    $tokens = get_user_push_tokens($userId);
    $tokens = array_filter($tokens, function($t) use ($token) {
        return $t['token'] !== $token;
    });
    $tokens = array_values($tokens); // Re-index

    $data = ['tokens' => $tokens, 'updated' => date('c')];
    return file_put_contents($tokens_file, json_encode($data)) !== false;
}

/**
 * Send push notification via Expo Push API
 * @param string|array $tokens Expo push token(s)
 * @param string $title Notification title
 * @param string $body Notification body
 * @param array $data Additional data
 * @return array Result from Expo API
 */
function send_expo_push_notification($tokens, $title, $body, $data = []) {
    // Ensure tokens is an array
    if (!is_array($tokens)) {
        $tokens = [$tokens];
    }

    // Filter valid Expo push tokens
    $validTokens = array_filter($tokens, function($token) {
        return is_string($token) && (
            strpos($token, 'ExponentPushToken[') === 0 ||
            strpos($token, 'ExpoPushToken[') === 0
        );
    });

    if (empty($validTokens)) {
        return ['error' => 'No valid Expo push tokens provided'];
    }

    // Prepare messages
    $messages = [];
    foreach ($validTokens as $token) {
        $messages[] = [
            'to' => $token,
            'sound' => 'default',
            'title' => $title,
            'body' => $body,
            'data' => $data,
            'priority' => 'high',
            'channelId' => 'default'
        ];
    }

    // Send to Expo Push API
    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Accept-Encoding: gzip, deflate',
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($messages));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false || !empty($error)) {
        error_log('Expo push notification error: ' . $error);
        return ['error' => $error ?: 'Failed to send push notification'];
    }

    if ($httpCode !== 200) {
        error_log('Expo push notification HTTP error: ' . $httpCode);
        return ['error' => 'HTTP error: ' . $httpCode, 'response' => $response];
    }

    $result = json_decode($response, true);

    // Log any errors from Expo
    if (isset($result['data'])) {
        foreach ($result['data'] as $ticketData) {
            if (isset($ticketData['status']) && $ticketData['status'] === 'error') {
                error_log('Expo push error: ' . json_encode($ticketData));
            }
        }
    }

    return $result;
}

/**
 * Send push notification to a user (all their devices)
 * @param string $userId User ID
 * @param string $title Notification title
 * @param string $body Notification body
 * @param array $data Additional data (e.g., url to navigate to)
 * @return array Result
 */
function send_push_to_user($userId, $title, $body, $data = []) {
    $tokens = get_user_push_tokens($userId);

    if (empty($tokens)) {
        return ['error' => 'No push tokens registered for user'];
    }

    $tokenStrings = array_column($tokens, 'token');
    return send_expo_push_notification($tokenStrings, $title, $body, $data);
}

/**
 * Send push notification for task completion
 */
function push_notify_task_completed($userId, $taskText, $listUrl = null) {
    $data = [];
    if ($listUrl) {
        $data['url'] = $listUrl;
    }

    return send_push_to_user(
        $userId,
        '✅ Task Completed!',
        $taskText,
        $data
    );
}

/**
 * Send push notification for shared list update
 */
function push_notify_shared_list_updated($userId, $listTitle, $listUrl, $changes = null) {
    $body = $listTitle . ' has been updated';
    if ($changes && is_array($changes) && !empty($changes)) {
        $body .= ': ' . implode(', ', array_slice($changes, 0, 2));
    }

    $data = [];
    if ($listUrl) {
        $data['url'] = $listUrl;
    }

    return send_push_to_user(
        $userId,
        '📋 List Updated',
        $body,
        $data
    );
}

/**
 * Send push notification for new shared task
 */
function push_notify_new_shared_task($userId, $taskText, $listTitle, $listUrl) {
    $data = [];
    if ($listUrl) {
        $data['url'] = $listUrl;
    }

    return send_push_to_user(
        $userId,
        '➕ New Task in ' . $listTitle,
        $taskText,
        $data
    );
}

/**
 * Send push notification for scheduled task reminder
 */
function push_notify_task_reminder($userId, $taskText, $scheduledTime, $listUrl = null) {
    $data = [];
    if ($listUrl) {
        $data['url'] = $listUrl;
    }

    return send_push_to_user(
        $userId,
        '⏰ Task Reminder',
        $taskText . ' is scheduled for ' . $scheduledTime,
        $data
    );
}
?>
