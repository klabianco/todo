<?php
/**
 * SQLite Database Connection Helper
 * Provides a singleton PDO connection to the todo database
 */

class Database {
    private static ?PDO $instance = null;
    private static string $dbPath;

    /**
     * Get the singleton PDO instance
     */
    public static function getInstance(): PDO {
        if (self::$instance === null) {
            self::$dbPath = __DIR__ . '/../data/todo.db';

            // Ensure data directory exists
            $dataDir = dirname(self::$dbPath);
            if (!file_exists($dataDir)) {
                mkdir($dataDir, 0755, true);
            }

            $isNewDb = !file_exists(self::$dbPath);

            self::$instance = new PDO(
                'sqlite:' . self::$dbPath,
                null,
                null,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );

            // Enable foreign keys
            self::$instance->exec('PRAGMA foreign_keys = ON');

            // Optimize for performance
            self::$instance->exec('PRAGMA journal_mode = WAL');
            self::$instance->exec('PRAGMA synchronous = NORMAL');

            // Initialize schema if new database
            if ($isNewDb) {
                self::initializeSchema();
            }
        }

        return self::$instance;
    }

    /**
     * Initialize database schema from schema.sql
     */
    private static function initializeSchema(): void {
        $schemaFile = __DIR__ . '/schema.sql';
        if (file_exists($schemaFile)) {
            $schema = file_get_contents($schemaFile);
            self::$instance->exec($schema);
        }
    }

    /**
     * Get the database file path
     */
    public static function getDbPath(): string {
        return self::$dbPath ?? __DIR__ . '/../data/todo.db';
    }

    /**
     * Check if database exists and is initialized
     */
    public static function isInitialized(): bool {
        $dbPath = self::getDbPath();
        if (!file_exists($dbPath)) {
            return false;
        }

        try {
            $db = self::getInstance();
            $result = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
            return $result->fetch() !== false;
        } catch (Exception $e) {
            return false;
        }
    }

    /**
     * Begin a transaction
     */
    public static function beginTransaction(): bool {
        return self::getInstance()->beginTransaction();
    }

    /**
     * Commit a transaction
     */
    public static function commit(): bool {
        return self::getInstance()->commit();
    }

    /**
     * Rollback a transaction
     */
    public static function rollback(): bool {
        return self::getInstance()->rollBack();
    }

    /**
     * Execute a query and return all results
     */
    public static function query(string $sql, array $params = []): array {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Execute a query and return first result
     */
    public static function queryOne(string $sql, array $params = []): ?array {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    /**
     * Execute a statement (insert/update/delete)
     */
    public static function execute(string $sql, array $params = []): int {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /**
     * Get last inserted ID
     */
    public static function lastInsertId(): string {
        return self::getInstance()->lastInsertId();
    }
}

/**
 * Shorthand function to get database instance
 */
function db(): PDO {
    return Database::getInstance();
}
