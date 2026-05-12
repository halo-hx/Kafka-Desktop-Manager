use super::Database;
use crate::error::AppError;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ClusterConnectionRow {
    pub id: String,
    pub name: String,
    pub group_id: Option<String>,
    pub bootstrap_servers: String,
    pub kafka_version: String,
    pub zookeeper_host: Option<String>,
    pub zookeeper_port: Option<u16>,
    pub zk_chroot_path: Option<String>,
    pub cluster_mode: String,
    pub security_protocol: String,
    pub sasl_mechanism: Option<String>,
    pub sasl_jaas_config: Option<String>,
    pub ssl_ca_cert_path: Option<String>,
    pub ssl_client_cert_path: Option<String>,
    pub ssl_client_key_path: Option<String>,
    pub ssl_client_key_password: Option<String>,
    pub ssl_verify_hostname: bool,
    pub schema_registry_url: Option<String>,
    pub schema_registry_username: Option<String>,
    pub schema_registry_password: Option<String>,
    pub connect_urls: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_connected_at: Option<String>,
    pub is_favorite: bool,
    pub color_tag: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConnectionGroupRow {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub parent_id: Option<String>,
}

fn row_to_connection(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClusterConnectionRow> {
    let ssl_v: i64 = row.get(14)?;
    Ok(ClusterConnectionRow {
        id: row.get(0)?,
        name: row.get(1)?,
        group_id: row.get(2)?,
        bootstrap_servers: row.get(3)?,
        kafka_version: row.get(4)?,
        zookeeper_host: row.get(5)?,
        zookeeper_port: row
            .get::<_, Option<i64>>(6)?
            .and_then(|p| u16::try_from(p).ok()),
        zk_chroot_path: row.get(7)?,
        cluster_mode: row.get(8)?,
        security_protocol: row.get(9)?,
        sasl_mechanism: row.get(10)?,
        sasl_jaas_config: row.get(11)?,
        ssl_ca_cert_path: row.get(12)?,
        ssl_client_cert_path: row.get(13)?,
        ssl_client_key_path: row.get(15)?,
        ssl_client_key_password: row.get(16)?,
        ssl_verify_hostname: ssl_v != 0,
        schema_registry_url: row.get(17)?,
        schema_registry_username: row.get(18)?,
        schema_registry_password: row.get(19)?,
        connect_urls: row.get(20)?,
        created_at: row.get(21)?,
        updated_at: row.get(22)?,
        last_connected_at: row.get(23)?,
        is_favorite: row.get::<_, i64>(24)? != 0,
        color_tag: row.get(25)?,
        notes: row.get(26)?,
    })
}

impl Database {
    pub fn save_connection(&self, conn: &ClusterConnectionRow) -> Result<(), AppError> {
        let ssl_v: i64 = if conn.ssl_verify_hostname { 1 } else { 0 };
        let fav: i64 = if conn.is_favorite { 1 } else { 0 };
        self.with_conn(|db| {
            db.execute(
                r#"
                INSERT INTO cluster_connections (
                    id, name, group_id, bootstrap_servers, kafka_version,
                    zookeeper_host, zookeeper_port, zk_chroot_path, cluster_mode, security_protocol,
                    sasl_mechanism, sasl_jaas_config, ssl_ca_cert_path, ssl_client_cert_path,
                    ssl_verify_hostname, ssl_client_key_path, ssl_client_key_password,
                    schema_registry_url, schema_registry_username, schema_registry_password,
                    connect_urls, created_at, updated_at, last_connected_at,
                    is_favorite, color_tag, notes
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                    ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
                    ?21, ?22, ?23, ?24, ?25, ?26, ?27
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    group_id = excluded.group_id,
                    bootstrap_servers = excluded.bootstrap_servers,
                    kafka_version = excluded.kafka_version,
                    zookeeper_host = excluded.zookeeper_host,
                    zookeeper_port = excluded.zookeeper_port,
                    zk_chroot_path = excluded.zk_chroot_path,
                    cluster_mode = excluded.cluster_mode,
                    security_protocol = excluded.security_protocol,
                    sasl_mechanism = excluded.sasl_mechanism,
                    sasl_jaas_config = excluded.sasl_jaas_config,
                    ssl_ca_cert_path = excluded.ssl_ca_cert_path,
                    ssl_client_cert_path = excluded.ssl_client_cert_path,
                    ssl_verify_hostname = excluded.ssl_verify_hostname,
                    ssl_client_key_path = excluded.ssl_client_key_path,
                    ssl_client_key_password = excluded.ssl_client_key_password,
                    schema_registry_url = excluded.schema_registry_url,
                    schema_registry_username = excluded.schema_registry_username,
                    schema_registry_password = excluded.schema_registry_password,
                    connect_urls = excluded.connect_urls,
                    updated_at = excluded.updated_at,
                    last_connected_at = excluded.last_connected_at,
                    is_favorite = excluded.is_favorite,
                    color_tag = excluded.color_tag,
                    notes = excluded.notes,
                    created_at = cluster_connections.created_at
                "#,
                params![
                    conn.id,
                    conn.name,
                    conn.group_id,
                    conn.bootstrap_servers,
                    conn.kafka_version,
                    conn.zookeeper_host,
                    conn.zookeeper_port.map(|p| p as i64),
                    conn.zk_chroot_path,
                    conn.cluster_mode,
                    conn.security_protocol,
                    conn.sasl_mechanism,
                    conn.sasl_jaas_config,
                    conn.ssl_ca_cert_path,
                    conn.ssl_client_cert_path,
                    ssl_v,
                    conn.ssl_client_key_path,
                    conn.ssl_client_key_password,
                    conn.schema_registry_url,
                    conn.schema_registry_username,
                    conn.schema_registry_password,
                    conn.connect_urls,
                    conn.created_at,
                    conn.updated_at,
                    conn.last_connected_at,
                    fav,
                    conn.color_tag,
                    conn.notes,
                ],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(())
        })
    }

    pub fn get_connection(&self, id: &str) -> Result<Option<ClusterConnectionRow>, AppError> {
        self.with_conn(|db| {
            let row = db
                .query_row(
                    r#"
                    SELECT
                        id, name, group_id, bootstrap_servers, kafka_version,
                        zookeeper_host, zookeeper_port, zk_chroot_path, cluster_mode, security_protocol,
                        sasl_mechanism, sasl_jaas_config, ssl_ca_cert_path, ssl_client_cert_path,
                        ssl_verify_hostname, ssl_client_key_path, ssl_client_key_password,
                        schema_registry_url, schema_registry_username, schema_registry_password,
                        connect_urls, created_at, updated_at, last_connected_at,
                        is_favorite, color_tag, notes
                    FROM cluster_connections WHERE id = ?1
                    "#,
                    params![id],
                    row_to_connection,
                )
                .optional()
                .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(row)
        })
    }

    pub fn list_connections(&self) -> Result<Vec<ClusterConnectionRow>, AppError> {
        self.with_conn(|db| {
            let mut stmt = db
                .prepare(
                    r#"
                    SELECT
                        id, name, group_id, bootstrap_servers, kafka_version,
                        zookeeper_host, zookeeper_port, zk_chroot_path, cluster_mode, security_protocol,
                        sasl_mechanism, sasl_jaas_config, ssl_ca_cert_path, ssl_client_cert_path,
                        ssl_verify_hostname, ssl_client_key_path, ssl_client_key_password,
                        schema_registry_url, schema_registry_username, schema_registry_password,
                        connect_urls, created_at, updated_at, last_connected_at,
                        is_favorite, color_tag, notes
                    FROM cluster_connections
                    ORDER BY is_favorite DESC, name COLLATE NOCASE ASC
                    "#,
                )
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let rows = stmt
                .query_map([], row_to_connection)
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r.map_err(|e| AppError::Storage(e.to_string()))?);
            }
            Ok(out)
        })
    }

    pub fn delete_connection(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|db| {
            db.execute("DELETE FROM cluster_connections WHERE id = ?1", params![id])
                .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(())
        })
    }

    pub fn save_group(&self, group: &ConnectionGroupRow) -> Result<(), AppError> {
        self.with_conn(|db| {
            db.execute(
                r#"
                INSERT INTO connection_groups (id, name, sort_order, parent_id)
                VALUES (?1, ?2, ?3, ?4)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    sort_order = excluded.sort_order,
                    parent_id = excluded.parent_id
                "#,
                params![group.id, group.name, group.sort_order, group.parent_id],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(())
        })
    }

    pub fn list_groups(&self) -> Result<Vec<ConnectionGroupRow>, AppError> {
        self.with_conn(|db| {
            let mut stmt = db
                .prepare(
                    "SELECT id, name, sort_order, parent_id FROM connection_groups ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
                )
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(ConnectionGroupRow {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        sort_order: row.get(2)?,
                        parent_id: row.get(3)?,
                    })
                })
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r.map_err(|e| AppError::Storage(e.to_string()))?);
            }
            Ok(out)
        })
    }

    pub fn delete_group(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|db| {
            db.execute("DELETE FROM connection_groups WHERE id = ?1", params![id])
                .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(())
        })
    }

    pub fn update_favorite(&self, id: &str, is_favorite: bool) -> Result<(), AppError> {
        let fav: i64 = if is_favorite { 1 } else { 0 };
        let now = Utc::now().to_rfc3339();
        self.with_conn(|db| {
            let n = db
                .execute(
                    "UPDATE cluster_connections SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
                    params![fav, now, id],
                )
                .map_err(|e| AppError::Storage(e.to_string()))?;
            if n == 0 {
                return Err(AppError::Storage(format!(
                    "no cluster connection found with id {}",
                    id
                )));
            }
            Ok(())
        })
    }

    pub fn update_color_tag(&self, id: &str, color_tag: Option<&str>) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        self.with_conn(|db| {
            let n = db
                .execute(
                    "UPDATE cluster_connections SET color_tag = ?1, updated_at = ?2 WHERE id = ?3",
                    params![color_tag, now, id],
                )
                .map_err(|e| AppError::Storage(e.to_string()))?;
            if n == 0 {
                return Err(AppError::Storage(format!(
                    "no cluster connection found with id {}",
                    id
                )));
            }
            Ok(())
        })
    }

    pub fn update_last_connected(&self, id: &str) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        self.with_conn(|db| {
            let n = db
                .execute(
                    "UPDATE cluster_connections SET last_connected_at = ?1, updated_at = ?2 WHERE id = ?3",
                    params![now, now, id],
                )
                .map_err(|e| AppError::Storage(e.to_string()))?;
            if n == 0 {
                return Err(AppError::Storage(format!(
                    "no cluster connection found with id {}",
                    id
                )));
            }
            Ok(())
        })
    }
}
