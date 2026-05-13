//! Confluent Schema Registry REST client (HTTP, not Kafka protocol).

use crate::commands::kafka_util::get_connection_or_err;
use crate::storage::ClusterConnectionRow;
use crate::storage::Database;
use futures::future::join_all;
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::State;
use urlencoding::encode;

const SR_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSubjectInfoOut {
    pub subject: String,
    pub schema_type: String,
    pub latest_version: i32,
    /// Number of registered versions (displayed in the "Versions" column)
    pub version_count: i32,
    pub compatibility_level: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDetailOut {
    pub subject: String,
    pub version: i32,
    pub id: i32,
    pub schema_type: String,
    pub schema: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub references: Option<Vec<SchemaReferenceOut>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaReferenceOut {
    pub name: String,
    pub subject: String,
    pub version: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityResultOut {
    pub is_compatible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<String>>,
}

fn schema_registry_base(conn: &ClusterConnectionRow) -> Result<String, String> {
    conn.schema_registry_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_end_matches('/').to_string())
        .ok_or_else(|| "Schema Registry URL is not configured".to_string())
}

fn build_client(conn: &ClusterConnectionRow) -> Result<Client, String> {
    use base64::Engine;
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};

    let mut headers = HeaderMap::new();
    if let (Some(user), Some(pass)) = (
        conn.schema_registry_username.as_deref(),
        conn.schema_registry_password.as_deref(),
    ) {
        if !user.is_empty() {
            let encoded =
                base64::engine::general_purpose::STANDARD.encode(format!("{user}:{pass}"));
            if let Ok(val) = HeaderValue::from_str(&format!("Basic {encoded}")) {
                headers.insert(AUTHORIZATION, val);
            }
        }
    }
    Client::builder()
        .timeout(SR_TIMEOUT)
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

async fn read_error_body(resp: reqwest::Response) -> String {
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if let Ok(v) = serde_json::from_str::<Value>(&text) {
        if let Some(m) = v.get("message").and_then(|x| x.as_str()) {
            return format!("HTTP {status}: {m}");
        }
    }
    if text.is_empty() {
        format!("HTTP {status}")
    } else {
        format!("HTTP {status}: {text}")
    }
}

async fn get_json(client: &Client, url: &str) -> Result<Value, String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error_body(resp).await);
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

async fn post_json(client: &Client, url: &str, body: &Value) -> Result<Value, String> {
    let resp = client
        .post(url)
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error_body(resp).await);
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

async fn put_json_no_body(client: &Client, url: &str, body: &Value) -> Result<(), String> {
    let resp = client
        .put(url)
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error_body(resp).await);
    }
    Ok(())
}

fn json_string_field(v: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|k| v.get(*k)?.as_str().map(|s| s.to_string()))
}

fn json_i32(v: &Value, keys: &[&str]) -> Option<i32> {
    keys.iter()
        .find_map(|k| v.get(*k)?.as_i64().and_then(|n| i32::try_from(n).ok()))
}

async fn fetch_global_compat(client: &Client, base: &str) -> String {
    let url = format!("{base}/config");
    match get_json(client, &url).await {
        Ok(v) => json_string_field(&v, &["compatibilityLevel", "compatibility"])
            .unwrap_or_else(|| "UNKNOWN".into()),
        Err(_) => "UNKNOWN".into(),
    }
}

async fn fetch_subject_compat(client: &Client, base: &str, subject: &str) -> String {
    let url = format!("{base}/config/{}", encode(subject));
    match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => match r.json::<Value>().await {
            Ok(v) => json_string_field(&v, &["compatibilityLevel", "compatibility"])
                .unwrap_or_else(|| "UNKNOWN".into()),
            Err(_) => "UNKNOWN".into(),
        },
        Ok(r) if r.status().as_u16() == 404 => fetch_global_compat(client, base).await,
        _ => fetch_global_compat(client, base).await,
    }
}

async fn assemble_subject_info(
    client: Client,
    base: String,
    subject: String,
) -> Result<SchemaSubjectInfoOut, String> {
    let versions_url = format!("{}/subjects/{}/versions", base, encode(&subject));
    let versions_val = match get_json(&client, &versions_url).await {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[schema] versions for {subject}: {e}");
            return Ok(SchemaSubjectInfoOut {
                subject,
                schema_type: "AVRO".to_string(),
                latest_version: 0,
                version_count: 0,
                compatibility_level: "UNKNOWN".to_string(),
                last_updated: None,
            });
        }
    };

    let version_nums: Vec<i32> = versions_val
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_i64().and_then(|n| i32::try_from(n).ok()))
                .collect()
        })
        .unwrap_or_default();

    let version_count = version_nums.len() as i32;
    let compatibility_level = fetch_subject_compat(&client, &base, &subject).await;

    if version_nums.is_empty() {
        return Ok(SchemaSubjectInfoOut {
            subject,
            schema_type: "AVRO".into(),
            latest_version: 0,
            version_count: 0,
            compatibility_level,
            last_updated: None,
        });
    }

    let latest_url = format!("{}/subjects/{}/versions/latest", base, encode(&subject));
    let latest = get_json(&client, &latest_url).await?;

    let schema_type =
        json_string_field(&latest, &["schemaType", "schema_type"]).unwrap_or_else(|| "AVRO".into());
    let latest_version = json_i32(&latest, &["version"])
        .unwrap_or_else(|| version_nums.iter().copied().max().unwrap_or(1));

    Ok(SchemaSubjectInfoOut {
        subject,
        schema_type,
        latest_version,
        version_count,
        compatibility_level,
        last_updated: None,
    })
}

#[tauri::command]
pub async fn list_subjects(
    cluster_id: String,
    db: State<'_, Database>,
) -> Result<Vec<SchemaSubjectInfoOut>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;

    let list_url = format!("{base}/subjects");
    let arr = get_json(&client, &list_url).await?;
    let subjects: Vec<String> = arr
        .as_array()
        .ok_or_else(|| "Invalid response from Schema Registry /subjects".to_string())?
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.to_string()))
        .collect();

    let futs = subjects.into_iter().map(|subject| {
        let c = client.clone();
        let b = base.clone();
        async move { assemble_subject_info(c, b, subject).await }
    });

    let mut rows = join_all(futs)
        .await
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    rows.sort_by(|a, b| a.subject.cmp(&b.subject));
    Ok(rows)
}

#[tauri::command]
pub async fn list_schema_versions(
    cluster_id: String,
    subject: String,
    db: State<'_, Database>,
) -> Result<Vec<i32>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;
    let url = format!("{}/subjects/{}/versions", base, encode(&subject));
    let v = get_json(&client, &url).await?;
    let mut nums: Vec<i32> = v
        .as_array()
        .ok_or_else(|| "Invalid version list format".to_string())?
        .iter()
        .filter_map(|x| x.as_i64().and_then(|n| i32::try_from(n).ok()))
        .collect();
    nums.sort_unstable();
    Ok(nums)
}

fn value_to_schema_detail(subject: &str, v: &Value) -> Result<SchemaDetailOut, String> {
    let version = json_i32(v, &["version"]).ok_or_else(|| "Missing 'version' field".to_string())?;
    let id = json_i32(v, &["id"]).ok_or_else(|| "Missing 'id' field".to_string())?;
    let schema_type =
        json_string_field(v, &["schemaType", "schema_type"]).unwrap_or_else(|| "AVRO".into());
    let schema = v
        .get("schema")
        .and_then(|s| s.as_str())
        .ok_or_else(|| "Missing 'schema' field".to_string())?
        .to_string();

    let references = v.get("references").and_then(|r| r.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|refv| {
                Some(SchemaReferenceOut {
                    name: json_string_field(refv, &["name"])?,
                    subject: json_string_field(refv, &["subject"])?,
                    version: json_i32(refv, &["version"])?,
                })
            })
            .collect::<Vec<_>>()
    });

    Ok(SchemaDetailOut {
        subject: subject.to_string(),
        version,
        id,
        schema_type,
        schema,
        references: references.filter(|r| !r.is_empty()),
    })
}

#[tauri::command]
pub async fn get_schema(
    cluster_id: String,
    subject: String,
    version: String,
    db: State<'_, Database>,
) -> Result<SchemaDetailOut, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;
    let ver_enc = encode(&version);
    let url = format!(
        "{}/subjects/{}/versions/{}",
        base,
        encode(&subject),
        ver_enc
    );
    let v = get_json(&client, &url).await?;
    value_to_schema_detail(&subject, &v)
}

#[tauri::command]
pub async fn register_schema(
    cluster_id: String,
    subject: String,
    schema_type: String,
    schema: String,
    db: State<'_, Database>,
) -> Result<Value, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;
    let url = format!("{}/subjects/{}/versions", base, encode(&subject));
    let body = json!({
        "schemaType": schema_type,
        "schema": schema,
    });
    post_json(&client, &url, &body).await
}

#[tauri::command]
pub async fn check_compatibility(
    cluster_id: String,
    subject: String,
    schema: String,
    db: State<'_, Database>,
) -> Result<CompatibilityResultOut, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;
    let url = format!(
        "{}/compatibility/subjects/{}/versions/latest",
        base,
        encode(&subject)
    );
    let body = json!({ "schema": schema });
    let v = post_json(&client, &url, &body).await?;

    let is_compatible = v
        .get("is_compatible")
        .and_then(|x| x.as_bool())
        .or_else(|| v.get("isCompatible").and_then(|x| x.as_bool()))
        .unwrap_or(false);

    let messages = v
        .get("messages")
        .and_then(|m| m.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .filter(|m| !m.is_empty());

    Ok(CompatibilityResultOut {
        is_compatible,
        messages,
    })
}

#[tauri::command]
pub async fn set_compatibility(
    cluster_id: String,
    subject: String,
    level: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;
    let url = format!("{}/config/{}", base, encode(&subject));
    let body = json!({ "compatibility": level });
    put_json_no_body(&client, &url, &body).await
}

#[tauri::command]
pub async fn get_subject_compatibility(
    cluster_id: String,
    subject: String,
    db: State<'_, Database>,
) -> Result<String, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let base = schema_registry_base(&conn)?;
    let client = build_client(&conn)?;
    Ok(fetch_subject_compat(&client, &base, &subject).await)
}
