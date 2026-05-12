//! Shared Kafka client helpers for Tauri commands.

use crate::error::AppError;
use crate::storage::{ClusterConnectionRow, Database};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::metadata::{MetadataBroker, MetadataTopic};
use serde_json::{json, Value};
use std::time::Duration;

/// Shared Kafka timeouts (broker RPC).
pub(crate) const KAFKA_RPC_TIMEOUT: Duration = Duration::from_secs(10);

pub fn map_app_err(e: AppError) -> String {
    e.to_string()
}

pub async fn db_run<T: Send + 'static>(
    db: Database,
    f: impl FnOnce(&Database) -> Result<T, AppError> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(move || f(&db).map_err(map_app_err))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn get_connection_or_err(db: &Database, id: &str) -> Result<ClusterConnectionRow, String> {
    let db = db.clone();
    let id = id.to_string();
    db_run(db, move |database| {
        database
            .get_connection(&id)?
            .ok_or_else(|| AppError::Connection(format!("cluster connection not found: {id}")))
    })
    .await
}

/// Extract `connection` wrapper if present (matches frontend `{ connection: { ... } }`).
pub(crate) fn unwrap_connection_object(v: &Value) -> Result<&Value, String> {
    match v.get("connection") {
        Some(inner) => Ok(inner),
        None => Ok(v),
    }
}

pub(crate) fn parse_jaas_config(jaas: &str) -> Option<(String, String)> {
    let username = jaas_kv(jaas, "username")?;
    let password = jaas_kv(jaas, "password")?;
    Some((username, password))
}

fn jaas_kv(jaas: &str, key: &str) -> Option<String> {
    let needle = format!("{key}=");
    let rest = jaas.split(&needle).nth(1)?;
    let rest = rest.trim_start();
    if rest.starts_with('"') {
        let closing = rest[1..].find('"')?;
        Some(rest[1..closing + 1].to_string())
    } else {
        rest
            .split(|c: char| c.is_whitespace() || c == ';')
            .next()
            .map(|s| s.trim_matches('"').to_string())
            .filter(|s| !s.is_empty())
    }
}

pub fn create_kafka_config(conn: &ClusterConnectionRow) -> ClientConfig {
    let mut config = ClientConfig::new();
    config.set("bootstrap.servers", &conn.bootstrap_servers);
    config.set("client.id", "kafka-desktop-manager");
    config.set("socket.timeout.ms", "10000");
    config.set("metadata.max.age.ms", "900000");

    match conn.security_protocol.as_str() {
        "SASL_SSL" => {
            config.set("security.protocol", "sasl_ssl");
            if let Some(ref mechanism) = conn.sasl_mechanism {
                config.set("sasl.mechanism", mechanism);
            }
            if let Some(ref jaas) = conn.sasl_jaas_config {
                if let Some((user, pass)) = parse_jaas_config(jaas) {
                    config.set("sasl.username", &user);
                    config.set("sasl.password", &pass);
                }
            }
            if let Some(ref ca_path) = conn.ssl_ca_cert_path {
                config.set("ssl.ca.location", ca_path);
            }
            apply_ssl_client_opts(conn, &mut config);
            apply_ssl_hostname_verify(conn, &mut config);
        }
        "SSL" => {
            config.set("security.protocol", "ssl");
            if let Some(ref ca_path) = conn.ssl_ca_cert_path {
                config.set("ssl.ca.location", ca_path);
            }
            apply_ssl_client_opts(conn, &mut config);
            apply_ssl_hostname_verify(conn, &mut config);
        }
        "SASL_PLAINTEXT" => {
            config.set("security.protocol", "sasl_plaintext");
            if let Some(ref mechanism) = conn.sasl_mechanism {
                config.set("sasl.mechanism", mechanism);
            }
            if let Some(ref jaas) = conn.sasl_jaas_config {
                if let Some((user, pass)) = parse_jaas_config(jaas) {
                    config.set("sasl.username", &user);
                    config.set("sasl.password", &pass);
                }
            }
        }
        _ => {
            config.set("security.protocol", "plaintext");
        }
    }

    config
}

fn apply_ssl_hostname_verify(conn: &ClusterConnectionRow, config: &mut ClientConfig) {
    if !conn.ssl_verify_hostname {
        config.set("ssl.endpoint.identification.algorithm", "none");
    }
}

fn apply_ssl_client_opts(conn: &ClusterConnectionRow, config: &mut ClientConfig) {
    if let Some(ref p) = conn.ssl_client_cert_path {
        config.set("ssl.certificate.location", p);
    }
    if let Some(ref p) = conn.ssl_client_key_path {
        config.set("ssl.key.location", p);
    }
    if let Some(ref p) = conn.ssl_client_key_password {
        config.set("ssl.key.password", p);
    }
}

pub fn metadata_overview(metadata: &rdkafka::metadata::Metadata) -> Value {
    let controller_id = metadata.orig_broker_id();
    let brokers_json: Vec<Value> = metadata.brokers().iter().map(|b| {
        json!({
            "id": b.id(),
            "host": b.host(),
            "port": b.port(),
            "is_controller": b.id() == controller_id,
        })
    }).collect();
    let topics = metadata.topics();
    let mut partition_total: usize = 0;
    for t in topics {
        if t.error().is_some() {
            continue;
        }
        partition_total += t.partitions().len();
    }
    json!({
        "broker_count": metadata.brokers().len(),
        "topic_count": topics.len(),
        "partition_count": partition_total,
        "brokers": brokers_json,
    })
}

pub fn fetch_metadata_blocking(
    conn: &ClusterConnectionRow,
) -> Result<rdkafka::metadata::Metadata, String> {
    let mut cfg = create_kafka_config(conn);
    cfg.set("group.id", "kafka-desktop-manager-metadata");
    let consumer: BaseConsumer = cfg.create().map_err(|e| e.to_string())?;
    consumer
        .fetch_metadata(None, KAFKA_RPC_TIMEOUT)
        .map_err(|e| e.to_string())
}

pub fn topic_summaries_blocking(conn: &ClusterConnectionRow) -> Result<Vec<Value>, String> {
    let md = fetch_metadata_blocking(conn)?;
    summarize_topics(&md)
}

fn summarize_topics(metadata: &rdkafka::metadata::Metadata) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    for t in metadata.topics() {
        if let Some(err) = t.error() {
            out.push(topic_row_error(t.name(), format!("{err:?}")));
            continue;
        }
        out.push(topic_row_ok(t));
    }
    Ok(out)
}

fn topic_row_error(name: &str, error: String) -> Value {
    json!({
        "name": name,
        "partition_count": 0,
        "replication_factor": 0,
        "error": error,
    })
}

fn topic_row_ok(t: &MetadataTopic) -> Value {
    let parts = t.partitions();
    let repl = parts
        .first()
        .map(|p| p.replicas().len() as i32)
        .unwrap_or(0);
    json!({
        "name": t.name(),
        "partition_count": parts.len(),
        "replication_factor": repl,
    })
}
