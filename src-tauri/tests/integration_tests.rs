//! KafkaManager 关键链路后端集成测试
//!
//! 运行前提: localhost:9092 上有一个可访问的 Kafka 实例 (PLAINTEXT, 无认证)
//!
//! 运行方式:
//!   cd src-tauri
//!   cargo test --test integration_tests -- --nocapture
//!
//! 测试覆盖:
//!   - TC-INT-001: Kafka 连接与元数据获取
//!   - TC-INT-002: Topic 创建、列出、删除
//!   - TC-INT-003: 消息生产与消费
//!   - TC-INT-004: Consumer Group 列出
//!   - TC-INT-005: SQLite 连接配置 CRUD
//!   - TC-INT-006: SQLite 设置 CRUD
//!   - TC-INT-007: AdminClient Topic 属性

use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::config::FromClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::Headers;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;
use rdkafka::{ClientConfig, Message};
use std::time::Duration;

const BOOTSTRAP: &str = "localhost:9092";

fn kafka_config() -> ClientConfig {
    let mut cfg = ClientConfig::new();
    cfg.set("bootstrap.servers", BOOTSTRAP);
    cfg
}

// ─────────────────────────────────────────────
// TC-INT-001: Kafka 连接 + 元数据获取
// ─────────────────────────────────────────────
#[test]
fn tc_int_001_kafka_connect_and_metadata() {
    let mut cfg = kafka_config();
    cfg.set("group.id", "km-test-metadata");
    let consumer: BaseConsumer = cfg.create().expect("创建 consumer 失败");

    let metadata = consumer
        .fetch_metadata(None, Duration::from_secs(10))
        .expect("获取元数据失败");

    let broker_count = metadata.brokers().len();
    let topic_count = metadata.topics().len();

    println!("[TC-INT-001] Brokers={broker_count}, Topics={topic_count}");
    for b in metadata.brokers() {
        println!("  Broker {}: {}:{}", b.id(), b.host(), b.port());
    }
    assert!(broker_count >= 1, "至少有一个 broker");
    assert!(topic_count >= 1, "至少有一个 topic");
}

// ─────────────────────────────────────────────
// TC-INT-002: Topic 创建 → 列出 → 删除
// ─────────────────────────────────────────────
#[test]
fn tc_int_002_topic_lifecycle() {
    let topic_name = "km-test-lifecycle-topic";
    let cfg = kafka_config();
    let admin: AdminClient<DefaultClientContext> =
        AdminClient::from_config(&cfg).expect("创建 AdminClient 失败");
    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    // 创建 topic
    let topic = NewTopic::new(topic_name, 2, TopicReplication::Fixed(1));
    let results = futures::executor::block_on(admin.create_topics([&topic], &opts))
        .expect("create_topics RPC 失败");
    for r in &results {
        match r {
            Ok(name) => println!("[TC-INT-002] 已创建 topic: {name}"),
            Err((name, code)) => println!("[TC-INT-002] topic 创建结果: {name} -> {code:?}"),
        }
    }

    // 列出 topic 确认存在
    let mut cfg2 = kafka_config();
    cfg2.set("group.id", "km-test-list");
    let consumer: BaseConsumer = cfg2.create().expect("创建 consumer 失败");
    let md = consumer
        .fetch_metadata(Some(topic_name), Duration::from_secs(10))
        .expect("获取 topic 元数据失败");
    let found = md.topics().iter().any(|t| t.name() == topic_name);
    assert!(found, "应当能找到新创建的 topic");

    let partitions = md
        .topics()
        .iter()
        .find(|t| t.name() == topic_name)
        .unwrap()
        .partitions()
        .len();
    assert_eq!(partitions, 2, "应当有 2 个分区");
    println!("[TC-INT-002] 已确认 topic '{topic_name}' 存在 ({partitions} 分区)");

    // 删除 topic
    let del = futures::executor::block_on(admin.delete_topics(&[topic_name], &opts))
        .expect("delete_topics RPC 失败");
    for r in &del {
        match r {
            Ok(name) => println!("[TC-INT-002] 已删除 topic: {name}"),
            Err((name, code)) => println!("[TC-INT-002] topic 删除结果: {name} -> {code:?}"),
        }
    }
}

// ─────────────────────────────────────────────
// TC-INT-003: 消息生产 → 消费 (端到端)
// ─────────────────────────────────────────────
#[tokio::test]
async fn tc_int_003_produce_and_consume() {
    let topic_name = "km-test-produce-consume";
    let cfg = kafka_config();
    let admin: AdminClient<DefaultClientContext> =
        AdminClient::from_config(&cfg).expect("创建 AdminClient 失败");
    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    let topic = NewTopic::new(topic_name, 1, TopicReplication::Fixed(1));
    let _ = admin.create_topics([&topic], &opts).await;
    tokio::time::sleep(Duration::from_secs(1)).await;

    // Produce
    let mut pcfg = kafka_config();
    pcfg.set("message.timeout.ms", "10000");
    let producer: FutureProducer = pcfg.create().expect("创建 producer 失败");

    let test_key = "integration-key";
    let test_value = "KafkaManager 集成测试消息 🚀";

    let record = FutureRecord::to(topic_name)
        .key(test_key)
        .payload(test_value);
    let (partition, offset) = producer
        .send(record, Timeout::After(Duration::from_secs(10)))
        .await
        .expect("发送消息失败");
    println!("[TC-INT-003] 生产: partition={partition}, offset={offset}");

    // Consume
    let mut ccfg = kafka_config();
    ccfg.set("group.id", "km-test-e2e-consumer");
    ccfg.set("enable.auto.commit", "false");
    ccfg.set("auto.offset.reset", "earliest");
    let consumer: BaseConsumer = ccfg.create().expect("创建 consumer 失败");
    consumer.subscribe(&[topic_name]).expect("订阅失败");

    let mut found = false;
    let deadline = std::time::Instant::now() + Duration::from_secs(15);
    while std::time::Instant::now() < deadline {
        if let Some(Ok(msg)) = consumer.poll(Duration::from_millis(200)) {
            let payload = msg
                .payload()
                .map(|p| String::from_utf8_lossy(p).to_string())
                .unwrap_or_default();
            let key = msg
                .key()
                .map(|k| String::from_utf8_lossy(k).to_string())
                .unwrap_or_default();
            println!("[TC-INT-003] 消费: key={key}, value={payload}");
            if payload == test_value && key == test_key {
                found = true;
                break;
            }
        }
    }
    assert!(found, "应当能消费到刚生产的消息");

    // Cleanup
    let _ = admin.delete_topics(&[topic_name], &opts).await;
    println!("[TC-INT-003] 清理完成");
}

// ─────────────────────────────────────────────
// TC-INT-004: Consumer Group 列出
// ─────────────────────────────────────────────
#[test]
fn tc_int_004_list_consumer_groups() {
    let mut cfg = kafka_config();
    cfg.set("group.id", "km-test-list-groups");
    let consumer: BaseConsumer = cfg.create().expect("创建 consumer 失败");

    let groups = consumer
        .fetch_group_list(None, Duration::from_secs(10))
        .expect("获取 group list 失败");

    println!(
        "[TC-INT-004] 发现 {} 个 consumer group:",
        groups.groups().len()
    );
    for g in groups.groups() {
        println!(
            "  name={}, state={}, protocol={}",
            g.name(),
            g.state(),
            g.protocol(),
        );
    }
    // 至少包含我们自己的临时 group
    assert!(
        !groups.groups().is_empty(),
        "至少应发现 1 个 consumer group"
    );
}

// ─────────────────────────────────────────────
// TC-INT-005: SQLite 连接配置 CRUD
// ─────────────────────────────────────────────
#[test]
fn tc_int_005_sqlite_connection_crud() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    // 保存
    let conn = kafka_manager_lib::storage::ClusterConnectionRow {
        id: "test-conn-1".into(),
        name: "Test Local".into(),
        group_id: None,
        bootstrap_servers: "localhost:9092".into(),
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
        created_at: "2025-01-01T00:00:00Z".into(),
        updated_at: "2025-01-01T00:00:00Z".into(),
        last_connected_at: None,
        is_favorite: false,
        color_tag: None,
        notes: Some("integration test".into()),
    };
    db.save_connection(&conn).expect("保存连接失败");
    println!("[TC-INT-005] 保存连接 OK");

    // 读取
    let loaded = db.list_connections().expect("列出连接失败");
    assert_eq!(loaded.len(), 1, "应有 1 条连接");
    assert_eq!(loaded[0].name, "Test Local");
    assert_eq!(loaded[0].bootstrap_servers, "localhost:9092");
    println!("[TC-INT-005] 读取连接 OK: name={}", loaded[0].name);

    // 获取单条
    let single = db
        .get_connection("test-conn-1")
        .expect("获取连接失败")
        .expect("连接不应为 None");
    assert_eq!(single.id, "test-conn-1");
    assert_eq!(single.notes, Some("integration test".into()));
    println!("[TC-INT-005] 获取单条 OK");

    // 更新
    let mut updated = conn.clone();
    updated.name = "Updated Local".into();
    updated.updated_at = "2025-06-01T00:00:00Z".into();
    db.save_connection(&updated).expect("更新连接失败");
    let reloaded = db.get_connection("test-conn-1").expect("获取失败").unwrap();
    assert_eq!(reloaded.name, "Updated Local");
    println!("[TC-INT-005] 更新连接 OK: name={}", reloaded.name);

    // 删除
    db.delete_connection("test-conn-1").expect("删除连接失败");
    let after_delete = db.list_connections().expect("列出连接失败");
    assert_eq!(after_delete.len(), 0, "删除后应没有连接");
    println!("[TC-INT-005] 删除连接 OK");
}

// ─────────────────────────────────────────────
// TC-INT-006: SQLite 设置 CRUD
// ─────────────────────────────────────────────
#[test]
fn tc_int_006_sqlite_settings_crud() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    db.set_setting("theme", "dark").expect("设置 theme 失败");
    db.set_setting("language", "zh-CN")
        .expect("设置 language 失败");

    let theme = db.get_setting("theme").expect("获取 theme 失败");
    assert_eq!(theme, Some("dark".into()));
    println!("[TC-INT-006] theme = {:?}", theme);

    let lang = db.get_setting("language").expect("获取 language 失败");
    assert_eq!(lang, Some("zh-CN".into()));
    println!("[TC-INT-006] language = {:?}", lang);

    let all = db.get_all_settings().expect("获取所有设置失败");
    assert_eq!(all.len(), 2);
    println!("[TC-INT-006] all settings = {:?}", all);

    // 更新
    db.set_setting("theme", "light").expect("更新 theme 失败");
    let updated = db.get_setting("theme").expect("获取 theme 失败");
    assert_eq!(updated, Some("light".into()));
    println!("[TC-INT-006] updated theme = {:?}", updated);

    // 不存在的 key
    let none_val = db.get_setting("nonexistent").expect("获取失败");
    assert_eq!(none_val, None);
    println!("[TC-INT-006] nonexistent key = {:?}", none_val);
}

// ─────────────────────────────────────────────
// TC-INT-007: Topic 配置与水位查询
// ─────────────────────────────────────────────
#[test]
fn tc_int_007_topic_watermarks() {
    let topic_name = "DEV_AUDIT_LOG";
    let mut cfg = kafka_config();
    cfg.set("group.id", "km-test-watermarks");
    let consumer: BaseConsumer = cfg.create().expect("创建 consumer 失败");

    let md = consumer
        .fetch_metadata(Some(topic_name), Duration::from_secs(10))
        .expect("获取元数据失败");
    let topic_md = md
        .topics()
        .iter()
        .find(|t| t.name() == topic_name)
        .expect("找不到该 topic");

    println!(
        "[TC-INT-007] Topic '{}' 有 {} 个分区",
        topic_name,
        topic_md.partitions().len()
    );

    for p in topic_md.partitions() {
        let (low, high) = consumer
            .fetch_watermarks(topic_name, p.id(), Duration::from_secs(5))
            .expect("获取 watermarks 失败");
        println!(
            "  partition={}: low={}, high={}, lag={}",
            p.id(),
            low,
            high,
            high - low,
        );
        assert!(high >= low, "high offset 应 >= low offset");
    }
}

// ─────────────────────────────────────────────
// TC-INT-008: 多消息批量生产与偏移量验证
// ─────────────────────────────────────────────
#[tokio::test]
async fn tc_int_008_batch_produce_and_offsets() {
    let topic_name = "km-test-batch";
    let cfg = kafka_config();
    let admin: AdminClient<DefaultClientContext> =
        AdminClient::from_config(&cfg).expect("创建 AdminClient 失败");
    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    let topic = NewTopic::new(topic_name, 1, TopicReplication::Fixed(1));
    let _ = admin.create_topics([&topic], &opts).await;
    tokio::time::sleep(Duration::from_secs(1)).await;

    let mut pcfg = kafka_config();
    pcfg.set("message.timeout.ms", "10000");
    let producer: FutureProducer = pcfg.create().expect("创建 producer 失败");

    let batch_size = 10;
    let mut offsets = Vec::new();
    for i in 0..batch_size {
        let key = format!("batch-{i}");
        let payload = format!("batch message #{i}");
        let record = FutureRecord::to(topic_name)
            .key(key.as_str())
            .payload(payload.as_str());
        let (_, offset) = producer
            .send(record, Timeout::After(Duration::from_secs(5)))
            .await
            .expect("发送消息失败");
        offsets.push(offset);
    }
    println!("[TC-INT-008] 批量生产 {batch_size} 条, offsets={offsets:?}");

    // 验证 offsets 递增
    for w in offsets.windows(2) {
        assert!(w[1] > w[0], "offset 应严格递增");
    }

    // 验证 watermarks
    let mut ccfg = kafka_config();
    ccfg.set("group.id", "km-test-batch-verify");
    let consumer: BaseConsumer = ccfg.create().expect("创建 consumer 失败");
    let (low, high) = consumer
        .fetch_watermarks(topic_name, 0, Duration::from_secs(5))
        .expect("获取 watermarks 失败");
    println!("[TC-INT-008] watermarks: low={low}, high={high}");
    assert!(high - low >= batch_size as i64, "high-low 应 >= 批量大小");

    let _ = admin.delete_topics(&[topic_name], &opts).await;
    println!("[TC-INT-008] 清理完成");
}

// ─────────────────────────────────────────────
// TC-INT-009: SQLite 连接组 CRUD
// ─────────────────────────────────────────────
#[test]
fn tc_int_009_sqlite_connection_group_crud() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let group = kafka_manager_lib::storage::ConnectionGroupRow {
        id: "group-1".into(),
        name: "Production".into(),
        sort_order: 0,
        parent_id: None,
    };
    db.save_group(&group).expect("保存分组失败");

    let groups = db.list_groups().expect("列出分组失败");
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].name, "Production");
    println!("[TC-INT-009] 保存和列出分组 OK");

    db.delete_group("group-1").expect("删除分组失败");
    let after = db.list_groups().expect("列出分组失败");
    assert_eq!(after.len(), 0);
    println!("[TC-INT-009] 删除分组 OK");
}

// ─────────────────────────────────────────────
// TC-INT-010: SQLite 连接收藏与颜色标签
// ─────────────────────────────────────────────
#[test]
fn tc_int_010_sqlite_favorite_and_color_tag() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let conn = kafka_manager_lib::storage::ClusterConnectionRow {
        id: "fav-test-1".into(),
        name: "Fav Test".into(),
        group_id: None,
        bootstrap_servers: "localhost:9092".into(),
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
        created_at: "2025-01-01T00:00:00Z".into(),
        updated_at: "2025-01-01T00:00:00Z".into(),
        last_connected_at: None,
        is_favorite: false,
        color_tag: None,
        notes: None,
    };
    db.save_connection(&conn).expect("保存连接失败");

    // 设为收藏
    db.update_favorite("fav-test-1", true)
        .expect("设置收藏失败");
    let loaded = db.get_connection("fav-test-1").unwrap().unwrap();
    assert!(loaded.is_favorite, "应为已收藏");
    println!("[TC-INT-010] 设为收藏 OK");

    // 取消收藏
    db.update_favorite("fav-test-1", false)
        .expect("取消收藏失败");
    let loaded = db.get_connection("fav-test-1").unwrap().unwrap();
    assert!(!loaded.is_favorite, "应为未收藏");
    println!("[TC-INT-010] 取消收藏 OK");

    // 设置颜色标签
    db.update_color_tag("fav-test-1", Some("blue"))
        .expect("设置颜色失败");
    let loaded = db.get_connection("fav-test-1").unwrap().unwrap();
    assert_eq!(loaded.color_tag, Some("blue".into()));
    println!("[TC-INT-010] 设置颜色标签 OK");

    // 清除颜色标签
    db.update_color_tag("fav-test-1", None)
        .expect("清除颜色失败");
    let loaded = db.get_connection("fav-test-1").unwrap().unwrap();
    assert_eq!(loaded.color_tag, None);
    println!("[TC-INT-010] 清除颜色标签 OK");

    // 对不存在的连接操作
    let err = db.update_favorite("nonexistent", true);
    assert!(err.is_err(), "不存在的连接应返回错误");
    println!("[TC-INT-010] 不存在连接错误处理 OK");

    db.delete_connection("fav-test-1").unwrap();
}

// ─────────────────────────────────────────────
// TC-INT-011: SQLite 多连接排序 — 收藏优先
// ─────────────────────────────────────────────
#[test]
fn tc_int_011_sqlite_connection_ordering() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let make_conn =
        |id: &str, name: &str, fav: bool| kafka_manager_lib::storage::ClusterConnectionRow {
            id: id.into(),
            name: name.into(),
            group_id: None,
            bootstrap_servers: "localhost:9092".into(),
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
            created_at: "2025-01-01T00:00:00Z".into(),
            updated_at: "2025-01-01T00:00:00Z".into(),
            last_connected_at: None,
            is_favorite: fav,
            color_tag: None,
            notes: None,
        };

    db.save_connection(&make_conn("c1", "Zeta", false)).unwrap();
    db.save_connection(&make_conn("c2", "Alpha", true)).unwrap();
    db.save_connection(&make_conn("c3", "Beta", false)).unwrap();

    let all = db.list_connections().unwrap();
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].name, "Alpha", "收藏项应排最前");
    assert_eq!(all[1].name, "Beta", "按名称排序");
    assert_eq!(all[2].name, "Zeta", "按名称排序");
    println!(
        "[TC-INT-011] 连接排序 OK: {:?}",
        all.iter().map(|c| &c.name).collect::<Vec<_>>()
    );

    for c in &all {
        db.delete_connection(&c.id).unwrap();
    }
}

// ─────────────────────────────────────────────
// TC-INT-012: SQLite 连接与分组关联
// ─────────────────────────────────────────────
#[test]
fn tc_int_012_sqlite_connection_group_relation() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let group = kafka_manager_lib::storage::ConnectionGroupRow {
        id: "grp-1".into(),
        name: "Dev".into(),
        sort_order: 0,
        parent_id: None,
    };
    db.save_group(&group).unwrap();

    let conn = kafka_manager_lib::storage::ClusterConnectionRow {
        id: "conn-in-grp".into(),
        name: "Grouped Conn".into(),
        group_id: Some("grp-1".into()),
        bootstrap_servers: "localhost:9092".into(),
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
        created_at: "2025-01-01T00:00:00Z".into(),
        updated_at: "2025-01-01T00:00:00Z".into(),
        last_connected_at: None,
        is_favorite: false,
        color_tag: None,
        notes: None,
    };
    db.save_connection(&conn).unwrap();

    let loaded = db.get_connection("conn-in-grp").unwrap().unwrap();
    assert_eq!(loaded.group_id, Some("grp-1".into()));
    println!("[TC-INT-012] 连接-分组关联 OK");

    // 删除分组后，连接的 group_id 应置为 NULL（ON DELETE SET NULL）
    db.delete_group("grp-1").unwrap();
    let loaded = db.get_connection("conn-in-grp").unwrap().unwrap();
    assert_eq!(loaded.group_id, None, "删除分组后 group_id 应为 None");
    println!("[TC-INT-012] 级联 SET NULL OK");

    db.delete_connection("conn-in-grp").unwrap();
}

// ─────────────────────────────────────────────
// TC-INT-013: SQLite last_connected_at 更新
// ─────────────────────────────────────────────
#[test]
fn tc_int_013_sqlite_last_connected_at() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let conn = kafka_manager_lib::storage::ClusterConnectionRow {
        id: "last-conn-test".into(),
        name: "Last Connected".into(),
        group_id: None,
        bootstrap_servers: "localhost:9092".into(),
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
        created_at: "2025-01-01T00:00:00Z".into(),
        updated_at: "2025-01-01T00:00:00Z".into(),
        last_connected_at: None,
        is_favorite: false,
        color_tag: None,
        notes: None,
    };
    db.save_connection(&conn).unwrap();

    assert_eq!(
        db.get_connection("last-conn-test")
            .unwrap()
            .unwrap()
            .last_connected_at,
        None
    );

    db.update_last_connected("last-conn-test").unwrap();
    let updated = db.get_connection("last-conn-test").unwrap().unwrap();
    assert!(
        updated.last_connected_at.is_some(),
        "last_connected_at 应已设置"
    );
    println!(
        "[TC-INT-013] last_connected_at = {:?}",
        updated.last_connected_at
    );

    db.delete_connection("last-conn-test").unwrap();
}

// ─────────────────────────────────────────────
// TC-INT-014: SQLite 设置批量操作与覆盖
// ─────────────────────────────────────────────
#[test]
fn tc_int_014_sqlite_settings_batch_and_override() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let keys = [
        "editor.fontSize",
        "editor.tabSize",
        "editor.wordWrap",
        "message.maxFetch",
        "message.dateFormat",
    ];
    let values = ["14", "4", "true", "100", "yyyy-MM-dd HH:mm:ss"];

    for (k, v) in keys.iter().zip(values.iter()) {
        db.set_setting(k, v).expect("设置失败");
    }

    let all = db.get_all_settings().expect("获取所有设置失败");
    assert_eq!(all.len(), 5, "应有 5 条设置");
    println!("[TC-INT-014] 批量写入 OK: {} 条", all.len());

    // 覆盖
    db.set_setting("editor.fontSize", "18").unwrap();
    let v = db.get_setting("editor.fontSize").unwrap();
    assert_eq!(v, Some("18".into()));
    println!("[TC-INT-014] 覆盖 OK: editor.fontSize = {:?}", v);

    // 连续覆盖不增加记录
    db.set_setting("editor.fontSize", "20").unwrap();
    let all2 = db.get_all_settings().unwrap();
    assert_eq!(all2.len(), 5, "覆盖不应增加记录数");
    println!("[TC-INT-014] 覆盖后记录数不变 OK");
}

// ─────────────────────────────────────────────
// TC-INT-015: 删除不存在的连接不报错
// ─────────────────────────────────────────────
#[test]
fn tc_int_015_delete_nonexistent_connection() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let result = db.delete_connection("nonexistent-id-12345");
    assert!(result.is_ok(), "删除不存在的连接不应报错");

    let loaded = db.get_connection("nonexistent-id-12345").unwrap();
    assert!(loaded.is_none(), "不存在的连接应返回 None");
    println!("[TC-INT-015] 删除不存在连接 OK");
}

// ─────────────────────────────────────────────
// TC-INT-016: Kafka 多分区 Topic 创建与验证
// ─────────────────────────────────────────────
#[test]
fn tc_int_016_topic_multi_partition() {
    let topic_name = "km-test-multi-partition";
    let cfg = kafka_config();
    let admin: AdminClient<DefaultClientContext> =
        AdminClient::from_config(&cfg).expect("创建 AdminClient 失败");
    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    let topic = NewTopic::new(topic_name, 4, TopicReplication::Fixed(1));
    let results = futures::executor::block_on(admin.create_topics([&topic], &opts))
        .expect("create_topics RPC 失败");

    for r in &results {
        match r {
            Ok(name) => println!("[TC-INT-016] 已创建 topic: {name}"),
            Err((name, code)) => println!("[TC-INT-016] topic 结果: {name} -> {code:?}"),
        }
    }

    let mut cfg2 = kafka_config();
    cfg2.set("group.id", "km-test-multi-part-verify");
    let consumer: BaseConsumer = cfg2.create().expect("创建 consumer 失败");

    let md = consumer
        .fetch_metadata(Some(topic_name), Duration::from_secs(10))
        .unwrap();
    let partitions = md
        .topics()
        .iter()
        .find(|t| t.name() == topic_name)
        .unwrap()
        .partitions()
        .len();
    assert_eq!(partitions, 4, "应有 4 个分区");
    println!("[TC-INT-016] 多分区 topic 验证 OK: {} 分区", partitions);

    let _ = futures::executor::block_on(admin.delete_topics(&[topic_name], &opts));
}

// ─────────────────────────────────────────────
// TC-INT-017: Kafka 消息 Key 与 Headers
// ─────────────────────────────────────────────
#[tokio::test]
async fn tc_int_017_produce_with_headers() {
    use rdkafka::message::{Header, OwnedHeaders};

    let topic_name = "km-test-headers";
    let cfg = kafka_config();
    let admin: AdminClient<DefaultClientContext> =
        AdminClient::from_config(&cfg).expect("创建 AdminClient 失败");
    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    let topic = NewTopic::new(topic_name, 1, TopicReplication::Fixed(1));
    let _ = admin.create_topics([&topic], &opts).await;
    tokio::time::sleep(Duration::from_secs(1)).await;

    let mut pcfg = kafka_config();
    pcfg.set("message.timeout.ms", "10000");
    let producer: FutureProducer = pcfg.create().expect("创建 producer 失败");

    let headers = OwnedHeaders::new()
        .insert(Header {
            key: "source",
            value: Some("integration-test"),
        })
        .insert(Header {
            key: "trace-id",
            value: Some("abc-123"),
        });

    let record = FutureRecord::to(topic_name)
        .key("header-test-key")
        .payload("header-test-value")
        .headers(headers);

    let (partition, offset) = producer
        .send(record, Timeout::After(Duration::from_secs(10)))
        .await
        .expect("发送消息失败");
    println!("[TC-INT-017] 生产含 headers: partition={partition}, offset={offset}");

    // Consume and verify
    let mut ccfg = kafka_config();
    ccfg.set("group.id", "km-test-headers-consumer");
    ccfg.set("enable.auto.commit", "false");
    ccfg.set("auto.offset.reset", "earliest");
    let consumer: BaseConsumer = ccfg.create().expect("创建 consumer 失败");
    consumer.subscribe(&[topic_name]).expect("订阅失败");

    let mut found_headers = false;
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    while std::time::Instant::now() < deadline {
        if let Some(Ok(msg)) = consumer.poll(Duration::from_millis(200)) {
            if let Some(hdrs) = msg.headers() {
                let count = hdrs.count();
                if count >= 2 {
                    found_headers = true;
                    println!("[TC-INT-017] 消费到 {} 个 headers", count);
                    for i in 0..count {
                        let h = hdrs.get(i);
                        println!("  header[{}]: key={}", i, h.key);
                    }
                    break;
                }
            }
        }
    }
    assert!(found_headers, "应能消费到含 headers 的消息");

    let _ = admin.delete_topics(&[topic_name], &opts).await;
    println!("[TC-INT-017] 清理完成");
}

// ─────────────────────────────────────────────
// TC-INT-018: SQLite 分组嵌套 (parent_id)
// ─────────────────────────────────────────────
#[test]
fn tc_int_018_sqlite_nested_groups() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let parent = kafka_manager_lib::storage::ConnectionGroupRow {
        id: "parent-grp".into(),
        name: "Parent".into(),
        sort_order: 0,
        parent_id: None,
    };
    db.save_group(&parent).unwrap();

    let child = kafka_manager_lib::storage::ConnectionGroupRow {
        id: "child-grp".into(),
        name: "Child".into(),
        sort_order: 1,
        parent_id: Some("parent-grp".into()),
    };
    db.save_group(&child).unwrap();

    let groups = db.list_groups().unwrap();
    assert_eq!(groups.len(), 2);

    let child_loaded = groups.iter().find(|g| g.id == "child-grp").unwrap();
    assert_eq!(child_loaded.parent_id, Some("parent-grp".into()));
    println!("[TC-INT-018] 嵌套分组 OK");

    // 删除父分组应级联删除子分组 (ON DELETE CASCADE)
    db.delete_group("parent-grp").unwrap();
    let after = db.list_groups().unwrap();
    assert_eq!(after.len(), 0, "级联删除后应无分组");
    println!("[TC-INT-018] 级联删除 OK");
}

// ─────────────────────────────────────────────
// TC-INT-019: SQLite 分组排序 (sort_order)
// ─────────────────────────────────────────────
#[test]
fn tc_int_019_sqlite_group_sort_order() {
    use kafka_manager_lib::storage::Database;

    let db = Database::new_in_memory().expect("创建内存数据库失败");
    db.init_tables().expect("初始化表失败");

    let make_group =
        |id: &str, name: &str, order: i32| kafka_manager_lib::storage::ConnectionGroupRow {
            id: id.into(),
            name: name.into(),
            sort_order: order,
            parent_id: None,
        };

    db.save_group(&make_group("z-id", "Zebra", 2)).unwrap();
    db.save_group(&make_group("a-id", "Alpha", 0)).unwrap();
    db.save_group(&make_group("m-id", "Mango", 1)).unwrap();

    let groups = db.list_groups().unwrap();
    assert_eq!(groups[0].name, "Alpha");
    assert_eq!(groups[1].name, "Mango");
    assert_eq!(groups[2].name, "Zebra");
    println!(
        "[TC-INT-019] 分组排序 OK: {:?}",
        groups.iter().map(|g| &g.name).collect::<Vec<_>>()
    );

    for g in &groups {
        db.delete_group(&g.id).unwrap();
    }
}
