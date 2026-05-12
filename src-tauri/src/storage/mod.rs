//! Persistent SQLite storage (cluster connections, groups, settings, and related tables).

mod connection_repo;
mod settings_repo;

pub use connection_repo::{ClusterConnectionRow, ConnectionGroupRow};
pub use settings_repo::AppSettingsRow;

use crate::error::AppError;
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{Manager, Runtime};

/// Thread-safe wrapper around [`rusqlite::Connection`].
#[derive(Clone)]
pub struct Database {
    inner: Arc<Mutex<Connection>>,
}

const SCHEMA_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS connection_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    FOREIGN KEY (parent_id) REFERENCES connection_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cluster_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_id TEXT,
    bootstrap_servers TEXT NOT NULL,
    kafka_version TEXT NOT NULL DEFAULT '3.7',
    zookeeper_host TEXT,
    zookeeper_port INTEGER,
    zk_chroot_path TEXT,
    cluster_mode TEXT NOT NULL DEFAULT 'AUTO_DETECT',
    security_protocol TEXT NOT NULL DEFAULT 'PLAINTEXT',
    sasl_mechanism TEXT,
    sasl_jaas_config TEXT,
    ssl_ca_cert_path TEXT,
    ssl_client_cert_path TEXT,
    ssl_client_key_path TEXT,
    ssl_client_key_password TEXT,
    ssl_verify_hostname INTEGER NOT NULL DEFAULT 1,
    schema_registry_url TEXT,
    schema_registry_username TEXT,
    schema_registry_password TEXT,
    connect_urls TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_connected_at TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    color_tag TEXT,
    notes TEXT,
    FOREIGN KEY (group_id) REFERENCES connection_groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topic_folders (
    id TEXT PRIMARY KEY,
    cluster_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topic_folder_items (
    cluster_id TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    PRIMARY KEY (cluster_id, topic_name),
    FOREIGN KEY (folder_id) REFERENCES topic_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    cluster_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (resource_type, resource_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic_pattern TEXT,
    key_format TEXT NOT NULL DEFAULT 'String',
    key_content TEXT,
    value_format TEXT NOT NULL DEFAULT 'String',
    value_content TEXT,
    headers TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"#;

impl Database {
    /// Opens or creates a database file at `path`.
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path).map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(Self {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Creates an in-memory database (useful for testing).
    pub fn new_in_memory() -> Result<Self, AppError> {
        let conn =
            Connection::open_in_memory().map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(Self {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Applies schema / migrations (idempotent `CREATE TABLE IF NOT EXISTS`).
    pub fn init_tables(&self) -> Result<(), AppError> {
        let db = self
            .inner
            .lock()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        db.execute_batch(SCHEMA_SQL)
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub(crate) fn with_conn<T, F>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&Connection) -> Result<T, AppError>,
    {
        let db = self
            .inner
            .lock()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        f(&db)
    }
}

/// Resolves the app data directory, ensures it exists, opens the DB, and runs [`Database::init_tables`].
pub fn open_database_for_app<M: Manager<R>, R: Runtime>(app: &M) -> Result<Database, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(AppError::Io)?;
    let db_path = dir.join("kafka_manager.sqlite");
    let db = Database::new(&db_path)?;
    db.init_tables()?;
    Ok(db)
}
