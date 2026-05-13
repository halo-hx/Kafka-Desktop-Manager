use crate::commands::kafka_util::{
    create_kafka_config, fetch_metadata_blocking, get_connection_or_err, metadata_overview,
    topic_summaries_blocking, KAFKA_RPC_TIMEOUT,
};
use crate::storage::Database;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::config::FromClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub async fn load_cluster_topics(
    cluster_id: String,
    db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || topic_summaries_blocking(&conn))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_topic(
    cluster_id: String,
    name: String,
    partitions: i32,
    replication_factor: i32,
    configs: HashMap<String, String>,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let cfg = create_kafka_config(&conn);
    let admin = AdminClient::from_config(&cfg).map_err(|e| e.to_string())?;
    let opts = AdminOptions::new().operation_timeout(Some(KAFKA_RPC_TIMEOUT));
    let mut topic = NewTopic::new(
        name.as_str(),
        partitions,
        TopicReplication::Fixed(replication_factor),
    );
    for (k, v) in &configs {
        topic = topic.set(k.as_str(), v.as_str());
    }
    let results = admin
        .create_topics([&topic], &opts)
        .await
        .map_err(|e| e.to_string())?;
    for res in results {
        if let Err((tname, code)) = res {
            return Err(format!("create topic {tname}: {code:?}"));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_topic(
    cluster_id: String,
    topic_name: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    let cfg = create_kafka_config(&conn);
    let admin = AdminClient::from_config(&cfg).map_err(|e| e.to_string())?;
    let opts = AdminOptions::new().operation_timeout(Some(KAFKA_RPC_TIMEOUT));
    let tn = topic_name.as_str();
    let results = admin
        .delete_topics(&[tn], &opts)
        .await
        .map_err(|e| e.to_string())?;
    for res in results {
        if let Err((name, code)) = res {
            return Err(format!("delete topic {name}: {code:?}"));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn load_cluster_overview(
    cluster_id: String,
    db: State<'_, Database>,
) -> Result<Value, String> {
    let conn = get_connection_or_err(&db, &cluster_id).await?;
    tokio::task::spawn_blocking(move || {
        let metadata = fetch_metadata_blocking(&conn)?;
        let mut overview = metadata_overview(&metadata);

        let mut cfg = create_kafka_config(&conn);
        cfg.set("group.id", "kafka-desktop-manager-overview-groups");
        let consumer: BaseConsumer = cfg.create().map_err(|e| e.to_string())?;
        let group_count = consumer
            .fetch_group_list(None, KAFKA_RPC_TIMEOUT)
            .map(|list| list.groups().len())
            .unwrap_or(0);

        if let Some(obj) = overview.as_object_mut() {
            obj.insert(
                "consumer_group_count".into(),
                serde_json::json!(group_count),
            );
            obj.insert("cluster_name".into(), serde_json::json!(conn.name));
            obj.insert("cluster_mode".into(), serde_json::json!(conn.cluster_mode));

            // 集群配置（只读）：选一个 broker 调用 DescribeConfigs。
            // 优先选控制器；否则退到元数据提供者。
            let controller_id = metadata.orig_broker_id();
            let target_broker = metadata
                .brokers()
                .iter()
                .map(|b| b.id())
                .find(|id| *id == controller_id)
                .or_else(|| metadata.brokers().first().map(|b| b.id()));
            if let Some(bid) = target_broker {
                let configs =
                    crate::commands::cluster::describe_broker_configs_blocking(&conn, bid);
                obj.insert("configs".into(), serde_json::json!(configs));
            } else {
                obj.insert(
                    "configs".into(),
                    serde_json::json!(serde_json::Map::<String, Value>::new()),
                );
            }
        }

        Ok(overview)
    })
    .await
    .map_err(|e| e.to_string())?
}
