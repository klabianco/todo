-- Todo App MySQL Schema
-- Run this to create/reset the database

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,              -- MD5 hash from cookie
    email VARCHAR(255),
    personal_list_title VARCHAR(255) DEFAULT 'My List',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER NOTIFICATION PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS user_notification_prefs (
    user_id VARCHAR(64) PRIMARY KEY,
    task_completed TINYINT DEFAULT 0,
    shared_list_updated TINYINT DEFAULT 0,
    new_shared_task TINYINT DEFAULT 0,
    task_assigned TINYINT DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER PUSH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS user_push_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    token VARCHAR(512) NOT NULL,
    platform VARCHAR(50),
    device_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_token (user_id, token(255)),
    INDEX idx_push_tokens_user (user_id),
    CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NOTIFICATION RATE LIMITS
-- ============================================
CREATE TABLE IF NOT EXISTS notification_rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255),
    last_sent_at INT NOT NULL,
    UNIQUE KEY unique_rate_limit (user_id, event_type, event_id(100)),
    INDEX idx_rate_limits_user_event (user_id, event_type),
    CONSTRAINT fk_rate_limits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SHARED LISTS
-- ============================================
CREATE TABLE IF NOT EXISTS lists (
    id VARCHAR(64) PRIMARY KEY,              -- 8-char hex share ID
    owner_id VARCHAR(64),
    title VARCHAR(255),
    list_type ENUM('todo', 'grocery', 'schedule') DEFAULT 'todo',
    focus_id VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_lists_owner (owner_id),
    INDEX idx_lists_last_modified (last_modified_at),
    CONSTRAINT fk_lists_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LIST SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS list_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    list_id VARCHAR(64) NOT NULL,
    title VARCHAR(255),
    url VARCHAR(512),
    last_accessed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_subscription (user_id, list_id),
    INDEX idx_subscriptions_user (user_id),
    INDEX idx_subscriptions_list (list_id),
    CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_subscriptions_list FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- OWNED LISTS
-- ============================================
CREATE TABLE IF NOT EXISTS owned_lists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    list_id VARCHAR(64) NOT NULL,
    associated_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_owned (user_id, list_id),
    INDEX idx_owned_user (user_id),
    INDEX idx_owned_user_date (user_id, associated_date),
    CONSTRAINT fk_owned_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_owned_list FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    list_id VARCHAR(64),
    user_id VARCHAR(64),
    task_date DATE,
    parent_id VARCHAR(64),
    text TEXT NOT NULL,
    completed TINYINT DEFAULT 0,
    sticky TINYINT DEFAULT 0,
    scheduled_time VARCHAR(50),
    location VARCHAR(255),
    location_index INT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tasks_list (list_id),
    INDEX idx_tasks_user_date (user_id, task_date),
    INDEX idx_tasks_user_sticky (user_id, sticky),
    INDEX idx_tasks_parent (parent_id),
    INDEX idx_tasks_list_order (list_id, sort_order),
    INDEX idx_tasks_user_date_order (user_id, task_date, sort_order),
    CONSTRAINT fk_tasks_list FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_parent FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TASK HISTORY (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS task_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    event_type ENUM('completed', 'uncompleted', 'edited', 'sticky_on', 'sticky_off') NOT NULL,
    event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_history_task (task_id),
    CONSTRAINT fk_task_history_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- GROCERY STORES
-- ============================================
CREATE TABLE IF NOT EXISTS grocery_stores (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    phone VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STORE PHOTOS
-- ============================================
CREATE TABLE IF NOT EXISTS store_photos (
    id VARCHAR(64) PRIMARY KEY,
    store_id VARCHAR(64) NOT NULL,
    date_taken TIMESTAMP NULL,
    date_added TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_store_photos_store (store_id),
    CONSTRAINT fk_store_photos_store FOREIGN KEY (store_id) REFERENCES grocery_stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STORE AISLES
-- ============================================
CREATE TABLE IF NOT EXISTS store_aisles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    store_id VARCHAR(64) NOT NULL,
    aisle_number VARCHAR(50) NOT NULL,
    category VARCHAR(255),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_store_aisles_store (store_id),
    CONSTRAINT fk_store_aisles_store FOREIGN KEY (store_id) REFERENCES grocery_stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STORE AISLE ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS store_aisle_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    aisle_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0,
    INDEX idx_aisle_items_aisle (aisle_id),
    CONSTRAINT fk_aisle_items_aisle FOREIGN KEY (aisle_id) REFERENCES store_aisles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STORE AISLE PHOTOS
-- ============================================
CREATE TABLE IF NOT EXISTS store_aisle_photos (
    id VARCHAR(64) PRIMARY KEY,
    aisle_id INT NOT NULL,
    date_taken TIMESTAMP NULL,
    date_added TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_aisle_photos_aisle (aisle_id),
    CONSTRAINT fk_aisle_photos_aisle FOREIGN KEY (aisle_id) REFERENCES store_aisles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
