//! Kafka message fetch & produce commands (rdkafka).

use crate::commands::kafka_util::{create_kafka_config, get_connection_or_err, KAFKA_RPC_TIMEOUT};
use crate::storage::{ClusterConnectionRow, Database};
use chrono::DateTime;
use rdkafka::consumer::Consumer;
use rdkafka::message::{Header, Headers, OwnedHeaders};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;
use rdkafka::{Message, Offset, TopicPartitionList};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::State;

fn msg_headers_map(msg: &rdkafka::message::BorrowedMessage<'_>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Some(h) = msg.headers() {
        for h in h.iter() {
            let v = h
                .value
                .map(|b| String::from_utf8_lossy(b).to_string())
                .unwrap_or_default();
            out.insert(h.key.to_string(), v);
        }
    }
    out
}

fn format_ts_millis(ms: i64) -> String {
    match DateTime::from_timestamp_millis(ms) {
        Some(dt) => dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        None => ms.to_string(),
    }
}

fn borrowed_message_to_value(msg: &rdkafka::message::BorrowedMessage<'_>) -> Value {
    let key = msg
        .key()
        .map(|k| String::from_utf8_lossy(k).to_string())
        .unwrap_or_default();
    let value = msg
        .payload()
        .map(|p| String::from_utf8_lossy(p).to_string())
        .unwrap_or_default();
    let headers = msg_headers_map(msg);
    let ts_str = msg
        .timestamp()
        .to_millis()
        .map(format_ts_millis)
        .unwrap_or_else(|| "unknown".to_string());
    let header_bytes: usize = headers.iter().map(|(k, v)| k.len() + v.len()).sum();
    let size = key.len() + value.len() + header_bytes;
    json!({
        "partition": msg.partition(),
        "offset": msg.offset(),
        "timestamp": ts_str,
        "key": key,
        "value": value,
        "headers": headers,
        "size": size as i64,
    })
}

fn partition_ids_for_topic(
    consumer: &rdkafka::consumer::BaseConsumer,
    topic: &str,
) -> Result<Vec<i32>, String> {
    let md = consumer
        .fetch_metadata(Some(topic), KAFKA_RPC_TIMEOUT)
        .map_err(|e| e.to_string())?;
    let t = md
        .topics()
        .iter()
        .find(|t| t.name() == topic)
        .ok_or_else(|| format!("Topic not found: {topic}"))?;
    if let Some(err) = t.error() {
        return Err(format!("Topic metadata error: {err:?}"));
    }
    Ok(t.partitions().iter().map(|p| p.id()).collect())
}

fn assign_and_seek(
    consumer: &rdkafka::consumer::BaseConsumer,
    topic: &str,
    partition: Option<i32>,
    range_mode: &str,
    offset_start: Option<i64>,
    timestamp_ms: Option<i64>,
    count: i32,
) -> Result<(), String> {
    let pids: Vec<i32> = if let Some(p) = partition {
        vec![p]
    } else {
        partition_ids_for_topic(consumer, topic)?
    };
    if pids.is_empty() {
        return Err("Topic has no partitions".into());
    }

    let count_usize = usize::try_from(count).unwrap_or(usize::MAX).max(1);
    let n = pids.len().max(1);
    let per_partition_tail: i64 = ((count_usize + n - 1) / n).max(1) as i64;

    let mut tpl = TopicPartitionList::new();

    match range_mode {
        "oldest" => {
            for p in &pids {
                let _ = tpl.add_partition_offset(topic, *p, Offset::Beginning);
            }
        }
        "offset" => {
            let start = offset_start.unwrap_or(-1);
            if start < 0 {
                return Err("Valid offset_start required in offset mode".into());
            }
            for p in &pids {
                let _ = tpl.add_partition_offset(topic, *p, Offset::Offset(start));
            }
        }
        "timestamp" => {
            let ts = timestamp_ms.ok_or_else(|| "timestamp_ms required in timestamp mode".to_string())?;
            let mut tpt = TopicPartitionList::new();
            for p in &pids {
                let _ = tpt.add_partition_offset(topic, *p, Offset::Offset(ts));
            }
            let offs = consumer
                .offsets_for_times(tpt, KAFKA_RPC_TIMEOUT)
                .map_err(|e| e.to_string())?;
            for elem in offs.elements() {
                let off = match elem.offset() {
                    Offset::Offset(v) if v >= 0 => Offset::Offset(v),
                    _ => Offset::End,
                };
                let _ = tpl.add_partition_offset(elem.topic(), elem.partition(), off);
            }
        }
        _ => {
            for p in &pids {
                let (low, high) = consumer
                    .fetch_watermarks(topic, *p, KAFKA_RPC_TIMEOUT)
                    .map_err(|e| e.to_string())?;
                if high <= low {
                    let _ = tpl.add_partition_offset(topic, *p, Offset::Beginning);
                    continue;
                }
                let last = high - 1;
                let start = if last - low > per_partition_tail {
                    last - per_partition_tail
                } else {
                    low
                };
                let _ = tpl.add_partition_offset(topic, *p, Offset::Offset(start));
            }
        }
    }

    consumer.assign(&tpl).map_err(|e| e.to_string())?;
    Ok(())
}

fn fetch_messages_blocking(
    conn: ClusterConnectionRow,
    topic: String,
    partition: Option<i32>,
    offset_start: Option<i64>,
    count: i32,
    range_mode: String,
    timestamp_ms: Option<i64>,
) -> Result<Vec<Value>, String> {
    let mut cfg = create_kafka_config(&conn);
    cfg.set(
        "group.id",
        format!("kafka-desktop-manager-fetch-{}", uuid::Uuid::new_v4()),
    );
    cfg.set("enable.auto.commit", "false");
    cfg.set("enable.partition.eof", "true");

    let consumer: rdkafka::consumer::BaseConsumer = cfg.create().map_err(|e| e.to_string())?;

    assign_and_seek(
        &consumer,
        &topic,
        partition,
        &range_mode,
        offset_start,
        timestamp_ms,
        count,
    )?;

    let deadline = Instant::now() + Duration::from_secs(45);
    let want = usize::try_from(count).unwrap_or(usize::MAX).max(1);
    let mut rows: Vec<Value> = Vec::with_capacity(want.min(256));
    let mut eof_count = 0usize;
    let partition_count = {
        let md = consumer.fetch_metadata(Some(&topic), KAFKA_RPC_TIMEOUT).map_err(|e| e.to_string())?;
        md.topics().first().map(|t| t.partitions().len()).unwrap_or(1)
    };

    while rows.len() < want && Instant::now() < deadline {
        match consumer.poll(Duration::from_millis(500)) {
            Some(Ok(msg)) => {
                if msg.topic() == topic.as_str() {
                    rows.push(borrowed_message_to_value(&msg));
                }
            }
            Some(Err(rdkafka::error::KafkaError::PartitionEOF(p))) => {
                log::debug!("Partition {p} EOF reached");
                eof_count += 1;
                if eof_count >= partition_count {
                    break;
                }
            }
            Some(Err(e)) => return Err(format!("Consume error: {e}")),
            None => {}
        }
    }

    rows.truncate(want);
    Ok(rows)
}

#[tauri::command]
pub async fn fetch_messages(
    cluster_id: String,
    topic: String,
    partition: Option<i32>,
    offset_start: Option<i64>,
    count: i32,
    range_mode: Option<String>,
    timestamp_ms: Option<i64>,
    db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    let conn = get_connection_or_err(&*db, &cluster_id).await?;
    let mode = range_mode.unwrap_or_else(|| "newest".into());
    tokio::task::spawn_blocking(move || {
        fetch_messages_blocking(conn, topic, partition, offset_start, count, mode, timestamp_ms)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn send_message(
    cluster_id: String,
    topic: String,
    partition: Option<i32>,
    key: Option<String>,
    value: Option<String>,
    headers: Option<HashMap<String, String>>,
    db: State<'_, Database>,
) -> Result<Value, String> {
    let conn = get_connection_or_err(&*db, &cluster_id).await?;

    let mut cfg = create_kafka_config(&conn);
    cfg.set("message.timeout.ms", "60000");
    let producer: FutureProducer = cfg.create().map_err(|e| e.to_string())?;

    let has_headers = headers.as_ref().map(|h| !h.is_empty()).unwrap_or(false);

    let mut oh = OwnedHeaders::new();
    if let Some(hm) = headers {
        for (k, v) in hm {
            oh = oh.insert(Header {
                key: k.as_str(),
                value: Some(v.as_bytes()),
            });
        }
    }

    let key_s = key.unwrap_or_default();
    let val_s = value.unwrap_or_default();

    let mut record = FutureRecord::to(topic.as_str())
        .key(&key_s)
        .payload(&val_s);
    if has_headers {
        record = record.headers(oh);
    }
    if let Some(p) = partition {
        record = record.partition(p);
    }

    let (partition_out, offset) = producer
        .send(record, Timeout::After(Duration::from_secs(60)))
        .await
        .map_err(|(e, _)| e.to_string())?;

    Ok(json!({
        "topic": topic,
        "partition": partition_out,
        "offset": offset,
    }))
}
