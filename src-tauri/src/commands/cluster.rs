use crate::commands::kafka_util::{
    create_kafka_config, db_run, fetch_metadata_blocking, get_connection_or_err, map_app_err,
    metadata_overview, unwrap_connection_object, KAFKA_RPC_TIMEOUT,
};
use crate::storage::{ClusterConnectionRow, Database};
use chrono::Utc;
use rdkafka::admin::AdminClient;
use rdkafka::config::FromClientConfig;
use serde::Deserialize;
use serde_json::{json, Value};
use std::ffi::CString;
use std::time::Instant;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ConnectionSavePatch {
    pub id: Option<String>,
    pub name: Option<String>,
    pub group_id: Option<String>,
    pub bootstrap_servers: Option<String>,
    pub kafka_version: Option<String>,
    pub zookeeper_host: Option<String>,
    pub zookeeper_port: Option<u16>,
    pub zk_chroot_path: Option<String>,
    pub cluster_mode: Option<String>,
    pub security_protocol: Option<String>,
    pub sasl_mechanism: Option<String>,
    pub sasl_jaas_config: Option<String>,
    pub ssl_ca_cert_path: Option<String>,
    pub ssl_client_cert_path: Option<String>,
    pub ssl_client_key_path: Option<String>,
    pub ssl_client_key_password: Option<String>,
    pub ssl_verify_hostname: Option<bool>,
    pub schema_registry_url: Option<String>,
    pub schema_registry_username: Option<String>,
    pub schema_registry_password: Option<String>,
    pub connect_urls: Option<String>,
    pub is_favorite: Option<bool>,
    pub color_tag: Option<String>,
    pub notes: Option<String>,
    pub last_connected_at: Option<String>,
    #[allow(dead_code)]
    pub created_at: Option<String>,
    #[allow(dead_code)]
    pub updated_at: Option<String>,
}

fn new_connection_template(id: String) -> ClusterConnectionRow {
    let now = Utc::now().to_rfc3339();
    ClusterConnectionRow {
        id,
        name: String::new(),
        group_id: None,
        bootstrap_servers: String::new(),
        kafka_version: "3.7".into(),
        zookeeper_host: None,
        zookeeper_port: None,
        zk_chroot_path: None,
        cluster_mode: "AUTO_DETECT".into(),
        security_protocol: "PLAINTEXT".into(),
        sasl_mechanism: None,
        sasl_jaas_config: None,
        ssl_ca_cert_path: None,
        ssl_client_cert_path: None,
        ssl_client_key_path: None,
        ssl_client_key_password: None,
        ssl_verify_hostname: true,
        schema_registry_url: None,
        schema_registry_username: None,
        schema_registry_password: None,
        connect_urls: None,
        created_at: now.clone(),
        updated_at: now,
        last_connected_at: None,
        is_favorite: false,
        color_tag: None,
        notes: None,
    }
}

fn merge_from_patch(
    mut row: ClusterConnectionRow,
    patch: &ConnectionSavePatch,
) -> Result<ClusterConnectionRow, String> {
    if let Some(ref v) = patch.name {
        row.name = v.clone();
    }
    if let Some(ref v) = patch.group_id {
        row.group_id = Some(v.clone());
    }
    if let Some(ref v) = patch.bootstrap_servers {
        row.bootstrap_servers = v.clone();
    }
    if let Some(ref v) = patch.kafka_version {
        row.kafka_version = v.clone();
    }
    if patch.zookeeper_host.is_some() {
        row.zookeeper_host = patch.zookeeper_host.clone();
    }
    if patch.zookeeper_port.is_some() {
        row.zookeeper_port = patch.zookeeper_port;
    }
    if patch.zk_chroot_path.is_some() {
        row.zk_chroot_path = patch.zk_chroot_path.clone();
    }
    if let Some(ref v) = patch.cluster_mode {
        row.cluster_mode = v.clone();
    }
    if let Some(ref v) = patch.security_protocol {
        row.security_protocol = v.clone();
    }
    if patch.sasl_mechanism.is_some() {
        row.sasl_mechanism = patch.sasl_mechanism.clone();
    }
    if patch.sasl_jaas_config.is_some() {
        row.sasl_jaas_config = patch.sasl_jaas_config.clone();
    }
    if patch.ssl_ca_cert_path.is_some() {
        row.ssl_ca_cert_path = patch.ssl_ca_cert_path.clone();
    }
    if patch.ssl_client_cert_path.is_some() {
        row.ssl_client_cert_path = patch.ssl_client_cert_path.clone();
    }
    if patch.ssl_client_key_path.is_some() {
        row.ssl_client_key_path = patch.ssl_client_key_path.clone();
    }
    if patch.ssl_client_key_password.is_some() {
        row.ssl_client_key_password = patch.ssl_client_key_password.clone();
    }
    if let Some(v) = patch.ssl_verify_hostname {
        row.ssl_verify_hostname = v;
    }
    if patch.schema_registry_url.is_some() {
        row.schema_registry_url = patch.schema_registry_url.clone();
    }
    if patch.schema_registry_username.is_some() {
        row.schema_registry_username = patch.schema_registry_username.clone();
    }
    if patch.schema_registry_password.is_some() {
        row.schema_registry_password = patch.schema_registry_password.clone();
    }
    if patch.connect_urls.is_some() {
        row.connect_urls = patch.connect_urls.clone();
    }
    if let Some(v) = patch.is_favorite {
        row.is_favorite = v;
    }
    if patch.color_tag.is_some() {
        row.color_tag = patch.color_tag.clone();
    }
    if patch.notes.is_some() {
        row.notes = patch.notes.clone();
    }
    if patch.last_connected_at.is_some() {
        row.last_connected_at = patch.last_connected_at.clone();
    }
    // created_at only set on insert; patch.created_at ignored for safety

    if row.name.trim().is_empty() {
        return Err("connection name is required".into());
    }
    if row.bootstrap_servers.trim().is_empty() {
        return Err("bootstrap_servers is required".into());
    }

    Ok(row)
}

#[tauri::command]
pub async fn load_connections(db: State<'_, Database>) -> Result<Vec<Value>, String> {
    let db = (*db).clone();
    let rows = db_run(db, |database| database.list_connections()).await?;
    rows.into_iter()
        .map(|row| serde_json::to_value(row).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn save_connection(db: State<'_, Database>, connection: Value) -> Result<String, String> {
    let inner = unwrap_connection_object(&connection)?;
    let patch: ConnectionSavePatch = serde_json::from_value(inner.clone()).map_err(|e| {
        log::error!(
            "[save_connection] deserialize failed: {e}  raw={}",
            serde_json::to_string(inner).unwrap_or_default()
        );
        e.to_string()
    })?;

    let id = patch
        .id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let db_clone = (*db).clone();
    let row = tokio::task::spawn_blocking(move || {
        let existing = db_clone
            .get_connection(&id)
            .map_err(map_app_err)?
            .map(|mut r| {
                r.id = id.clone();
                r
            });

        let base = match existing {
            Some(e) => e,
            None => new_connection_template(id.clone()),
        };

        let mut merged = merge_from_patch(base, &patch)?;
        merged.id = id.clone();
        let now = Utc::now().to_rfc3339();
        merged.updated_at = now;
        if merged.created_at.is_empty() {
            merged.created_at = merged.updated_at.clone();
        }
        db_clone.save_connection(&merged).map_err(map_app_err)?;
        Ok::<ClusterConnectionRow, String>(merged)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(row.id)
}

#[tauri::command]
pub async fn delete_connection(
    db: State<'_, Database>,
    connection_id: String,
) -> Result<(), String> {
    let db = (*db).clone();
    db_run(db, move |database| {
        database.delete_connection(&connection_id)
    })
    .await
}

#[tauri::command]
pub async fn test_connection(connection: Value) -> Result<Value, String> {
    let inner = unwrap_connection_object(&connection)?;
    let patch: ConnectionSavePatch =
        serde_json::from_value(inner.clone()).map_err(|e| e.to_string())?;

    let probe_id = Uuid::new_v4().to_string();
    let template = new_connection_template(probe_id);
    let mut row = merge_from_patch(template, &patch)?;
    if row.name.trim().is_empty() {
        row.name = "connection-test".into();
    }

    let result = tokio::task::spawn_blocking(move || {
        let start = Instant::now();
        let md = fetch_metadata_blocking(&row);
        let elapsed = start.elapsed().as_millis() as u64;
        match md {
            Ok(metadata) => {
                let overview = metadata_overview(&metadata);
                json!({
                    "success": true,
                    "broker_count": overview["broker_count"],
                    "topic_count": overview["topic_count"],
                    "kafka_version": Value::Null,
                    "error_message": Value::Null,
                    "message": "Connection successful",
                    "latency_ms": elapsed,
                })
            }
            Err(e) => json!({
                "success": false,
                "broker_count": Value::Null,
                "topic_count": Value::Null,
                "kafka_version": Value::Null,
                "error_message": e,
                "message": e,
                "latency_ms": elapsed,
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
pub async fn connect_cluster(db: State<'_, Database>, cluster_id: String) -> Result<Value, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;

    let overview = tokio::task::spawn_blocking(move || {
        let metadata = fetch_metadata_blocking(&conn)?;
        Ok::<Value, String>(metadata_overview(&metadata))
    })
    .await
    .map_err(|e| e.to_string())??;

    let db2 = (*db).clone();
    let cid = cluster_id.clone();
    db_run(db2, move |database| database.update_last_connected(&cid)).await?;

    Ok(json!({
        "success": true,
        "cluster_id": cluster_id,
        "overview": overview,
    }))
}

#[tauri::command]
pub async fn disconnect_cluster(_cluster_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_broker_config(
    cluster_id: String,
    broker_id: i32,
    db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let cfg = create_kafka_config(&conn);
        let admin: AdminClient<rdkafka::client::DefaultClientContext> =
            AdminClient::from_config(&cfg).map_err(|e| e.to_string())?;

        unsafe {
            let native_ptr = admin.inner().native_ptr();

            let broker_id_str = broker_id.to_string();
            let c_name = CString::new(broker_id_str.as_str()).map_err(|e| e.to_string())?;
            let resource = rdkafka_sys::rd_kafka_ConfigResource_new(
                rdkafka_sys::rd_kafka_ResourceType_t::RD_KAFKA_RESOURCE_BROKER,
                c_name.as_ptr(),
            );

            let queue = rdkafka_sys::rd_kafka_queue_new(native_ptr);
            let opts = rdkafka_sys::rd_kafka_AdminOptions_new(
                native_ptr,
                rdkafka_sys::rd_kafka_admin_op_t::RD_KAFKA_ADMIN_OP_DESCRIBECONFIGS,
            );
            let timeout_ms = KAFKA_RPC_TIMEOUT.as_millis() as i32;
            let mut err_buf = [0i8; 256];
            rdkafka_sys::rd_kafka_AdminOptions_set_request_timeout(
                opts,
                timeout_ms,
                err_buf.as_mut_ptr(),
                err_buf.len(),
            );

            let mut res_arr = [resource];
            rdkafka_sys::rd_kafka_DescribeConfigs(native_ptr, res_arr.as_mut_ptr(), 1, opts, queue);

            let event = rdkafka_sys::rd_kafka_queue_poll(queue, timeout_ms + 5000);
            let result = if event.is_null() {
                Err("DescribeConfigs timeout".to_string())
            } else {
                let etype = rdkafka_sys::rd_kafka_event_type(event);
                let event_err = rdkafka_sys::rd_kafka_event_error(event);
                if event_err as i32 != 0 {
                    let err_str =
                        std::ffi::CStr::from_ptr(rdkafka_sys::rd_kafka_event_error_string(event))
                            .to_string_lossy()
                            .to_string();
                    Err(format!("DescribeConfigs error: {err_str}"))
                } else if etype != rdkafka_sys::RD_KAFKA_EVENT_DESCRIBECONFIGS_RESULT {
                    Err(format!("Unexpected event type: {etype}"))
                } else {
                    let res = rdkafka_sys::rd_kafka_event_DescribeConfigs_result(event);
                    if res.is_null() {
                        Err("DescribeConfigs result is empty".to_string())
                    } else {
                        let mut res_cnt: usize = 0;
                        let resources = rdkafka_sys::rd_kafka_DescribeConfigs_result_resources(
                            res,
                            &mut res_cnt,
                        );
                        if res_cnt == 0 || resources.is_null() {
                            Ok(vec![])
                        } else {
                            let mut entries = Vec::new();
                            for i in 0..res_cnt {
                                let config_res = *resources.add(i);
                                let res_err =
                                    rdkafka_sys::rd_kafka_ConfigResource_error(config_res);
                                if res_err as i32 != 0 {
                                    continue;
                                }
                                let mut entry_cnt: usize = 0;
                                let config_entries = rdkafka_sys::rd_kafka_ConfigResource_configs(
                                    config_res,
                                    &mut entry_cnt,
                                );
                                if config_entries.is_null() {
                                    continue;
                                }
                                for j in 0..entry_cnt {
                                    let entry = *config_entries.add(j);
                                    let name_ptr = rdkafka_sys::rd_kafka_ConfigEntry_name(entry);
                                    let value_ptr = rdkafka_sys::rd_kafka_ConfigEntry_value(entry);
                                    let is_read_only =
                                        rdkafka_sys::rd_kafka_ConfigEntry_is_read_only(entry) != 0;
                                    let is_default =
                                        rdkafka_sys::rd_kafka_ConfigEntry_is_default(entry) != 0;
                                    let is_sensitive =
                                        rdkafka_sys::rd_kafka_ConfigEntry_is_sensitive(entry) != 0;

                                    let name = if name_ptr.is_null() {
                                        String::new()
                                    } else {
                                        std::ffi::CStr::from_ptr(name_ptr)
                                            .to_string_lossy()
                                            .to_string()
                                    };
                                    let value = if value_ptr.is_null() {
                                        String::new()
                                    } else {
                                        std::ffi::CStr::from_ptr(value_ptr)
                                            .to_string_lossy()
                                            .to_string()
                                    };

                                    entries.push(json!({
                                        "name": name,
                                        "value": value,
                                        "read_only": is_read_only,
                                        "is_default": is_default,
                                        "sensitive": is_sensitive,
                                    }));
                                }
                            }
                            Ok(entries)
                        }
                    }
                }
            };

            if !event.is_null() {
                rdkafka_sys::rd_kafka_event_destroy(event);
            }
            rdkafka_sys::rd_kafka_AdminOptions_destroy(opts);
            rdkafka_sys::rd_kafka_ConfigResource_destroy(resource);
            rdkafka_sys::rd_kafka_queue_destroy(queue);

            result
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Deserialize)]
pub(crate) struct ConfigChange {
    pub name: String,
    pub value: Option<String>,
}

/// 对指定 broker 应用一批配置变更（IncrementalAlterConfigs + SET/DELETE）。
/// - `value = Some("...")` → SET
/// - `value = None`         → DELETE（恢复为 broker 默认值）
#[tauri::command]
pub async fn alter_cluster_configs(
    cluster_id: String,
    broker_id: i32,
    changes: Vec<ConfigChange>,
    db: State<'_, Database>,
) -> Result<(), String> {
    if changes.is_empty() {
        return Ok(());
    }
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let cfg = create_kafka_config(&conn);
        let admin: AdminClient<rdkafka::client::DefaultClientContext> =
            AdminClient::from_config(&cfg).map_err(|e| e.to_string())?;

        unsafe {
            let native_ptr = admin.inner().native_ptr();

            let broker_id_str = broker_id.to_string();
            let c_name = CString::new(broker_id_str.as_str()).map_err(|e| e.to_string())?;
            let resource = rdkafka_sys::rd_kafka_ConfigResource_new(
                rdkafka_sys::rd_kafka_ResourceType_t::RD_KAFKA_RESOURCE_BROKER,
                c_name.as_ptr(),
            );

            // 预先为每个 change 登记增量操作；保留 CString 所有权直到调用完成。
            let mut name_cstrs: Vec<CString> = Vec::with_capacity(changes.len());
            let mut value_cstrs: Vec<Option<CString>> = Vec::with_capacity(changes.len());
            for ch in &changes {
                let name_c = CString::new(ch.name.as_str()).map_err(|e| e.to_string())?;
                let (op, val_c) = match &ch.value {
                    Some(v) => (
                        rdkafka_sys::rd_kafka_AlterConfigOpType_t::RD_KAFKA_ALTER_CONFIG_OP_TYPE_SET,
                        Some(CString::new(v.as_str()).map_err(|e| e.to_string())?),
                    ),
                    None => (
                        rdkafka_sys::rd_kafka_AlterConfigOpType_t::RD_KAFKA_ALTER_CONFIG_OP_TYPE_DELETE,
                        None,
                    ),
                };
                let val_ptr = val_c.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null());
                let err = rdkafka_sys::rd_kafka_ConfigResource_add_incremental_config(
                    resource,
                    name_c.as_ptr(),
                    op,
                    val_ptr,
                );
                name_cstrs.push(name_c);
                value_cstrs.push(val_c);
                if !err.is_null() {
                    let msg = std::ffi::CStr::from_ptr(rdkafka_sys::rd_kafka_error_string(err))
                        .to_string_lossy()
                        .to_string();
                    rdkafka_sys::rd_kafka_error_destroy(err);
                    rdkafka_sys::rd_kafka_ConfigResource_destroy(resource);
                    return Err(format!("add_incremental_config[{}]: {msg}", ch.name));
                }
            }

            let queue = rdkafka_sys::rd_kafka_queue_new(native_ptr);
            let opts = rdkafka_sys::rd_kafka_AdminOptions_new(
                native_ptr,
                rdkafka_sys::rd_kafka_admin_op_t::RD_KAFKA_ADMIN_OP_INCREMENTALALTERCONFIGS,
            );
            let timeout_ms = KAFKA_RPC_TIMEOUT.as_millis() as i32;
            let mut err_buf = [0i8; 256];
            rdkafka_sys::rd_kafka_AdminOptions_set_request_timeout(
                opts,
                timeout_ms,
                err_buf.as_mut_ptr(),
                err_buf.len(),
            );

            let mut res_arr = [resource];
            rdkafka_sys::rd_kafka_IncrementalAlterConfigs(
                native_ptr,
                res_arr.as_mut_ptr(),
                1,
                opts,
                queue,
            );

            let event = rdkafka_sys::rd_kafka_queue_poll(queue, timeout_ms + 5000);
            let result = if event.is_null() {
                Err("IncrementalAlterConfigs timeout".to_string())
            } else {
                let etype = rdkafka_sys::rd_kafka_event_type(event);
                let event_err = rdkafka_sys::rd_kafka_event_error(event);
                if event_err as i32 != 0 {
                    let err_str =
                        std::ffi::CStr::from_ptr(rdkafka_sys::rd_kafka_event_error_string(event))
                            .to_string_lossy()
                            .to_string();
                    Err(format!("IncrementalAlterConfigs error: {err_str}"))
                } else if etype != rdkafka_sys::RD_KAFKA_EVENT_INCREMENTALALTERCONFIGS_RESULT {
                    Err(format!("Unexpected event type: {etype}"))
                } else {
                    let res = rdkafka_sys::rd_kafka_event_IncrementalAlterConfigs_result(event);
                    if res.is_null() {
                        Err("IncrementalAlterConfigs result is empty".to_string())
                    } else {
                        let mut res_cnt: usize = 0;
                        let resources =
                            rdkafka_sys::rd_kafka_IncrementalAlterConfigs_result_resources(
                                res,
                                &mut res_cnt,
                            );
                        let mut last_err: Option<String> = None;
                        if !resources.is_null() {
                            for i in 0..res_cnt {
                                let r = *resources.add(i);
                                let rerr = rdkafka_sys::rd_kafka_ConfigResource_error(r);
                                if rerr as i32 != 0 {
                                    let s = rdkafka_sys::rd_kafka_ConfigResource_error_string(r);
                                    let msg = if s.is_null() {
                                        format!("config resource err code {}", rerr as i32)
                                    } else {
                                        std::ffi::CStr::from_ptr(s).to_string_lossy().to_string()
                                    };
                                    last_err = Some(msg);
                                }
                            }
                        }
                        match last_err {
                            Some(msg) => Err(msg),
                            None => Ok(()),
                        }
                    }
                }
            };

            if !event.is_null() {
                rdkafka_sys::rd_kafka_event_destroy(event);
            }
            rdkafka_sys::rd_kafka_AdminOptions_destroy(opts);
            rdkafka_sys::rd_kafka_ConfigResource_destroy(resource);
            rdkafka_sys::rd_kafka_queue_destroy(queue);
            // 显式持住这些 CString 直到 FFI 调用结束
            drop(name_cstrs);
            drop(value_cstrs);

            result
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Best-effort 拉取指定 broker 的配置键值对，用于集群概览面板的只读展示。
/// 出错时返回空集合，不冲击主流程。需在 `spawn_blocking` 中调用。
pub(crate) fn describe_broker_configs_blocking(
    conn: &ClusterConnectionRow,
    broker_id: i32,
) -> std::collections::BTreeMap<String, String> {
    let mut out: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    let cfg = create_kafka_config(conn);
    let admin: AdminClient<rdkafka::client::DefaultClientContext> =
        match AdminClient::from_config(&cfg) {
            Ok(a) => a,
            Err(e) => {
                log::warn!("[cluster configs] admin client error: {e}");
                return out;
            }
        };
    let c_name = match CString::new(broker_id.to_string()) {
        Ok(s) => s,
        Err(_) => return out,
    };
    unsafe {
        let native_ptr = admin.inner().native_ptr();
        let resource = rdkafka_sys::rd_kafka_ConfigResource_new(
            rdkafka_sys::rd_kafka_ResourceType_t::RD_KAFKA_RESOURCE_BROKER,
            c_name.as_ptr(),
        );
        let queue = rdkafka_sys::rd_kafka_queue_new(native_ptr);
        let opts = rdkafka_sys::rd_kafka_AdminOptions_new(
            native_ptr,
            rdkafka_sys::rd_kafka_admin_op_t::RD_KAFKA_ADMIN_OP_DESCRIBECONFIGS,
        );
        let timeout_ms = KAFKA_RPC_TIMEOUT.as_millis() as i32;
        let mut err_buf = [0i8; 256];
        rdkafka_sys::rd_kafka_AdminOptions_set_request_timeout(
            opts,
            timeout_ms,
            err_buf.as_mut_ptr(),
            err_buf.len(),
        );
        let mut res_arr = [resource];
        rdkafka_sys::rd_kafka_DescribeConfigs(native_ptr, res_arr.as_mut_ptr(), 1, opts, queue);
        let event = rdkafka_sys::rd_kafka_queue_poll(queue, timeout_ms + 5000);
        if !event.is_null() {
            let etype = rdkafka_sys::rd_kafka_event_type(event);
            let event_err = rdkafka_sys::rd_kafka_event_error(event);
            if event_err as i32 == 0 && etype == rdkafka_sys::RD_KAFKA_EVENT_DESCRIBECONFIGS_RESULT
            {
                let res = rdkafka_sys::rd_kafka_event_DescribeConfigs_result(event);
                if !res.is_null() {
                    let mut res_cnt: usize = 0;
                    let resources =
                        rdkafka_sys::rd_kafka_DescribeConfigs_result_resources(res, &mut res_cnt);
                    if !resources.is_null() {
                        for i in 0..res_cnt {
                            let config_res = *resources.add(i);
                            if rdkafka_sys::rd_kafka_ConfigResource_error(config_res) as i32 != 0 {
                                continue;
                            }
                            let mut entry_cnt: usize = 0;
                            let entries_ptr = rdkafka_sys::rd_kafka_ConfigResource_configs(
                                config_res,
                                &mut entry_cnt,
                            );
                            if entries_ptr.is_null() {
                                continue;
                            }
                            for j in 0..entry_cnt {
                                let entry = *entries_ptr.add(j);
                                let name_ptr = rdkafka_sys::rd_kafka_ConfigEntry_name(entry);
                                let value_ptr = rdkafka_sys::rd_kafka_ConfigEntry_value(entry);
                                let sensitive =
                                    rdkafka_sys::rd_kafka_ConfigEntry_is_sensitive(entry) != 0;
                                if name_ptr.is_null() {
                                    continue;
                                }
                                let name = std::ffi::CStr::from_ptr(name_ptr)
                                    .to_string_lossy()
                                    .to_string();
                                if name.is_empty() {
                                    continue;
                                }
                                let value = if sensitive {
                                    "******".to_string()
                                } else if value_ptr.is_null() {
                                    String::new()
                                } else {
                                    std::ffi::CStr::from_ptr(value_ptr)
                                        .to_string_lossy()
                                        .to_string()
                                };
                                out.insert(name, value);
                            }
                        }
                    }
                }
            } else {
                log::warn!(
                    "[cluster configs] event type={etype} err_code={}",
                    event_err as i32
                );
            }
            rdkafka_sys::rd_kafka_event_destroy(event);
        } else {
            log::warn!("[cluster configs] describe timeout for broker {broker_id}");
        }
        rdkafka_sys::rd_kafka_AdminOptions_destroy(opts);
        rdkafka_sys::rd_kafka_ConfigResource_destroy(resource);
        rdkafka_sys::rd_kafka_queue_destroy(queue);
    }
    out
}
