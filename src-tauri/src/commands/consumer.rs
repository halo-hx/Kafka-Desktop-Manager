use crate::commands::kafka_util::{create_kafka_config, get_connection_or_err, KAFKA_RPC_TIMEOUT};
use crate::storage::Database;
use rdkafka::admin::{AdminClient, AdminOptions};
use rdkafka::config::FromClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::groups::GroupInfo;
use rdkafka::Offset;
use rdkafka::TopicPartitionList;
use serde_json::{json, Value};
use tauri::State;

/// Safely read member count. `GroupInfo::members()` in rdkafka 0.36 calls
/// `slice::from_raw_parts(ptr, cnt)` where ptr can be null when cnt == 0,
/// which is UB detected by Rust debug builds and causes a process abort.
/// We transmute to the underlying C struct to check for null first.
fn safe_member_count(g: &GroupInfo) -> usize {
    let raw = g as *const GroupInfo as *const rdkafka_sys::rd_kafka_group_info;
    unsafe {
        let info = &*raw;
        if info.members.is_null() {
            0
        } else {
            info.member_cnt as usize
        }
    }
}

#[tauri::command]
pub async fn load_consumer_groups(
    cluster_id: String,
    db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let mut cfg = create_kafka_config(&conn);
        cfg.set("group.id", "kafka-desktop-manager-list-groups");

        let consumer: BaseConsumer = cfg.create().map_err(|e| e.to_string())?;
        let list = consumer
            .fetch_group_list(None, KAFKA_RPC_TIMEOUT)
            .map_err(|e| e.to_string())?;

        let out: Vec<Value> = list
            .groups()
            .iter()
            .map(|g| {
                json!({
                    "name": g.name(),
                    "state": g.state(),
                    "protocol": g.protocol(),
                    "protocol_type": g.protocol_type(),
                    "member_count": safe_member_count(g),
                })
            })
            .collect();
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn describe_consumer_group(
    cluster_id: String,
    group_id: String,
    db: State<'_, Database>,
) -> Result<Value, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let mut cfg = create_kafka_config(&conn);
        cfg.set(
            "group.id",
            format!("kafka-desktop-manager-describe-{}", &group_id),
        );

        let consumer: BaseConsumer = cfg.create().map_err(|e| e.to_string())?;

        // Fetch group members via group list
        let members_json: Vec<Value> = match consumer
            .fetch_group_list(Some(&group_id), KAFKA_RPC_TIMEOUT)
        {
            Ok(list) => {
                list.groups()
                    .iter()
                    .flat_map(|g| {
                        let raw = g as *const GroupInfo as *const rdkafka_sys::rd_kafka_group_info;
                        let member_cnt = unsafe {
                            let info = &*raw;
                            if info.members.is_null() {
                                0
                            } else {
                                info.member_cnt as usize
                            }
                        };
                        if member_cnt == 0 {
                            return vec![];
                        }
                        // Safe to call members() when ptr is non-null
                        g.members()
                            .iter()
                            .map(|m| {
                                json!({
                                    "member_id": m.id(),
                                    "client_id": m.client_id(),
                                    "client_host": m.client_host(),
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .collect()
            }
            Err(_) => vec![],
        };

        // Build a TPL with all topics from cluster metadata
        let md = consumer
            .fetch_metadata(None, KAFKA_RPC_TIMEOUT)
            .map_err(|e| e.to_string())?;
        let mut all_tpl = TopicPartitionList::new();
        for t in md.topics() {
            if t.name().starts_with("__") {
                continue;
            }
            for p in t.partitions() {
                all_tpl.add_partition(t.name(), p.id());
            }
        }

        // Fetch committed offsets for the target group
        // We need a consumer with the actual group.id
        let mut group_cfg = create_kafka_config(&conn);
        group_cfg.set("group.id", &group_id);
        group_cfg.set("enable.auto.commit", "false");
        let group_consumer: BaseConsumer = group_cfg.create().map_err(|e| e.to_string())?;

        let committed = group_consumer
            .committed_offsets(all_tpl, KAFKA_RPC_TIMEOUT)
            .map_err(|e| e.to_string())?;

        let mut offset_rows: Vec<Value> = Vec::new();
        for elem in committed.elements() {
            if let Offset::Offset(committed_off) = elem.offset() {
                if committed_off < 0 {
                    continue;
                }
                let (low, high) = consumer
                    .fetch_watermarks(elem.topic(), elem.partition(), KAFKA_RPC_TIMEOUT)
                    .unwrap_or((0, 0));

                let lag = if high > committed_off {
                    high - committed_off
                } else {
                    0
                };

                offset_rows.push(json!({
                    "topic": elem.topic(),
                    "partition": elem.partition(),
                    "start_offset": low,
                    "end_offset": high,
                    "consumer_offset": committed_off,
                    "lag": lag,
                }));
            }
        }

        Ok(json!({
            "members": members_json,
            "offsets": offset_rows,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_consumer_group(
    cluster_id: String,
    group_id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let cfg = create_kafka_config(&conn);
    let admin: AdminClient<rdkafka::client::DefaultClientContext> =
        AdminClient::from_config(&cfg).map_err(|e| e.to_string())?;
    let opts = AdminOptions::new().operation_timeout(Some(KAFKA_RPC_TIMEOUT));
    let results = admin
        .delete_groups(&[&group_id], &opts)
        .await
        .map_err(|e| e.to_string())?;
    for res in results {
        if let Err((name, code)) = res {
            return Err(format!("Failed to delete consumer group {name}: {code:?}"));
        }
    }
    Ok(())
}

/// Shared offset resolution logic used by both preview and actual reset
fn resolve_target_offsets(
    consumer: &BaseConsumer,
    topic: &str,
    strategy: &str,
    value: Option<i64>,
) -> Result<Vec<(i32, i64, i64, i64)>, String> {
    let md = consumer
        .fetch_metadata(Some(topic), KAFKA_RPC_TIMEOUT)
        .map_err(|e| e.to_string())?;
    let t = md
        .topics()
        .iter()
        .find(|t| t.name() == topic)
        .ok_or_else(|| format!("Topic not found: {topic}"))?;
    let partitions: Vec<i32> = t.partitions().iter().map(|p| p.id()).collect();

    if partitions.is_empty() {
        return Err(format!("Topic '{}' has no partitions", topic));
    }

    // Returns Vec<(partition, current_offset, target_offset, end_offset)>
    let mut rows: Vec<(i32, i64, i64, i64)> = Vec::new();
    match strategy {
        "earliest" => {
            for p in &partitions {
                let (low, high) = consumer
                    .fetch_watermarks(topic, *p, KAFKA_RPC_TIMEOUT)
                    .map_err(|e| e.to_string())?;
                rows.push((*p, high, low, high));
            }
        }
        "latest" => {
            for p in &partitions {
                let (_, high) = consumer
                    .fetch_watermarks(topic, *p, KAFKA_RPC_TIMEOUT)
                    .map_err(|e| e.to_string())?;
                rows.push((*p, high, high, high));
            }
        }
        "offset" => {
            let off = value.ok_or_else(|| "Offset strategy requires a value".to_string())?;
            for p in &partitions {
                let (_, high) = consumer
                    .fetch_watermarks(topic, *p, KAFKA_RPC_TIMEOUT)
                    .map_err(|e| e.to_string())?;
                rows.push((*p, high, off, high));
            }
        }
        "timestamp" => {
            let ts = value.ok_or_else(|| "Timestamp strategy requires a value".to_string())?;
            let mut lookup = TopicPartitionList::new();
            for p in &partitions {
                let _ = lookup.add_partition_offset(topic, *p, Offset::Offset(ts));
            }
            let resolved = consumer
                .offsets_for_times(lookup, KAFKA_RPC_TIMEOUT)
                .map_err(|e| e.to_string())?;
            for elem in resolved.elements() {
                let (_, high) = consumer
                    .fetch_watermarks(elem.topic(), elem.partition(), KAFKA_RPC_TIMEOUT)
                    .unwrap_or((0, 0));
                let target = match elem.offset() {
                    Offset::Offset(v) if v >= 0 => v,
                    _ => high,
                };
                rows.push((elem.partition(), high, target, high));
            }
        }
        _ => return Err(format!("Unknown offset reset strategy: {strategy}")),
    }
    Ok(rows)
}

#[tauri::command]
pub async fn preview_reset_offsets(
    cluster_id: String,
    group_id: String,
    topic: String,
    strategy: String,
    value: Option<i64>,
    db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let mut cfg = create_kafka_config(&conn);
        cfg.set(
            "group.id",
            format!("kafka-desktop-manager-preview-{}", &group_id),
        );
        let consumer: BaseConsumer = cfg.create().map_err(|e| e.to_string())?;

        // Get current committed offsets for this group
        let md = consumer
            .fetch_metadata(Some(&topic), KAFKA_RPC_TIMEOUT)
            .map_err(|e| e.to_string())?;
        let mut tpl = TopicPartitionList::new();
        for t in md.topics() {
            if t.name() == topic {
                for p in t.partitions() {
                    tpl.add_partition(t.name(), p.id());
                }
            }
        }

        let mut group_cfg = create_kafka_config(&conn);
        group_cfg.set("group.id", &group_id);
        group_cfg.set("enable.auto.commit", "false");
        let group_consumer: BaseConsumer = group_cfg.create().map_err(|e| e.to_string())?;
        let committed = group_consumer
            .committed_offsets(tpl, KAFKA_RPC_TIMEOUT)
            .unwrap_or_default();

        let mut committed_map: std::collections::HashMap<i32, i64> =
            std::collections::HashMap::new();
        for elem in committed.elements() {
            if let Offset::Offset(off) = elem.offset() {
                if off >= 0 {
                    committed_map.insert(elem.partition(), off);
                }
            }
        }

        let rows = resolve_target_offsets(&consumer, &topic, &strategy, value)?;
        let result: Vec<Value> = rows
            .iter()
            .map(|&(partition, _end, target, end_offset)| {
                let current = committed_map.get(&partition).copied().unwrap_or(-1);
                json!({
                    "topic": topic,
                    "partition": partition,
                    "current_offset": current,
                    "target_offset": target,
                    "end_offset": end_offset,
                })
            })
            .collect();
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reset_consumer_group_offsets(
    cluster_id: String,
    group_id: String,
    topic: String,
    strategy: String,
    value: Option<i64>,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let cfg = create_kafka_config(&conn);

        let admin: AdminClient<rdkafka::client::DefaultClientContext> =
            AdminClient::from_config(&cfg).map_err(|e| e.to_string())?;

        let mut consumer_cfg = create_kafka_config(&conn);
        consumer_cfg.set(
            "group.id",
            format!("kafka-desktop-manager-reset-{}", &group_id),
        );
        let consumer: BaseConsumer = consumer_cfg.create().map_err(|e| e.to_string())?;

        let resolved = resolve_target_offsets(&consumer, &topic, &strategy, value)?;
        let offsets: Vec<(i32, i64)> = resolved
            .iter()
            .map(|&(p, _, target, _)| (p, target))
            .collect();

        log::info!(
            "AlterConsumerGroupOffsets: group={}, topic={}, partitions={:?}",
            group_id,
            topic,
            offsets
        );

        // Use rd_kafka_AlterConsumerGroupOffsets via FFI
        use std::ffi::CString;
        unsafe {
            let native_ptr = admin.inner().native_ptr();

            // Build C-level TopicPartitionList with offsets
            let c_tpl = rdkafka_sys::rd_kafka_topic_partition_list_new(offsets.len() as i32);
            let c_topic = CString::new(topic.as_str()).map_err(|e| e.to_string())?;
            for &(p, off) in &offsets {
                let entry =
                    rdkafka_sys::rd_kafka_topic_partition_list_add(c_tpl, c_topic.as_ptr(), p);
                (*entry).offset = off;
            }

            let c_group = CString::new(group_id.as_str()).map_err(|e| e.to_string())?;
            let alter_req =
                rdkafka_sys::rd_kafka_AlterConsumerGroupOffsets_new(c_group.as_ptr(), c_tpl);
            rdkafka_sys::rd_kafka_topic_partition_list_destroy(c_tpl);

            // Create a temporary queue for the admin result
            let queue = rdkafka_sys::rd_kafka_queue_new(native_ptr);

            // Create admin options
            let opts = rdkafka_sys::rd_kafka_AdminOptions_new(
                native_ptr,
                rdkafka_sys::rd_kafka_admin_op_t::RD_KAFKA_ADMIN_OP_ALTERCONSUMERGROUPOFFSETS,
            );
            let timeout_ms = KAFKA_RPC_TIMEOUT.as_millis() as i32;
            let mut err_buf = [0i8; 256];
            rdkafka_sys::rd_kafka_AdminOptions_set_request_timeout(
                opts,
                timeout_ms,
                err_buf.as_mut_ptr(),
                err_buf.len(),
            );

            let mut alter_arr = [alter_req];
            rdkafka_sys::rd_kafka_AlterConsumerGroupOffsets(
                native_ptr,
                alter_arr.as_mut_ptr(),
                1,
                opts,
                queue,
            );

            // Wait for result
            let event = rdkafka_sys::rd_kafka_queue_poll(queue, timeout_ms + 5000);
            let result = if event.is_null() {
                Err("AlterConsumerGroupOffsets timeout".to_string())
            } else {
                let etype = rdkafka_sys::rd_kafka_event_type(event);
                let event_err = rdkafka_sys::rd_kafka_event_error(event);
                if event_err as i32 != 0 {
                    let err_str =
                        std::ffi::CStr::from_ptr(rdkafka_sys::rd_kafka_event_error_string(event))
                            .to_string_lossy()
                            .to_string();
                    Err(format!("Admin API error: {err_str}"))
                } else if etype != rdkafka_sys::RD_KAFKA_EVENT_ALTERCONSUMERGROUPOFFSETS_RESULT {
                    Err(format!("Unexpected event type: {etype}"))
                } else {
                    let res = rdkafka_sys::rd_kafka_event_AlterConsumerGroupOffsets_result(event);
                    if res.is_null() {
                        Err("AlterConsumerGroupOffsets result is empty".to_string())
                    } else {
                        let mut cnt: usize = 0;
                        let groups = rdkafka_sys::rd_kafka_AlterConsumerGroupOffsets_result_groups(
                            res, &mut cnt,
                        );
                        if cnt == 0 || groups.is_null() {
                            Err(format!("No result returned (cnt={cnt}, type={etype})"))
                        } else {
                            let group_res = *groups;
                            let err = rdkafka_sys::rd_kafka_group_result_error(group_res);
                            if !err.is_null() && rdkafka_sys::rd_kafka_error_code(err) as i32 != 0 {
                                let msg = std::ffi::CStr::from_ptr(
                                    rdkafka_sys::rd_kafka_error_string(err),
                                )
                                .to_string_lossy()
                                .to_string();
                                Err(format!("Failed to reset offset: {msg}"))
                            } else {
                                Ok(())
                            }
                        }
                    }
                }
            };

            if !event.is_null() {
                rdkafka_sys::rd_kafka_event_destroy(event);
            }
            rdkafka_sys::rd_kafka_AdminOptions_destroy(opts);
            rdkafka_sys::rd_kafka_AlterConsumerGroupOffsets_destroy(alter_req);
            rdkafka_sys::rd_kafka_queue_destroy(queue);

            result
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
