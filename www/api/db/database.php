<?php
/**
 * Database Connection Helper
 * Supports both SQLite and MySQL via environment configuration
 *
 * Environment variables:
 *   DB_DRIVER=sqlite|mysql (default: sqlite)
 *   DB_HOST=localhost (MySQL only)
 *   DB_PORT=3306 (MySQL only)
 *   DB_NAME=todo (MySQL only)
 *   DB_USER=root (MySQL only)
 *   DB_PASS= (MySQL only)
 */

class Database {
    private static ?PDO $instance = null;
    private static string $driver = 'sqlite';
    private static string $dbPath;

    /**
     * Get the database driver type
     */
    public static function getDriver(): string {
        return self::$driver;
    }

    /**
     * Get the singleton PDO instance
     */
    public static function getInstance(): PDO {
        if (self::$instance === null) {
            self::$driver = getenv('DB_DRIVER') ?: 'sqlite';

            if (self::$driver === 'mysql') {
                self::connectMySQL();
            } else {
                self::connectSQLite();
            }
        }

        return self::$instance;
    }

    /**
     * Connect to SQLite database
     */
    private static function connectSQLite(): void {
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
            self::initializeSchema('schema.sql');
        }
    }

    /**
     * Connect to MySQL database
     */
    private static function connectMySQL(): void {
        $host = getenv('DB_HOST') ?: 'localhost';
        $port = getenv('DB_PORT') ?: '3306';
        $dbname = getenv('DB_NAME') ?: 'todo';
        $user = getenv('DB_USER') ?: 'root';
        $pass = getenv('DB_PASS') ?: '';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

        self::$instance = new PDO(
            $dsn,
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ]
        );

        // Check if tables exist, if not initialize schema
        $result = self::$instance->query("SHOW TABLES LIKE 'users'");
        if ($result->fetch() === false) {
            self::initializeSchema('schema-mysql.sql');
        }
    }

    /**
     * Initialize database schema from file
     */
    private static function initializeSchema(string $schemaFile): void {
        $schemaPath = __DIR__ . '/' . $schemaFile;
        if (file_exists($schemaPath)) {
            $schema = file_get_contents($schemaPath);
            // MySQL requires executing statements one at a time
            if (self::$driver === 'mysql') {
                $statements = array_filter(
                    array_map('trim', explode(';', $schema)),
                    fn($s) => !empty($s)
                );
                foreach ($statements as $statement) {
                    self::$instance->exec($statement);
                }
            } else {
                self::$instance->exec($schema);
            }
        }
    }

    /**
     * Get the database file path (SQLite only)
     */
    public static function getDbPath(): string {
        return self::$dbPath ?? __DIR__ . '/../data/todo.db';
    }

    /**
     * Check if database exists and is initialized
     */
    public static function isInitialized(): bool {
        try {
            $db = self::getInstance();
            if (self::$driver === 'mysql') {
                $result = $db->query("SHOW TABLES LIKE 'users'");
            } else {
                $result = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
            }
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
