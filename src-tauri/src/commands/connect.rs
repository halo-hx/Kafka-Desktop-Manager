//! Kafka Connect REST API commands.

use crate::commands::kafka_util::get_connection_or_err;
use crate::storage::{ClusterConnectionRow, Database};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::State;
use urlencoding::encode;

enum ConnectHttpMethod {
    Get,
    Post,
    Put,
    Delete,
}

fn normalize_base_url(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return s;
    }
    if !s.starts_with("http://") && !s.starts_with("https://") {
        s = format!("http://{s}");
    }
    while s.ends_with('/') {
        s.pop();
    }
    s
}

pub(crate) fn parse_connect_urls(conn: &ClusterConnectionRow) -> Result<Vec<String>, String> {
    let Some(blob) = &conn.connect_urls else {
        return Err(
            "Please configure Kafka Connect Worker URL(s) in the connection settings first.".into(),
        );
    };
    let t = blob.trim();
    if t.is_empty() {
        return Err(
            "Please configure Kafka Connect Worker URL(s) in the connection settings.".into(),
        );
    }
    let urls: Vec<String> = if t.starts_with('[') {
        serde_json::from_str::<Vec<String>>(t)
            .map_err(|e| format!("Invalid connect_urls JSON: {e}"))?
            .into_iter()
            .map(|u| normalize_base_url(&u))
            .filter(|u| !u.is_empty())
            .collect()
    } else {
        t.lines()
            .flat_map(|line| line.split(','))
            .map(normalize_base_url)
            .filter(|x| !x.is_empty())
            .collect()
    };
    if urls.is_empty() {
        return Err("No valid Connect Worker URL found.".into());
    }
    Ok(urls)
}

fn worker_id_to_display(worker_id: &str, fallback_base: &str) -> String {
    let w = worker_id.trim();
    if w.contains("://") {
        let mut x = w.to_string();
        while x.ends_with('/') {
            x.pop();
        }
        return x;
    }
    if w.is_empty() {
        return fallback_base.to_string();
    }
    format!("http://{w}")
}

fn value_to_config_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn config_value_to_map(config: &Value) -> serde_json::Map<String, Value> {
    let Some(obj) = config.as_object() else {
        return serde_json::Map::new();
    };
    obj.iter()
        .map(|(k, v)| (k.clone(), Value::String(value_to_config_string(v))))
        .collect()
}

async fn connect_request_any(
    bases: &[String],
    path: &str,
    method: ConnectHttpMethod,
    body: Option<Value>,
) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err = "All Connect Workers are unreachable.".to_string();

    for base in bases {
        let url = format!("{base}{path}");
        let req = match method {
            ConnectHttpMethod::Get => client.get(&url),
            ConnectHttpMethod::Post => client.post(&url),
            ConnectHttpMethod::Put => client.put(&url),
            ConnectHttpMethod::Delete => client.delete(&url),
        };
        let req = if let Some(ref b) = body {
            req.json(b)
        } else {
            req
        };

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                let txt = resp.text().await.map_err(|e| e.to_string())?;
                if status.is_success() {
                    return Ok(txt);
                }
                let snippet: String = txt.chars().take(800).collect();
                last_err = format!("Request failed {status} ({url}): {snippet}");
            }
            Err(e) => {
                last_err = format!("{base} → {e}");
            }
        }
    }
    Err(last_err)
}

fn parse_connector_list(v: &Value, default_base: &str) -> Vec<Value> {
    let Some(obj) = v.as_object() else {
        return Vec::new();
    };
    let mut rows: Vec<Value> = Vec::new();
    for (name, entry) in obj {
        let Some(entry_obj) = entry.as_object() else {
            continue;
        };
        if entry_obj.is_empty() && name != "error" {
            continue;
        }
        let status = entry.get("status");
        let info = entry.get("info");
        let typ = status
            .and_then(|s| s.get("type").and_then(|x| x.as_str()))
            .or_else(|| info.and_then(|i| i.get("type").and_then(|x| x.as_str())))
            .unwrap_or("source");
        let typ_norm = if typ.eq_ignore_ascii_case("sink") {
            "sink"
        } else {
            "source"
        };
        let state = status
            .and_then(|s| s.get("connector"))
            .and_then(|c| c.get("state"))
            .and_then(|x| x.as_str())
            .unwrap_or("UNASSIGNED");
        let worker_url = status
            .and_then(|s| s.get("connector"))
            .and_then(|c| c.get("worker_id"))
            .and_then(|x| x.as_str())
            .map(|w| worker_id_to_display(w, default_base))
            .unwrap_or_else(|| default_base.to_string());
        let task_count = status
            .and_then(|s| s.get("tasks"))
            .and_then(|t| t.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        rows.push(json!({
            "name": name,
            "type": typ_norm,
            "state": state,
            "task_count": task_count,
            "worker_url": worker_url,
        }));
    }
    rows.sort_by(|a, b| {
        let an = a.get("name").and_then(|x| x.as_str()).unwrap_or("");
        let bn = b.get("name").and_then(|x| x.as_str()).unwrap_or("");
        an.cmp(bn)
    });
    rows
}

#[tauri::command]
pub async fn list_connectors(
    cluster_id: String,
    db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let body = connect_request_any(
        &bases,
        "/connectors?expand=status&expand=info",
        ConnectHttpMethod::Get,
        None,
    )
    .await?;
    let v: Value = if body.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse Connect response: {e}"))?
    };
    let first_base = bases.first().map(String::as_str).unwrap_or("");
    Ok(parse_connector_list(&v, first_base))
}

#[tauri::command]
pub async fn get_connector_detail(
    cluster_id: String,
    name: String,
    db: State<'_, Database>,
) -> Result<Value, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(name.trim());
    let cfg_body = connect_request_any(
        &bases,
        &format!("/connectors/{enc}"),
        ConnectHttpMethod::Get,
        None,
    )
    .await?;
    let st_body = connect_request_any(
        &bases,
        &format!("/connectors/{enc}/status"),
        ConnectHttpMethod::Get,
        None,
    )
    .await?;

    let cfg_v: Value = serde_json::from_str(&cfg_body).map_err(|e| e.to_string())?;
    let st_v: Value = serde_json::from_str(&st_body).map_err(|e| e.to_string())?;

    let config_obj = cfg_v
        .get("config")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    let config_strings = config_value_to_map(&config_obj);

    let typ = cfg_v
        .get("type")
        .and_then(|x| x.as_str())
        .or_else(|| st_v.get("type").and_then(|x| x.as_str()))
        .unwrap_or("unknown");
    let state = st_v
        .get("connector")
        .and_then(|c| c.get("state"))
        .and_then(|x| x.as_str())
        .unwrap_or("UNASSIGNED");

    let fallback = bases.first().map(String::as_str).unwrap_or("");
    let tasks = st_v
        .get("tasks")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    let mut task_rows = Vec::new();
    for t in tasks {
        let task_id = t.get("id").and_then(|x| x.as_i64()).unwrap_or(-1);
        let tstate = t
            .get("state")
            .and_then(|x| x.as_str())
            .unwrap_or("UNASSIGNED");
        let worker_id = t.get("worker_id").and_then(|x| x.as_str()).unwrap_or("");
        let worker_url = worker_id_to_display(worker_id, fallback);
        let err_msg = t
            .get("trace")
            .and_then(|x| x.as_str())
            .map(String::from)
            .or_else(|| {
                t.get("trace")
                    .and_then(|tr| tr.as_object())
                    .and_then(|o| o.get("message"))
                    .and_then(|m| m.as_str())
                    .map(String::from)
            });
        task_rows.push(json!({
            "task_id": task_id,
            "state": tstate,
            "worker_url": worker_url,
            "error_message": err_msg,
        }));
    }

    let connector_class = config_strings
        .get("connector.class")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let worker_url = st_v
        .get("connector")
        .and_then(|c| c.get("worker_id"))
        .and_then(|x| x.as_str())
        .map(|w| worker_id_to_display(w, fallback))
        .unwrap_or_else(|| fallback.to_string());

    Ok(json!({
        "name": cfg_v.get("name").and_then(|x| x.as_str()).unwrap_or(name.trim()),
        "type": typ,
        "state": state,
        "config": Value::Object(config_strings),
        "tasks": Value::Array(task_rows),
        "uptime_human": Value::Null,
        "connector_class": connector_class,
        "worker_url": worker_url,
    }))
}

#[tauri::command]
pub async fn create_connector(
    cluster_id: String,
    name: String,
    config: Value,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let body = json!({
        "name": name.trim(),
        "config": config,
    });
    connect_request_any(&bases, "/connectors", ConnectHttpMethod::Post, Some(body)).await?;
    Ok(())
}

#[tauri::command]
pub async fn update_connector_config(
    cluster_id: String,
    name: String,
    config: Value,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(name.trim());
    let path = format!("/connectors/{enc}/config");
    connect_request_any(&bases, &path, ConnectHttpMethod::Put, Some(config)).await?;
    Ok(())
}

#[tauri::command]
pub async fn validate_connector_config(
    cluster_id: String,
    connector_class: String,
    config: Value,
    db: State<'_, Database>,
) -> Result<Value, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let class_trim = connector_class.trim();
    if class_trim.is_empty() {
        return Err("Connector class name cannot be empty.".into());
    }
    let enc = encode(class_trim);
    let path = format!("/connector-plugins/{enc}/config/validate");
    let body_txt = connect_request_any(&bases, &path, ConnectHttpMethod::Put, Some(config)).await?;
    if body_txt.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&body_txt).map_err(|e| format!("Failed to parse validation result: {e}"))
}

#[tauri::command]
pub async fn pause_connector(
    cluster_id: String,
    name: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(name.trim());
    connect_request_any(
        &bases,
        &format!("/connectors/{enc}/pause"),
        ConnectHttpMethod::Put,
        None,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn resume_connector(
    cluster_id: String,
    name: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(name.trim());
    connect_request_any(
        &bases,
        &format!("/connectors/{enc}/resume"),
        ConnectHttpMethod::Put,
        None,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn restart_connector(
    cluster_id: String,
    name: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(name.trim());
    connect_request_any(
        &bases,
        &format!("/connectors/{enc}/restart"),
        ConnectHttpMethod::Post,
        None,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_connector(
    cluster_id: String,
    name: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(name.trim());
    connect_request_any(
        &bases,
        &format!("/connectors/{enc}"),
        ConnectHttpMethod::Delete,
        None,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn restart_task(
    cluster_id: String,
    connector: String,
    task_id: i32,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let bases = parse_connect_urls(&conn)?;
    let enc = encode(connector.trim());
    let path = format!("/connectors/{enc}/tasks/{task_id}/restart");
    connect_request_any(&bases, &path, ConnectHttpMethod::Post, None).await?;
    Ok(())
}
