-- Todo App SQLite Schema
-- Run this to create/reset the database

PRAGMA foreign_keys = ON;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                    -- MD5 hash from cookie
    email TEXT,
    personal_list_title TEXT DEFAULT 'My List',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- USER NOTIFICATION PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS user_notification_prefs (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    task_completed INTEGER DEFAULT 0,
    shared_list_updated INTEGER DEFAULT 0,
    new_shared_task INTEGER DEFAULT 0,
    task_assigned INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- USER PUSH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS user_push_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT,
    device_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON user_push_tokens(user_id);

-- ============================================
-- NOTIFICATION RATE LIMITS
-- ============================================
CREATE TABLE IF NOT EXISTS notification_rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_id TEXT,
    last_sent_at INTEGER NOT NULL,
    UNIQUE(user_id, event_type, event_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_event ON notification_rate_limits(user_id, event_type);

-- ============================================
-- SHARED LISTS
-- ============================================
CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,                    -- 8-char hex share ID
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT,
    list_type TEXT DEFAULT 'todo' CHECK(list_type IN ('todo', 'grocery', 'schedule')),
    focus_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_modified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lists_owner ON lists(owner_id);
CREATE INDEX IF NOT EXISTS idx_lists_last_modified ON lists(last_modified_at);

-- ============================================
-- LIST SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS list_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title TEXT,
    url TEXT,
    last_accessed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON list_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_list ON list_subscriptions(list_id);

-- ============================================
-- OWNED LISTS
-- ============================================
CREATE TABLE IF NOT EXISTS owned_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    associated_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_owned_user ON owned_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_owned_user_date ON owned_lists(user_id, associated_date);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    list_id TEXT REFERENCES lists(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    task_date TEXT,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    sticky INTEGER DEFAULT 0,
    scheduled_time TEXT,
    location TEXT,
    location_index INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_sticky ON tasks(user_id, sticky) WHERE sticky = 1;
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date_order ON tasks(user_id, task_date, sort_order);

-- ============================================
-- TASK HISTORY (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK(event_type IN ('completed', 'uncompleted', 'edited', 'sticky_on', 'sticky_off')),
    event_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);

-- ============================================
-- GROCERY STORES
-- ============================================
CREATE TABLE IF NOT EXISTS grocery_stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- STORE PHOTOS
-- ============================================
CREATE TABLE IF NOT EXISTS store_photos (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES grocery_stores(id) ON DELETE CASCADE,
    date_taken TEXT,
    date_added TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_store_photos_store ON store_photos(store_id);

-- ============================================
-- STORE AISLES
-- ============================================
CREATE TABLE IF NOT EXISTS store_aisles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id TEXT NOT NULL REFERENCES grocery_stores(id) ON DELETE CASCADE,
    aisle_number TEXT NOT NULL,
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_store_aisles_store ON store_aisles(store_id);

-- ============================================
-- STORE AISLE ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS store_aisle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aisle_id INTEGER NOT NULL REFERENCES store_aisles(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_aisle_items_aisle ON store_aisle_items(aisle_id);

-- ============================================
-- STORE AISLE PHOTOS
-- ============================================
CREATE TABLE IF NOT EXISTS store_aisle_photos (
    id TEXT PRIMARY KEY,
    aisle_id INTEGER NOT NULL REFERENCES store_aisles(id) ON DELETE CASCADE,
    date_taken TEXT,
    date_added TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_aisle_photos_aisle ON store_aisle_photos(aisle_id);
