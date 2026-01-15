<?php
/**
 * Database Initialization Script
 * Run this to create or reset the SQLite database
 *
 * Usage:
 *   php init.php           - Initialize if not exists
 *   php init.php --reset   - Drop and recreate all tables
 *   php init.php --status  - Check database status
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
    $dbPath = Database::getDbPath();

    echo "Database path: $dbPath\n";

    if (!file_exists($dbPath)) {
        echo "Status: NOT INITIALIZED\n";
        return;
    }

    $size = filesize($dbPath);
    echo "File size: " . number_format($size) . " bytes\n";

    try {
        $db = Database::getInstance();

        // Check tables
        $tables = Database::query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        echo "Tables: " . count($tables) . "\n";
        foreach ($tables as $table) {
            $count = Database::queryOne("SELECT COUNT(*) as cnt FROM " . $table['name']);
            echo "  - {$table['name']}: {$count['cnt']} rows\n";
        }

        echo "Status: INITIALIZED\n";
    } catch (Exception $e) {
        echo "Status: ERROR - " . $e->getMessage() . "\n";
    }
}

function initDatabase(): void {
    $dbPath = Database::getDbPath();

    if (file_exists($dbPath)) {
        echo "Database already exists at: $dbPath\n";
        echo "Use --reset to drop and recreate, or --status to check current state.\n";
        return;
    }

    echo "Creating database at: $dbPath\n";

    try {
        // Just calling getInstance will create and initialize the database
        $db = Database::getInstance();

        echo "Database created successfully!\n";
        checkStatus();
    } catch (Exception $e) {
        echo "Error creating database: " . $e->getMessage() . "\n";
        exit(1);
    }
}

function resetDatabase(): void {
    $dbPath = Database::getDbPath();

    echo "WARNING: This will delete all data in the database!\n";

    if (php_sapi_name() === 'cli') {
        echo "Are you sure? (type 'yes' to confirm): ";
        $confirm = trim(fgets(STDIN));
        if ($confirm !== 'yes') {
            echo "Aborted.\n";
            return;
        }
    }

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

    // Recreate
    initDatabase();
}
