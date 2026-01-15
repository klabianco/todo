<?php
/**
 * Database Helper Functions
 * Provides functions to convert between JSON task format and database format
 */

require_once __DIR__ . '/../db/database.php';

// ============================================
// DATABASE COMPATIBILITY HELPERS
// ============================================

/**
 * Get the SQL function for current timestamp
 * SQLite uses datetime('now'), MySQL uses NOW()
 */
function db_now(): string {
    return Database::getDriver() === 'mysql' ? 'NOW()' : 'datetime("now")';
}

// ============================================
// TASK CONVERSION FUNCTIONS
// ============================================

/**
 * Flatten nested tasks into flat array with parent_id
 * @param array $tasks Nested tasks array
 * @param string|null $parentId Parent task ID (null for root)
 * @param int &$sortOrder Running sort order counter
 * @return array Flat array of tasks
 */
function flatten_tasks(array $tasks, ?string $parentId = null, int &$sortOrder = 0): array {
    $flat = [];

    foreach ($tasks as $task) {
        if (!isset($task['id'])) continue;

        $flatTask = [
            'id' => $task['id'],
            'parent_id' => $parentId,
            'text' => $task['task'] ?? '',
            'completed' => !empty($task['completed']) ? 1 : 0,
            'sticky' => !empty($task['sticky']) ? 1 : 0,
            'scheduled_time' => $task['scheduledTime'] ?? null,
            'location' => $task['location'] ?? null,
            'location_index' => $task['location_index'] ?? null,
            'sort_order' => $sortOrder++,
            'created_at' => $task['created'] ?? $task['timestamps']['created'] ?? date('c'),
        ];

        $flat[] = $flatTask;

        // Recursively flatten subtasks
        if (!empty($task['subtasks']) && is_array($task['subtasks'])) {
            $flat = array_merge($flat, flatten_tasks($task['subtasks'], $task['id'], $sortOrder));
        }
    }

    return $flat;
}

/**
 * Nest flat tasks back into hierarchical structure
 * @param array $flatTasks Flat array of tasks from database
 * @return array Nested tasks array
 */
function nest_tasks(array $flatTasks): array {
    // Build index of task IDs in the result set
    $taskIds = [];
    foreach ($flatTasks as $task) {
        $taskIds[$task['id']] = true;
    }

    // Group by parent, promoting orphans (parent not in result set) to root
    $byParent = [];
    foreach ($flatTasks as $task) {
        $parentId = $task['parent_id'] ?? null;
        // If parent doesn't exist in result set, treat as root
        if ($parentId === null || !isset($taskIds[$parentId])) {
            $parentId = '_root_';
        }
        $byParent[$parentId][] = $task;
    }

    // Sort each group by sort_order
    foreach ($byParent as &$group) {
        usort($group, fn($a, $b) => ($a['sort_order'] ?? 0) - ($b['sort_order'] ?? 0));
    }

    return build_task_tree($byParent, '_root_');
}

/**
 * Build task tree recursively
 */
function build_task_tree(array $byParent, string $parentId): array {
    $result = [];

    foreach (($byParent[$parentId] ?? []) as $task) {
        $nested = [
            'id' => $task['id'],
            'task' => $task['text'],
            'completed' => (bool)$task['completed'],
            'sticky' => (bool)$task['sticky'],
            'subtasks' => build_task_tree($byParent, $task['id']),
            'created' => $task['created_at'],
        ];

        // Only include optional fields if set
        if (!empty($task['scheduled_time'])) {
            $nested['scheduledTime'] = $task['scheduled_time'];
        }
        if (!empty($task['location'])) {
            $nested['location'] = $task['location'];
        }
        if (isset($task['location_index'])) {
            $nested['location_index'] = $task['location_index'];
        }
        if (!empty($task['parent_id']) && $task['parent_id'] !== '_root_') {
            $nested['parentId'] = $task['parent_id'];
        }

        $result[] = $nested;
    }

    return $result;
}

// ============================================
// USER FUNCTIONS
// ============================================

/**
 * Get or create a user record
 */
function db_get_or_create_user(string $userId): array {
    $user = Database::queryOne('SELECT * FROM users WHERE id = ?', [$userId]);

    if (!$user) {
        Database::execute(
            'INSERT INTO users (id, created_at) VALUES (?, ' . db_now() . ')',
            [$userId]
        );
        $user = Database::queryOne('SELECT * FROM users WHERE id = ?', [$userId]);
    }

    return $user;
}

/**
 * Update user settings
 */
function db_update_user_settings(string $userId, array $settings): bool {
    db_get_or_create_user($userId);

    $fields = [];
    $params = [];

    if (isset($settings['personalListTitle'])) {
        $fields[] = 'personal_list_title = ?';
        $params[] = $settings['personalListTitle'];
    }
    if (isset($settings['email'])) {
        $fields[] = 'email = ?';
        $params[] = $settings['email'];
    }

    if (empty($fields)) return true;

    $fields[] = 'updated_at = ' . db_now() . '';
    $params[] = $userId;

    $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';
    return Database::execute($sql, $params) >= 0;
}

/**
 * Get user settings
 */
function db_get_user_settings(string $userId): array {
    $user = db_get_or_create_user($userId);
    return [
        'personalListTitle' => $user['personal_list_title'] ?? 'My List'
    ];
}

// ============================================
// TASK FUNCTIONS (Personal Lists)
// ============================================

/**
 * Load tasks for a user on a specific date (including sticky)
 */
function db_load_user_tasks(string $userId, string $date): array {
    db_get_or_create_user($userId);

    $tasks = Database::query(
        'SELECT * FROM tasks WHERE user_id = ? AND (task_date = ? OR sticky = 1) ORDER BY sort_order',
        [$userId, $date]
    );

    return nest_tasks($tasks);
}

/**
 * Save tasks for a user on a specific date
 */
function db_save_user_tasks(string $userId, string $date, array $tasks): bool {
    db_get_or_create_user($userId);

    Database::beginTransaction();

    try {
        // Delete existing tasks for this user+date (non-sticky)
        Database::execute(
            'DELETE FROM tasks WHERE user_id = ? AND task_date = ? AND sticky = 0',
            [$userId, $date]
        );

        // Delete existing sticky tasks for this user
        Database::execute(
            'DELETE FROM tasks WHERE user_id = ? AND sticky = 1',
            [$userId]
        );

        // Flatten and insert new tasks
        $flatTasks = flatten_tasks($tasks);

        foreach ($flatTasks as $task) {
            $taskDate = $task['sticky'] ? null : $date;
            db_insert_task($task, null, $userId, $taskDate);
        }

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error saving user tasks: ' . $e->getMessage());
        return false;
    }
}

// ============================================
// TASK FUNCTIONS (Shared Lists)
// ============================================

/**
 * Load tasks for a shared list
 */
function db_load_list_tasks(string $listId): array {
    $tasks = Database::query(
        'SELECT * FROM tasks WHERE list_id = ? ORDER BY sort_order',
        [$listId]
    );

    return nest_tasks($tasks);
}

/**
 * Save tasks for a shared list
 */
function db_save_list_tasks(string $listId, array $tasks): bool {
    Database::beginTransaction();

    try {
        // Delete existing tasks for this list
        Database::execute('DELETE FROM tasks WHERE list_id = ?', [$listId]);

        // Flatten and insert new tasks
        $flatTasks = flatten_tasks($tasks);

        foreach ($flatTasks as $task) {
            db_insert_task($task, $listId, null, null);
        }

        // Update list modification time
        Database::execute(
            'UPDATE lists SET last_modified_at = ' . db_now() . ' WHERE id = ?',
            [$listId]
        );

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error saving list tasks: ' . $e->getMessage());
        return false;
    }
}

/**
 * Insert a single task (with duplicate handling)
 */
function db_insert_task(array $task, ?string $listId, ?string $userId, ?string $taskDate): void {
    try {
        Database::execute(
            'INSERT INTO tasks (id, list_id, user_id, task_date, parent_id, text, completed, sticky, scheduled_time, location, location_index, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $task['id'],
                $listId,
                $userId,
                $taskDate,
                $task['parent_id'],
                $task['text'],
                $task['completed'],
                $task['sticky'],
                $task['scheduled_time'],
                $task['location'],
                $task['location_index'],
                $task['sort_order'],
                $task['created_at'] ?? date('c')
            ]
        );
    } catch (PDOException $e) {
        // If duplicate ID, generate a new one and retry
        if (strpos($e->getMessage(), 'UNIQUE constraint failed: tasks.id') !== false) {
            $newId = bin2hex(random_bytes(16));
            Database::execute(
                'INSERT INTO tasks (id, list_id, user_id, task_date, parent_id, text, completed, sticky, scheduled_time, location, location_index, sort_order, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $newId,
                    $listId,
                    $userId,
                    $taskDate,
                    $task['parent_id'],
                    $task['text'],
                    $task['completed'],
                    $task['sticky'],
                    $task['scheduled_time'],
                    $task['location'],
                    $task['location_index'],
                    $task['sort_order'],
                    $task['created_at'] ?? date('c')
                ]
            );
        } else {
            throw $e;
        }
    }
}

// ============================================
// LIST FUNCTIONS
// ============================================

/**
 * Create a new shared list
 */
function db_create_list(string $listId, ?string $ownerId, ?string $title, string $listType, array $tasks = []): bool {
    Database::beginTransaction();

    try {
        Database::execute(
            'INSERT INTO lists (id, owner_id, title, list_type, created_at, last_modified_at)
             VALUES (?, ?, ?, ?, ' . db_now() . ', ' . db_now() . ')',
            [$listId, $ownerId, $title, $listType]
        );

        if (!empty($tasks)) {
            $flatTasks = flatten_tasks($tasks);
            foreach ($flatTasks as $task) {
                db_insert_task($task, $listId, null, null);
            }
        }

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error creating list: ' . $e->getMessage());
        return false;
    }
}

/**
 * Get a shared list with its tasks
 */
function db_get_list(string $listId): ?array {
    $list = Database::queryOne('SELECT * FROM lists WHERE id = ?', [$listId]);

    if (!$list) return null;

    $tasks = db_load_list_tasks($listId);

    return [
        'id' => $list['id'],
        'title' => $list['title'],
        'listType' => $list['list_type'],
        'focusId' => $list['focus_id'],
        'tasks' => $tasks,
        'created' => $list['created_at'],
        'lastModified' => $list['last_modified_at']
    ];
}

/**
 * Update a shared list
 */
function db_update_list(string $listId, array $data): bool {
    Database::beginTransaction();

    try {
        // Update list metadata if provided
        $updates = [];
        $params = [];

        if (isset($data['title'])) {
            $updates[] = 'title = ?';
            $params[] = $data['title'];
        }
        if (isset($data['listType'])) {
            $updates[] = 'list_type = ?';
            $params[] = $data['listType'];
        }
        if (array_key_exists('focusId', $data)) {
            $updates[] = 'focus_id = ?';
            $params[] = $data['focusId'];
        }

        if (!empty($updates)) {
            $updates[] = 'last_modified_at = ' . db_now() . '';
            $params[] = $listId;
            Database::execute(
                'UPDATE lists SET ' . implode(', ', $updates) . ' WHERE id = ?',
                $params
            );
        }

        // Update tasks if provided
        if (isset($data['tasks'])) {
            Database::execute('DELETE FROM tasks WHERE list_id = ?', [$listId]);
            $flatTasks = flatten_tasks($data['tasks']);
            foreach ($flatTasks as $task) {
                db_insert_task($task, $listId, null, null);
            }
            // Always update modification time when tasks change
            Database::execute(
                'UPDATE lists SET last_modified_at = ' . db_now() . ' WHERE id = ?',
                [$listId]
            );
        }

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error updating list: ' . $e->getMessage());
        return false;
    }
}

/**
 * Delete a shared list
 */
function db_delete_list(string $listId): bool {
    // Tasks will be deleted via CASCADE
    return Database::execute('DELETE FROM lists WHERE id = ?', [$listId]) > 0;
}

/**
 * Check if list was modified since a timestamp
 */
function db_list_modified_since(string $listId, string $since): bool {
    $list = Database::queryOne(
        'SELECT last_modified_at FROM lists WHERE id = ? AND last_modified_at > ?',
        [$listId, $since]
    );
    return $list !== null;
}

// ============================================
// SUBSCRIPTION FUNCTIONS
// ============================================

/**
 * Get user's subscribed lists
 */
function db_get_subscriptions(string $userId): array {
    return Database::query(
        'SELECT ls.list_id as id, COALESCE(ls.title, l.title) as title, ls.url, ls.last_accessed_at as lastAccessed
         FROM list_subscriptions ls
         LEFT JOIN lists l ON ls.list_id = l.id
         WHERE ls.user_id = ?
         ORDER BY ls.last_accessed_at DESC',
        [$userId]
    );
}

/**
 * Save user's subscribed lists
 */
function db_save_subscriptions(string $userId, array $lists): bool {
    db_get_or_create_user($userId);

    Database::beginTransaction();

    try {
        Database::execute('DELETE FROM list_subscriptions WHERE user_id = ?', [$userId]);

        foreach ($lists as $list) {
            // Skip if list doesn't exist in database
            $exists = Database::queryOne('SELECT id FROM lists WHERE id = ?', [$list['id']]);
            if (!$exists) {
                continue;
            }

            Database::execute(
                'INSERT INTO list_subscriptions (user_id, list_id, title, url, last_accessed_at)
                 VALUES (?, ?, ?, ?, ?)',
                [
                    $userId,
                    $list['id'],
                    $list['title'] ?? null,
                    $list['url'] ?? null,
                    $list['lastAccessed'] ?? date('c')
                ]
            );
        }

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error saving subscriptions: ' . $e->getMessage());
        return false;
    }
}

/**
 * Get user's owned lists
 */
function db_get_owned_lists(string $userId): array {
    return Database::query(
        'SELECT ol.list_id as id, ol.associated_date as date
         FROM owned_lists ol
         WHERE ol.user_id = ?
         ORDER BY ol.created_at DESC',
        [$userId]
    );
}

/**
 * Save user's owned lists
 */
function db_save_owned_lists(string $userId, array $lists): bool {
    db_get_or_create_user($userId);

    Database::beginTransaction();

    try {
        Database::execute('DELETE FROM owned_lists WHERE user_id = ?', [$userId]);

        foreach ($lists as $list) {
            $listId = is_array($list) ? $list['id'] : $list;
            $date = is_array($list) ? ($list['date'] ?? null) : null;

            // Skip if list doesn't exist in database
            $exists = Database::queryOne('SELECT id FROM lists WHERE id = ?', [$listId]);
            if (!$exists) {
                continue;
            }

            Database::execute(
                'INSERT INTO owned_lists (user_id, list_id, associated_date)
                 VALUES (?, ?, ?)',
                [$userId, $listId, $date]
            );

            // Also set owner on the list
            Database::execute(
                'UPDATE lists SET owner_id = ? WHERE id = ? AND owner_id IS NULL',
                [$userId, $listId]
            );
        }

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error saving owned lists: ' . $e->getMessage());
        return false;
    }
}

/**
 * Remove a list from all users' subscriptions
 */
function db_remove_list_from_all_subscriptions(string $listId): int {
    return Database::execute(
        'DELETE FROM list_subscriptions WHERE list_id = ?',
        [$listId]
    );
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

/**
 * Get user notification preferences
 */
function db_get_notification_prefs(string $userId): array {
    $prefs = Database::queryOne(
        'SELECT * FROM user_notification_prefs WHERE user_id = ?',
        [$userId]
    );

    return $prefs ? [
        'task_completed' => (bool)$prefs['task_completed'],
        'shared_list_updated' => (bool)$prefs['shared_list_updated'],
        'new_shared_task' => (bool)$prefs['new_shared_task'],
        'task_assigned' => (bool)$prefs['task_assigned'],
    ] : [];
}

/**
 * Save user notification preferences
 */
function db_save_notification_prefs(string $userId, array $prefs): bool {
    db_get_or_create_user($userId);

    return Database::execute(
        'INSERT INTO user_notification_prefs (user_id, task_completed, shared_list_updated, new_shared_task, task_assigned, updated_at)
         VALUES (?, ?, ?, ?, ?, ' . db_now() . ')
         ON CONFLICT(user_id) DO UPDATE SET
         task_completed = excluded.task_completed,
         shared_list_updated = excluded.shared_list_updated,
         new_shared_task = excluded.new_shared_task,
         task_assigned = excluded.task_assigned,
         updated_at = ' . db_now() . '',
        [
            $userId,
            !empty($prefs['task_completed']) ? 1 : 0,
            !empty($prefs['shared_list_updated']) ? 1 : 0,
            !empty($prefs['new_shared_task']) ? 1 : 0,
            !empty($prefs['task_assigned']) ? 1 : 0,
        ]
    ) >= 0;
}

/**
 * Get user push tokens
 */
function db_get_push_tokens(string $userId): array {
    return Database::query(
        'SELECT token, platform, device_name as deviceName, created_at as created
         FROM user_push_tokens WHERE user_id = ?',
        [$userId]
    );
}

/**
 * Add a push token for user
 */
function db_add_push_token(string $userId, string $token, ?string $platform, ?string $deviceName): bool {
    db_get_or_create_user($userId);

    return Database::execute(
        'INSERT INTO user_push_tokens (user_id, token, platform, device_name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, token) DO UPDATE SET
         platform = excluded.platform,
         device_name = excluded.device_name,
         updated_at = ' . db_now() . '',
        [$userId, $token, $platform, $deviceName]
    ) >= 0;
}

/**
 * Remove a push token
 */
function db_remove_push_token(string $userId, string $token): bool {
    return Database::execute(
        'DELETE FROM user_push_tokens WHERE user_id = ? AND token = ?',
        [$userId, $token]
    ) > 0;
}

// ============================================
// GROCERY STORE FUNCTIONS
// ============================================

/**
 * Get all grocery stores
 */
function db_get_grocery_stores(): array {
    $stores = Database::query('SELECT * FROM grocery_stores ORDER BY name');

    foreach ($stores as &$store) {
        $store['aisle_layout'] = db_get_store_aisles($store['id']);
        $store['photos'] = db_get_store_photos($store['id']);
    }

    return $stores;
}

/**
 * Get a single grocery store
 */
function db_get_grocery_store(string $storeId): ?array {
    $store = Database::queryOne('SELECT * FROM grocery_stores WHERE id = ?', [$storeId]);

    if (!$store) return null;

    $store['aisle_layout'] = db_get_store_aisles($storeId);
    $store['photos'] = db_get_store_photos($storeId);

    return $store;
}

/**
 * Get aisles for a store
 */
function db_get_store_aisles(string $storeId): array {
    $aisles = Database::query(
        'SELECT id, aisle_number, category, sort_order FROM store_aisles WHERE store_id = ? ORDER BY sort_order',
        [$storeId]
    );

    foreach ($aisles as &$aisle) {
        $items = Database::query(
            'SELECT item_name FROM store_aisle_items WHERE aisle_id = ? ORDER BY sort_order',
            [$aisle['id']]
        );
        $aisle['items'] = array_column($items, 'item_name');

        $photos = Database::query(
            'SELECT id, date_taken, date_added FROM store_aisle_photos WHERE aisle_id = ?',
            [$aisle['id']]
        );
        $aisle['photos'] = $photos;

        // Remove internal id, rename for JSON output
        $aisle['aisle_number'] = $aisle['aisle_number'];
        unset($aisle['id']);
    }

    return $aisles;
}

/**
 * Get photos for a store
 */
function db_get_store_photos(string $storeId): array {
    return Database::query(
        'SELECT id, date_taken, date_added FROM store_photos WHERE store_id = ?',
        [$storeId]
    );
}

/**
 * Create a grocery store
 */
function db_create_grocery_store(array $data): string {
    $id = $data['id'] ?? ('store-' . bin2hex(random_bytes(4)));

    Database::execute(
        'INSERT INTO grocery_stores (id, name, city, state, phone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ' . db_now() . ', ' . db_now() . ')',
        [
            $id,
            $data['name'],
            $data['city'] ?? null,
            $data['state'] ?? null,
            $data['phone'] ?? null
        ]
    );

    // Add aisles if provided
    if (!empty($data['aisle_layout'])) {
        db_save_store_aisles($id, $data['aisle_layout']);
    }

    return $id;
}

/**
 * Save/replace aisles for a store
 */
function db_save_store_aisles(string $storeId, array $aisles): bool {
    Database::beginTransaction();

    try {
        // Delete existing aisles (cascades to items and photos)
        Database::execute('DELETE FROM store_aisles WHERE store_id = ?', [$storeId]);

        $sortOrder = 0;
        foreach ($aisles as $aisle) {
            Database::execute(
                'INSERT INTO store_aisles (store_id, aisle_number, category, sort_order)
                 VALUES (?, ?, ?, ?)',
                [$storeId, $aisle['aisle_number'], $aisle['category'] ?? null, $sortOrder++]
            );
            $aisleId = Database::lastInsertId();

            // Add items
            $itemOrder = 0;
            foreach (($aisle['items'] ?? []) as $item) {
                Database::execute(
                    'INSERT INTO store_aisle_items (aisle_id, item_name, sort_order)
                     VALUES (?, ?, ?)',
                    [$aisleId, $item, $itemOrder++]
                );
            }

            // Add photos
            foreach (($aisle['photos'] ?? []) as $photo) {
                Database::execute(
                    'INSERT INTO store_aisle_photos (id, aisle_id, date_taken, date_added)
                     VALUES (?, ?, ?, ?)',
                    [
                        $photo['id'],
                        $aisleId,
                        $photo['date_taken'] ?? null,
                        $photo['date_added'] ?? date('c')
                    ]
                );
            }
        }

        Database::execute(
            'UPDATE grocery_stores SET updated_at = ' . db_now() . ' WHERE id = ?',
            [$storeId]
        );

        Database::commit();
        return true;
    } catch (Exception $e) {
        Database::rollback();
        error_log('Error saving store aisles: ' . $e->getMessage());
        return false;
    }
}

/**
 * Update a grocery store
 */
function db_update_grocery_store(string $storeId, array $data): bool {
    $updates = [];
    $params = [];

    if (isset($data['name'])) {
        $updates[] = 'name = ?';
        $params[] = $data['name'];
    }
    if (isset($data['city'])) {
        $updates[] = 'city = ?';
        $params[] = $data['city'];
    }
    if (isset($data['state'])) {
        $updates[] = 'state = ?';
        $params[] = $data['state'];
    }
    if (isset($data['phone'])) {
        $updates[] = 'phone = ?';
        $params[] = $data['phone'];
    }

    if (empty($updates)) return true;

    $updates[] = 'updated_at = ' . db_now() . '';
    $params[] = $storeId;

    return Database::execute(
        'UPDATE grocery_stores SET ' . implode(', ', $updates) . ' WHERE id = ?',
        $params
    ) >= 0;
}

/**
 * Delete a grocery store
 */
function db_delete_grocery_store(string $storeId): bool {
    return Database::execute('DELETE FROM grocery_stores WHERE id = ?', [$storeId]) > 0;
}
