<?php
/**
 * Database Initialization Script
 * Run this to create or reset the database (SQLite or MySQL)
 *
 * Usage:
 *   php init.php           - Initialize if not exists
 *   php init.php --reset   - Drop and recreate all tables
 *   php init.php --status  - Check database status
 *
 * Environment:
 *   DB_DRIVER=mysql to use MySQL (default: sqlite)
 *   See database.php for full MySQL config options
 */

require_once __DIR__ . '/database.php';

$action = $argv[1] ?? '--init';

switch ($action) {
    case '--status':
        checkStatus();
        break;

    case '--reset':
        resetDatabase();
        break;

    case '--init':
    default:
        initDatabase();
        break;
}

function checkStatus(): void {
    $driver = Database::getDriver();

    if ($driver === 'mysql') {
        $dbName = getenv('DB_NAME') ?: 'todo';
        echo "Database: MySQL ($dbName)\n";
    } else {
        $dbPath = Database::getDbPath();
        echo "Database: SQLite ($dbPath)\n";

        if (!file_exists($dbPath)) {
            echo "Status: NOT INITIALIZED\n";
            return;
        }

        $size = filesize($dbPath);
        echo "File size: " . number_format($size) . " bytes\n";
    }

    try {
        $db = Database::getInstance();

        // Check tables based on driver
        if ($driver === 'mysql') {
            $tables = Database::query("SHOW TABLES");
            $tableKey = array_keys($tables[0] ?? ['Tables_in_db' => ''])[0];
            echo "Tables: " . count($tables) . "\n";
            foreach ($tables as $table) {
                $tableName = $table[$tableKey];
                $count = Database::queryOne("SELECT COUNT(*) as cnt FROM `$tableName`");
                echo "  - $tableName: {$count['cnt']} rows\n";
            }
        } else {
            $tables = Database::query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
            echo "Tables: " . count($tables) . "\n";
            foreach ($tables as $table) {
                $count = Database::queryOne("SELECT COUNT(*) as cnt FROM " . $table['name']);
                echo "  - {$table['name']}: {$count['cnt']} rows\n";
            }
        }

        echo "Status: INITIALIZED\n";
    } catch (Exception $e) {
        echo "Status: ERROR - " . $e->getMessage() . "\n";
    }
}

function initDatabase(): void {
    $driver = Database::getDriver();

    if ($driver === 'mysql') {
        echo "Initializing MySQL database...\n";
    } else {
        $dbPath = Database::getDbPath();

        if (file_exists($dbPath)) {
            echo "Database already exists at: $dbPath\n";
            echo "Use --reset to drop and recreate, or --status to check current state.\n";
            return;
        }

        echo "Creating database at: $dbPath\n";
    }

    try {
        // Just calling getInstance will create and initialize the database
        $db = Database::getInstance();

        echo "Database initialized successfully!\n";
        checkStatus();
    } catch (Exception $e) {
        echo "Error initializing database: " . $e->getMessage() . "\n";
        exit(1);
    }
}

function resetDatabase(): void {
    $driver = Database::getDriver();

    echo "WARNING: This will delete all data in the database!\n";

    if (php_sapi_name() === 'cli') {
        echo "Are you sure? (type 'yes' to confirm): ";
        $confirm = trim(fgets(STDIN));
        if ($confirm !== 'yes') {
            echo "Aborted.\n";
            return;
        }
    }

    if ($driver === 'mysql') {
        // Drop all tables in MySQL
        try {
            $db = Database::getInstance();
            $tables = Database::query("SHOW TABLES");
            $tableKey = array_keys($tables[0] ?? ['Tables_in_db' => ''])[0];

            // Disable foreign key checks
            $db->exec("SET FOREIGN_KEY_CHECKS = 0");

            foreach ($tables as $table) {
                $tableName = $table[$tableKey];
                $db->exec("DROP TABLE IF EXISTS `$tableName`");
                echo "Dropped table: $tableName\n";
            }

            // Re-enable foreign key checks
            $db->exec("SET FOREIGN_KEY_CHECKS = 1");

            // Reset connection to trigger schema creation
            $reflection = new ReflectionClass(Database::class);
            $instanceProp = $reflection->getProperty('instance');
            $instanceProp->setAccessible(true);
            $instanceProp->setValue(null, null);

        } catch (Exception $e) {
            echo "Error dropping tables: " . $e->getMessage() . "\n";
        }
    } else {
        $dbPath = Database::getDbPath();

        if (file_exists($dbPath)) {
            // Close any existing connection
            $reflection = new ReflectionClass(Database::class);
            $instanceProp = $reflection->getProperty('instance');
            $instanceProp->setAccessible(true);
            $instanceProp->setValue(null, null);

            // Delete database file
            unlink($dbPath);

            // Also delete WAL and SHM files if they exist
            if (file_exists($dbPath . '-wal')) unlink($dbPath . '-wal');
            if (file_exists($dbPath . '-shm')) unlink($dbPath . '-shm');

            echo "Deleted existing database.\n";
        }
    }

    // Recreate
    initDatabase();
}
