<?php
/**
 * Migration Script: JSON Files to Database (SQLite or MySQL)
 *
 * Usage:
 *   php migrate-to-sqlite.php              - Run migration
 *   php migrate-to-sqlite.php --dry-run    - Show what would be migrated
 *   php migrate-to-sqlite.php --stats      - Show current JSON file stats
 *
 * Environment:
 *   DB_DRIVER=mysql to use MySQL (default: sqlite)
 *   See db/database.php for full MySQL config options
 */

require_once __DIR__ . '/db/database.php';
require_once __DIR__ . '/includes/db-helpers.php';

$dataDir = __DIR__ . '/data';
$dryRun = in_array('--dry-run', $argv);
$showStats = in_array('--stats', $argv);

if ($showStats) {
    showJsonStats($dataDir);
    exit(0);
}

$driver = Database::getDriver();
echo "=== Todo App: JSON to " . strtoupper($driver) . " Migration ===\n\n";

if ($dryRun) {
    echo "DRY RUN MODE - No changes will be made\n\n";
}

try {
    $stats = [
        'lists' => 0,
        'users' => 0,
        'tasks' => 0,
        'stores' => 0,
        'subscriptions' => 0,
        'errors' => []
    ];

    if (!$dryRun) {
        // Initialize database
        echo "Initializing database...\n";
        Database::getInstance();
    }

    // Migrate shared lists
    echo "\n--- Migrating Shared Lists ---\n";
    migrateSharedLists($dataDir, $dryRun, $stats);

    // Migrate users
    echo "\n--- Migrating Users ---\n";
    migrateUsers($dataDir, $dryRun, $stats);

    // Migrate grocery stores
    echo "\n--- Migrating Grocery Stores ---\n";
    migrateGroceryStores($dataDir, $dryRun, $stats);

    // Print summary
    echo "\n=== Migration Summary ===\n";
    echo "Lists migrated: {$stats['lists']}\n";
    echo "Users migrated: {$stats['users']}\n";
    echo "Tasks migrated: {$stats['tasks']}\n";
    echo "Stores migrated: {$stats['stores']}\n";
    echo "Subscriptions migrated: {$stats['subscriptions']}\n";

    if (!empty($stats['errors'])) {
        echo "\nErrors:\n";
        foreach ($stats['errors'] as $error) {
            echo "  - $error\n";
        }
    }

    if (!$dryRun) {
        $dbInfo = Database::getDriver() === 'mysql' ? 'MySQL' : Database::getDbPath();
        echo "\nMigration complete! Database: " . $dbInfo . "\n";
        echo "\nVerify with: php db/init.php --status\n";
    }

} catch (Exception $e) {
    echo "FATAL ERROR: " . $e->getMessage() . "\n";
    exit(1);
}

function showJsonStats(string $dataDir): void {
    echo "=== JSON File Statistics ===\n\n";

    // Count list files
    $listFiles = glob($dataDir . '/*.json');
    $listCount = 0;
    $taskCount = 0;

    foreach ($listFiles as $file) {
        $filename = basename($file, '.json');
        // Skip non-list files
        if (strpos($filename, 'stores') !== false || strpos($filename, 'grocery') !== false) {
            continue;
        }

        $data = json_decode(file_get_contents($file), true);
        if (isset($data['tasks'])) {
            $listCount++;
            $taskCount += countTasksRecursive($data['tasks']);
        }
    }

    echo "Shared Lists: $listCount\n";
    echo "Tasks in lists: $taskCount\n";

    // Count users
    $usersDir = $dataDir . '/users';
    if (is_dir($usersDir)) {
        $userDirs = array_filter(scandir($usersDir), fn($d) => $d !== '.' && $d !== '..');
        echo "Users: " . count($userDirs) . "\n";

        $userTaskCount = 0;
        foreach ($userDirs as $userId) {
            $userDir = $usersDir . '/' . $userId;
            if (!is_dir($userDir)) continue;

            foreach (glob($userDir . '/*.json') as $file) {
                $filename = basename($file, '.json');
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $filename) || $filename === 'sticky') {
                    $tasks = json_decode(file_get_contents($file), true);
                    if (is_array($tasks)) {
                        $userTaskCount += countTasksRecursive($tasks);
                    }
                }
            }
        }
        echo "Tasks in user lists: $userTaskCount\n";
    }

    // Count stores
    $storesFile = $dataDir . '/grocery-stores.json';
    if (file_exists($storesFile)) {
        $stores = json_decode(file_get_contents($storesFile), true);
        echo "Grocery Stores: " . count($stores) . "\n";
    }
}

function countTasksRecursive(array $tasks): int {
    $count = count($tasks);
    foreach ($tasks as $task) {
        if (!empty($task['subtasks'])) {
            $count += countTasksRecursive($task['subtasks']);
        }
    }
    return $count;
}

function migrateSharedLists(string $dataDir, bool $dryRun, array &$stats): void {
    $listFiles = glob($dataDir . '/*.json');

    foreach ($listFiles as $file) {
        $filename = basename($file, '.json');

        // Skip non-list files
        if (strpos($filename, 'stores') !== false ||
            strpos($filename, 'grocery') !== false ||
            strlen($filename) !== 8) { // List IDs are 8 chars
            continue;
        }

        $data = json_decode(file_get_contents($file), true);

        if (!isset($data['id']) || !isset($data['tasks'])) {
            continue;
        }

        echo "  List: {$data['id']}";
        if (isset($data['title'])) {
            echo " ({$data['title']})";
        }
        echo " - " . count($data['tasks']) . " tasks\n";

        if (!$dryRun) {
            try {
                $success = db_create_list(
                    $data['id'],
                    null, // Owner will be set during user migration
                    $data['title'] ?? null,
                    $data['listType'] ?? 'todo',
                    $data['tasks']
                );

                if ($success) {
                    // Update focusId if set
                    if (!empty($data['focusId'])) {
                        db_update_list($data['id'], ['focusId' => $data['focusId']]);
                    }

                    $stats['lists']++;
                    $stats['tasks'] += countTasksRecursive($data['tasks']);
                }
            } catch (Exception $e) {
                $stats['errors'][] = "List {$data['id']}: " . $e->getMessage();
            }
        } else {
            $stats['lists']++;
            $stats['tasks'] += countTasksRecursive($data['tasks']);
        }
    }
}

function migrateUsers(string $dataDir, bool $dryRun, array &$stats): void {
    $usersDir = $dataDir . '/users';

    if (!is_dir($usersDir)) {
        echo "  No users directory found\n";
        return;
    }

    foreach (scandir($usersDir) as $userId) {
        if ($userId === '.' || $userId === '..') continue;

        $userDir = $usersDir . '/' . $userId;
        if (!is_dir($userDir)) continue;

        echo "  User: $userId\n";

        if (!$dryRun) {
            try {
                // Create user
                db_get_or_create_user($userId);

                // Migrate email
                $emailFile = $userDir . '/email.json';
                if (file_exists($emailFile)) {
                    $data = json_decode(file_get_contents($emailFile), true);
                    if (!empty($data['email'])) {
                        db_update_user_settings($userId, ['email' => $data['email']]);
                    }
                }

                // Migrate settings
                $settingsFile = $userDir . '/settings.json';
                if (file_exists($settingsFile)) {
                    $data = json_decode(file_get_contents($settingsFile), true);
                    if (!empty($data['personalListTitle'])) {
                        db_update_user_settings($userId, $data);
                    }
                }

                // Migrate notification prefs
                $prefsFile = $userDir . '/notification-prefs.json';
                if (file_exists($prefsFile)) {
                    $prefs = json_decode(file_get_contents($prefsFile), true);
                    if (is_array($prefs)) {
                        db_save_notification_prefs($userId, $prefs);
                    }
                }

                // Migrate push tokens
                $tokensFile = $userDir . '/push-tokens.json';
                if (file_exists($tokensFile)) {
                    $data = json_decode(file_get_contents($tokensFile), true);
                    foreach (($data['tokens'] ?? []) as $token) {
                        db_add_push_token(
                            $userId,
                            $token['token'],
                            $token['platform'] ?? null,
                            $token['deviceName'] ?? null
                        );
                    }
                }

                // Migrate subscriptions
                $subFile = $userDir . '/subscribed.json';
                if (file_exists($subFile)) {
                    $lists = json_decode(file_get_contents($subFile), true);
                    if (is_array($lists) && !empty($lists)) {
                        db_save_subscriptions($userId, $lists);
                        $stats['subscriptions'] += count($lists);
                    }
                }

                // Migrate owned lists
                $ownedFile = $userDir . '/owned.json';
                if (file_exists($ownedFile)) {
                    $lists = json_decode(file_get_contents($ownedFile), true);
                    if (is_array($lists) && !empty($lists)) {
                        db_save_owned_lists($userId, $lists);
                    }
                }

                // Migrate sticky tasks
                $stickyFile = $userDir . '/sticky.json';
                if (file_exists($stickyFile)) {
                    $tasks = json_decode(file_get_contents($stickyFile), true);
                    if (is_array($tasks) && !empty($tasks)) {
                        // Mark all as sticky
                        foreach ($tasks as &$task) {
                            $task['sticky'] = true;
                        }
                        $flatTasks = flatten_tasks($tasks);
                        foreach ($flatTasks as $task) {
                            db_insert_task($task, null, $userId, null);
                        }
                        $stats['tasks'] += countTasksRecursive($tasks);
                    }
                }

                // Migrate date-specific tasks
                foreach (glob($userDir . '/*.json') as $dateFile) {
                    $date = basename($dateFile, '.json');
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                        continue;
                    }

                    $tasks = json_decode(file_get_contents($dateFile), true);
                    if (is_array($tasks) && !empty($tasks)) {
                        $flatTasks = flatten_tasks($tasks);
                        foreach ($flatTasks as $task) {
                            db_insert_task($task, null, $userId, $date);
                        }
                        $stats['tasks'] += countTasksRecursive($tasks);
                    }
                }

                $stats['users']++;
            } catch (Exception $e) {
                $stats['errors'][] = "User $userId: " . $e->getMessage();
            }
        } else {
            $stats['users']++;
        }
    }
}

function migrateGroceryStores(string $dataDir, bool $dryRun, array &$stats): void {
    $storesFile = $dataDir . '/grocery-stores.json';

    if (!file_exists($storesFile)) {
        echo "  No grocery stores file found\n";
        return;
    }

    $stores = json_decode(file_get_contents($storesFile), true);

    if (!is_array($stores)) {
        echo "  Invalid stores file format\n";
        return;
    }

    foreach ($stores as $store) {
        echo "  Store: {$store['name']}";
        if (!empty($store['city'])) {
            echo " ({$store['city']}, {$store['state']})";
        }
        echo "\n";

        if (!$dryRun) {
            try {
                db_create_grocery_store($store);
                $stats['stores']++;
            } catch (Exception $e) {
                $stats['errors'][] = "Store {$store['id']}: " . $e->getMessage();
            }
        } else {
            $stats['stores']++;
        }
    }
}
