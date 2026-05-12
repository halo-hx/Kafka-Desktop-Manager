# KafkaManager — 功能设计文档

> 基于 Tauri v2 + React + Rust 构建的 Apache Kafka 桌面管理工具

---

## 全局约定

### 术语表

| 术语 | 含义 |
|------|------|
| Cluster | 一个 Kafka 集群连接配置，包含 Bootstrap Servers 或 Zookeeper 地址 |
| Broker | Kafka 集群中的服务节点 |
| Topic | Kafka 消息的逻辑分类 |
| Partition | Topic 下的物理分区 |
| Consumer Group | 消费者组，一组协同消费 Topic 的消费者实例 |
| Offset | 消息在分区中的唯一序号 |
| Lag | 分区最新 Offset 与消费者当前 Offset 的差值 |
| Schema Registry | 存储和管理消息 Schema（Avro/Protobuf/JSON Schema）的注册中心 |
| Connector | Kafka Connect 中运行的数据连接器实例 |
| ACL | Access Control List，Kafka 访问控制规则 |
| ISR | In-Sync Replicas，与 Leader 保持同步的副本集合 |

### 全局 UI 规范

- **布局结构**：左侧树形导航栏（可折叠，宽度 240-360px 可拖拽调整）+ 右侧内容面板
- **主题**：支持亮色 / 暗色两种主题，默认跟随系统设置
- **语言**：中文 / English，默认中文
- **命令面板**：`Cmd+K`（macOS）/ `Ctrl+K`（Windows/Linux）唤出全局命令面板，支持模糊搜索所有操作
- **通知系统**：右上角 Toast 通知，分为 Success / Warning / Error / Info 四种级别，自动消失时间 3 秒（Error 需手动关闭）
- **确认弹窗**：所有破坏性操作（删除 Topic、重置 Offset、删除 ACL 等）必须弹出二次确认对话框，需用户输入资源名称确认
- **加载状态**：所有异步请求展示 loading 骨架屏或 spinner，超时时间 30 秒，超时后提示重试
- **空状态**：列表为空时展示友好的空状态插画 + 操作引导文案
- **错误处理**：Kafka 操作错误需展示完整错误码 + 错误描述 + 可能的解决建议

### 全局快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl + K` | 打开命令面板 |
| `Cmd/Ctrl + ,` | 打开设置 |
| `Cmd/Ctrl + N` | 新建连接 |
| `Cmd/Ctrl + R` | 刷新当前视图 |
| `Cmd/Ctrl + F` | 聚焦搜索框 |
| `Cmd/Ctrl + W` | 关闭当前标签页 |
| `Cmd/Ctrl + 1-9` | 切换到第 N 个标签页 |
| `Escape` | 关闭弹窗 / 取消当前操作 |

---

## 一、集群连接管理

### 1.1 功能概述

管理与 Kafka 集群的连接配置，支持多种认证方式和云平台连接模板。连接配置持久化存储在本地 SQLite 数据库中，敏感凭证通过 OS 密钥链加密存储。

### 1.2 数据模型

```
ClusterConnection {
  id: UUID                          // 连接唯一标识
  name: String                      // 连接显示名称（用户自定义）
  group_id: Option<UUID>            // 所属分组 ID（为空表示未分组）
  bootstrap_servers: String         // Bootstrap Servers 地址，逗号分隔，例 "host1:9092,host2:9092"
  kafka_version: String             // Kafka 版本，例 "3.6.0"
  zookeeper_host: Option<String>    // Zookeeper 地址（KRaft 模式下为空）
  zookeeper_port: Option<u16>       // Zookeeper 端口（默认 2181）
  zk_chroot_path: Option<String>    // Zookeeper chroot 路径（默认 "/"）

  // KRaft 配置
  cluster_mode: Enum                // AUTO_DETECT | ZOOKEEPER | KRAFT
  // AUTO_DETECT: 连接后自动检测集群模式（推荐）
  // ZOOKEEPER: 强制使用 Zookeeper 模式的 API
  // KRAFT: 强制使用 KRaft 模式的 API
  // 注意：KRaft 模式下 zookeeper_host 等字段可留空

  // 安全配置
  security_protocol: Enum           // PLAINTEXT | SASL_PLAINTEXT | SSL | SASL_SSL
  sasl_mechanism: Option<String>    // PLAIN | SCRAM-SHA-256 | SCRAM-SHA-512 | GSSAPI | AWS_MSK_IAM
  sasl_jaas_config: Option<String>  // JAAS 配置内容
  // MSK IAM 认证通过 librdkafka 的 oauthbearer_token_refresh_cb 实现
  // 需集成 aws-msk-iam-sasl-signer crate 生成 OAuth Bearer Token

  // SSL 配置（librdkafka 使用 PEM/PKCS12 格式，非 Java JKS）
  ssl_ca_cert_path: Option<String>         // CA 证书路径（PEM 格式）
  ssl_client_cert_path: Option<String>     // 客户端证书路径（PEM 格式，双向认证时需要）
  ssl_client_key_path: Option<String>      // 客户端私钥路径（PEM 格式）
  ssl_client_key_password: Option<String>  // 私钥密码，存储在 OS Keychain
  ssl_verify_hostname: bool                // 是否验证 SSL 主机名（默认 true）

  // Schema Registry（可选）
  schema_registry_url: Option<String>
  schema_registry_auth: Option<BasicAuth>  // 用户名/密码

  // Kafka Connect（可选）
  connect_urls: Vec<String>                // Connect Worker REST API 地址列表

  // 元数据
  created_at: DateTime
  updated_at: DateTime
  last_connected_at: Option<DateTime>
  is_favorite: bool
  color_tag: Option<String>                // 颜色标签，用于视觉区分
  notes: Option<String>                    // 用户备注
}

ConnectionGroup {
  id: UUID
  name: String
  sort_order: i32
  parent_id: Option<UUID>           // 支持嵌套分组
}
```

### 1.3 页面与交互设计

#### 1.3.1 连接列表页（左侧树形导航 - 顶层）

**布局**：
- 顶部工具栏：`+ 新建连接` 按钮 + `导入` 按钮 + 搜索输入框
- 树形列表：每个连接显示 `[颜色标签圆点] 连接名称 [状态图标]`
  - 状态图标：绿色圆点 = 已连接、灰色圆点 = 未连接、红色圆点 = 连接异常
  - 分组节点可折叠/展开，拖拽连接到分组可归类
- 底部状态栏：显示 `共 N 个集群，M 个已连接`

**右键菜单（连接节点）**：
- 连接 / 断开
- 编辑连接配置
- 复制连接（创建副本）
- 导出此连接
- 重命名
- 设置颜色标签 → 子菜单（红/橙/黄/绿/蓝/紫/无）
- 加入收藏 / 取消收藏
- 删除连接

**右键菜单（分组节点）**：
- 新建子分组
- 重命名分组
- 删除分组（确认是否删除分组内的连接或仅取消分组）

#### 1.3.2 新建/编辑连接对话框

**对话框尺寸**：640 x 520px，不可调整大小

**Tab 页签结构**：

**Tab 1：基本配置**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 连接名称 | 文本输入 | 是 | 用户自定义名称，最长 64 字符 |
| Bootstrap Servers | 文本输入 | 是 | 逗号分隔的 host:port，输入时自动补全端口 9092 |
| Kafka 版本 | 下拉选择 | 是 | 可选值：3.7 / 3.6 / 3.5 / 3.4 / 3.3 / 3.2 / 3.1 / 3.0 / 2.8 / 2.7 / 2.6 / 自定义 |
| Zookeeper 地址 | 文本输入 | 否 | KRaft 模式留空 |
| Zookeeper 端口 | 数字输入 | 否 | 默认 2181 |
| Chroot 路径 | 文本输入 | 否 | 默认 "/" |

**Tab 2：安全认证**
| 字段 | 类型 | 必填 | 条件显示 | 说明 |
|------|------|------|---------|------|
| 安全协议 | 下拉选择 | 是 | 始终 | PLAINTEXT / SASL_PLAINTEXT / SSL / SASL_SSL |
| SASL 机制 | 下拉选择 | 是 | 当协议含 SASL | PLAIN / SCRAM-SHA-256 / SCRAM-SHA-512 / GSSAPI / AWS_MSK_IAM |
| JAAS 配置 | 多行文本 | 是 | 当协议含 SASL | 支持语法高亮 |
| AWS Region | 文本输入 | 否 | 当 SASL 机制=AWS_MSK_IAM | MSK IAM 认证所需的 AWS 区域 |
| CA 证书路径 | 文件选择器 | 是 | 当协议含 SSL | PEM 格式，支持拖拽文件 |
| 客户端证书路径 | 文件选择器 | 否 | 当协议含 SSL | PEM 格式，双向认证时需要 |
| 客户端私钥路径 | 文件选择器 | 否 | 当协议含 SSL | PEM 格式 |
| 私钥密码 | 密码输入 | 否 | 当协议含 SSL | 密码类型，含显示/隐藏切换 |
| 验证 SSL 主机名 | 复选框 | — | 当协议含 SSL | 默认勾选 |

**Tab 3：高级配置**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Schema Registry URL | 文本输入 | 否 | 例 `http://localhost:8081` |
| Schema Registry 用户名 | 文本输入 | 否 | Basic Auth 用户名 |
| Schema Registry 密码 | 密码输入 | 否 | Basic Auth 密码 |
| Connect Worker URLs | 多行文本 | 否 | 每行一个 URL，例 `http://localhost:8083` |
| 备注 | 多行文本 | 否 | 自由备注，最长 500 字符 |

**底部操作栏**：
- `从模板填充` 下拉按钮：Azure Event Hubs / Amazon MSK (SCRAM) / Amazon MSK (IAM) / Confluent Cloud
  - 点击模板后自动填充对应的安全协议、SASL 机制、JAAS 配置模板（密码部分留占位符）
- `测试连接` 按钮：点击后显示转圈 loading，成功显示绿色 ✓ + 检测到的 Broker 数量和 Topic 数量，失败显示红色 ✗ + 错误详情
- `取消` 按钮
- `保存` 按钮（主按钮）

**交互规则**：
1. 选择安全协议后，根据类型动态显示/隐藏相关字段
2. 密码字段旁有"眼睛"图标切换明文/密文显示
3. 文件选择器支持拖拽文件或点击浏览
4. 切换到模板时弹出确认："使用模板将覆盖当前安全配置，是否继续？"
5. 保存前对 Bootstrap Servers 格式做校验（host:port 格式）
6. 测试连接时禁用保存按钮，防止重复提交

#### 1.3.3 连接配置导入/导出

**导出流程**：
1. 右键 "集群" 根节点 → "导出连接配置..."
2. 弹出对话框，勾选要导出的连接（默认全选）
3. 选择导出路径和文件名（默认 `kafka-connections-{日期}.json`）
4. 导出为 JSON 格式（不导出密码类字段，标记为 `"<REDACTED>"`）
5. 导出完成提示成功 + 打开文件所在目录的链接

**导入流程**：
1. 右键 "集群" 根节点 → "导入连接配置..."
2. 选择 JSON 文件（同时兼容 Offset Explorer 的 XML 格式导入）
3. 弹出预览对话框，显示将要导入的连接列表，可逐个勾选
4. 对于名称冲突的连接，提供选项：跳过 / 覆盖 / 重命名（添加后缀 "-imported"）
5. 导入后密码字段为空，需用户手动补填

### 1.4 Rust 后端接口

```
// Tauri Commands
connect_cluster(id: UUID) -> Result<ClusterInfo, KafkaError>
disconnect_cluster(id: UUID) -> Result<(), KafkaError>
test_connection(config: ClusterConnection) -> Result<TestResult, KafkaError>
save_connection(config: ClusterConnection) -> Result<UUID, StorageError>
delete_connection(id: UUID) -> Result<(), StorageError>
list_connections() -> Result<Vec<ClusterConnection>, StorageError>
export_connections(ids: Vec<UUID>, path: String) -> Result<(), IoError>
import_connections(path: String) -> Result<Vec<ClusterConnection>, IoError>
```

```
TestResult {
  success: bool
  broker_count: Option<u32>
  topic_count: Option<u32>
  kafka_version: Option<String>
  error_message: Option<String>
  latency_ms: u64
}
```

---

## 二、集群浏览器

### 2.1 功能概述

连接到集群后，左侧树形导航展示集群内的所有资源，右侧面板根据选中的节点显示对应的详情和操作界面。

### 2.2 树形结构定义

```
📁 集群名称 [状态: 已连接]
├── 📁 Brokers (3)
│   ├── 🖥️ Broker 0 (host1:9092) [Controller]
│   ├── 🖥️ Broker 1 (host2:9092)
│   └── 🖥️ Broker 2 (host3:9092)
├── 📁 Topics (42)
│   ├── 📁 [用户自定义文件夹]
│   │   ├── 📋 topic-name-1 (3 partitions)
│   │   └── 📋 topic-name-2 (6 partitions)
│   ├── 📋 topic-name-3 (12 partitions)
│   │   ├── 📊 Partition 0
│   │   ├── 📊 Partition 1
│   │   └── 📊 Partition 2
│   └── 📋 __consumer_offsets (50 partitions) [内部]
├── 📁 Consumer Groups (8)
│   ├── 👥 group-1 [Active]
│   ├── 👥 group-2 [Empty]
│   └── 👥 group-3 [Rebalancing]
├── 📁 Schema Registry
│   ├── 📄 subject-1 (v3)
│   └── 📄 subject-2 (v1)
├── 📁 Kafka Connect
│   ├── 🔌 connector-1 [Running]
│   └── 🔌 connector-2 [Failed]
├── 📁 ACLs
├── 📁 KRaft Controllers (仅 KRaft 模式显示)
│   ├── 🎛️ Controller 0 (host1:9093) [Leader]
│   ├── 🎛️ Controller 1 (host2:9093) [Voter]
│   └── 🎛️ Controller 2 (host3:9093) [Observer]
└── 📁 Zookeeper (仅 ZK 模式或混合模式且配置了 ZK 地址时显示)
    ├── 📁 /brokers
    ├── 📁 /consumers
    └── 📁 /config
```

**树形节点规则**：
- 所有文件夹节点显示子项数量
- Topic 节点显示分区数量
- Consumer Group 显示状态标签（Active / Empty / Rebalancing / Dead）
- 内部 Topic（以 `__` 开头）默认隐藏，可通过工具栏开关显示
- 收藏的节点在树形顶部单独显示一个 "⭐ 收藏夹" 文件夹
- 树形节点支持单击选中、双击展开/折叠
- 支持键盘上下箭头导航，Enter 展开/折叠，右键弹出上下文菜单

**树形工具栏**：
- 搜索框：输入关键词实时过滤树形节点（模糊匹配）
- 刷新按钮：重新获取集群元数据
- 折叠全部按钮
- 显示内部 Topic 开关

### 2.3 集群概览面板

**触发**：点击树形中的集群根节点

**面板布局**：
```
┌─────────────────────────────────────────────────┐
│  集群概览：my-cluster                             │
├─────────┬──────────┬───────────┬────────────────┤
│ Brokers │  Topics  │Partitions │ Consumer Groups│
│    3    │    42    │   186     │      8         │
├─────────┴──────────┴───────────┴────────────────┤
│                                                  │
│  Broker 详情表格                                  │
│  ┌─────┬──────────────┬──────┬──────┬──────────┐│
│  │ ID  │   Host       │ Port │ Rack │ 角色      ││
│  ├─────┼──────────────┼──────┼──────┼──────────┤│
│  │ 0   │ host1        │ 9092 │ az-1 │Controller││
│  │ 1   │ host2        │ 9092 │ az-2 │ Follower ││
│  │ 2   │ host3        │ 9092 │ az-1 │ Follower ││
│  └─────┴──────────────┴──────┴──────┴──────────┘│
│                                                  │
│  集群配置（只读展示常用配置）                       │
│  log.retention.hours: 168                        │
│  num.partitions: 3                               │
│  default.replication.factor: 2                   │
└─────────────────────────────────────────────────┘
```

### 2.4 KRaft Controllers 面板

**触发**：点击树形中的 "KRaft Controllers" 节点（仅 KRaft 模式集群显示）

**面板内容**：
```
┌──────────────────────────────────────────────────┐
│ KRaft Controller Quorum                           │
├──────────────────────────────────────────────────┤
│ Leader Controller: Controller 0 (host1:9093)     │
│ Quorum 状态: Stable                               │
│ 最新 Metadata Offset: 12345                       │
│ 最新 Metadata Epoch: 42                           │
├──────────────────────────────────────────────────┤
│ Controller 节点列表                                │
│ ┌──────┬──────────────┬──────┬──────────┬───────┐│
│ │ ID   │ Host         │ Port │ 角色      │ 状态  ││
│ ├──────┼──────────────┼──────┼──────────┼───────┤│
│ │ 0    │ host1        │ 9093 │ Leader   │ Active││
│ │ 1    │ host2        │ 9093 │ Voter    │ Active││
│ │ 2    │ host3        │ 9093 │ Observer │ Active││
│ └──────┴──────────────┴──────┴──────────┴───────┘│
│                                                   │
│ Metadata 日志信息                                  │
│ ┌────────────────────┬─────────────────┐         │
│ │ Log Start Offset   │ 0               │         │
│ │ Log End Offset     │ 12345           │         │
│ │ Log Segment Count  │ 3               │         │
│ │ 最近 Commit Offset │ 12340           │         │
│ └────────────────────┴─────────────────┘         │
└──────────────────────────────────────────────────┘
```

**KRaft vs Zookeeper 模式判断**：
- 连接集群后，后端通过 `describe_cluster` API 检测集群是否运行在 KRaft 模式
- KRaft 模式下：树形显示 "KRaft Controllers" 节点，隐藏 "Zookeeper" 节点
- Zookeeper 模式下：树形显示 "Zookeeper" 节点，隐藏 "KRaft Controllers" 节点
- 混合模式（迁移中）：两个节点同时显示，并在集群概览中标注 "ZK→KRaft 迁移中"

### 2.5 Broker 详情面板

**触发**：点击树形中的 Broker 节点

**面板内容**：
- Broker 基本信息卡片：Broker ID、Host、Port、Rack、是否 Controller
- Broker 配置列表：以表格展示所有 Broker 级别配置（key / value / source），支持搜索过滤
- Broker 管理的分区列表：该 Broker 作为 Leader 的分区列表（Topic / Partition / Replicas / ISR）

### 2.6 Zookeeper 浏览器面板

**触发**：展开树形中的 Zookeeper 节点

**面板内容**：
- 左侧树形展示 Zookeeper 节点路径层级
- 右侧面板显示选中 ZK 节点的数据内容（尝试以 JSON 格式化展示，否则展示原始字节/字符串）
- 显示节点元数据：版本号、创建时间、修改时间、子节点数、数据大小

---

## 三、消息管理

### 3.1 功能概述

消息管理是产品的核心功能模块，涵盖消息浏览、过滤、生产、保存四个子功能。

### 3.2 消息浏览

#### 3.2.1 触发方式

- 点击树形中的 **Topic 节点** → 右侧面板显示 Topic 级别的消息视图（跨所有分区）
- 点击树形中的 **Partition 节点** → 右侧面板显示该分区的消息视图

#### 3.2.2 Topic 详情面板（含消息浏览）

**Tab 结构**：

| Tab 页签 | 内容 |
|----------|------|
| 数据（Data） | 消息列表（默认展示页） |
| 属性（Properties） | Topic 配置和 Content Type 设置 |
| 分区（Partitions） | 分区分布详情 |
| 消费者（Consumers） | 消费该 Topic 的消费者组列表 |

#### 3.2.3 消息列表区域（Data Tab）

**顶部控制栏**：

```
┌──────────────────────────────────────────────────────────────────────┐
│ [▶ 获取] [⏹ 停止] [🔄 实时模式]  │ 消息范围: [最新 ▾]  │ 数量: [100▾] │
│                                                                      │
│ 过滤: [____________🔍] [Offset ▾] [☑Regex]   [+ 添加条件]           │
└──────────────────────────────────────────────────────────────────────┘
```

| 控件 | 类型 | 说明 |
|------|------|------|
| 获取按钮（▶） | 按钮 | 按当前配置从 Kafka 拉取消息，点击后变为加载状态 |
| 停止按钮（⏹） | 按钮 | 中断当前拉取操作，仅在拉取中可用 |
| 实时模式按钮（🔄） | 切换按钮 | 开启后进入 Observer 模式，持续消费最新消息并实时追加到表格 |
| 消息范围 | 下拉 | 最早 (Oldest) / 最新 (Newest) / 指定 Offset / 指定时间 |
| 数量 | 下拉 | 50 / 100 / 500 / 1000 / 5000 / 自定义（每次请求分批拉取，每批 100 条） |
| 过滤输入框 | 文本输入 | 输入过滤关键词 |
| 过滤字段选择 | 下拉多选 | Offset / Key / Value / Header Key / Header Value |
| Regex 复选框 | 复选框 | 是否启用正则表达式匹配 |
| 添加条件 | 按钮 | 添加多条过滤条件，条件之间支持 AND / OR 切换 |

**当选择 "指定 Offset"**：显示一个数字输入框让用户输入起始 Offset

**当选择 "指定时间"**：显示一个日期时间选择器（精确到毫秒）

**消息表格**：

| 列名 | 宽度 | 说明 |
|------|------|------|
| Partition | 60px | 分区号（仅 Topic 级别显示） |
| Offset | 80px | 消息 Offset |
| Timestamp | 160px | 消息时间戳，格式 `YYYY-MM-DD HH:mm:ss.SSS` |
| Key | 自适应 | 消息 Key 的预览（截断到 200 字符，鼠标悬停显示完整内容） |
| Value | 自适应 | 消息 Value 的预览（截断到 200 字符） |
| Headers | 80px | Header 数量标记（例 "3 headers"） |
| 大小 | 60px | Key + Value 的总字节数 |

**表格交互**：
- 点击列标题排序（默认按 Offset 降序）
- 单击行选中高亮，下方展开详情面板
- 支持 Ctrl+Click 多选（用于批量导出）
- 支持 Shift+Click 范围选择
- 双击行在新标签页中打开消息详情
- 右键菜单：复制 Key / 复制 Value / 复制为 JSON / 保存到文件 / 发送相同消息（克隆）

**分页/懒加载**：
- 当请求数量超过 100 条时，采用分批拉取策略：Rust 后端每次从 Kafka 拉取 100 条并通过 Tauri Event 推送到前端，前端追加渲染
- 表格使用虚拟滚动（Virtual Scroll），DOM 中仅渲染可视区域的行（约 30-50 行），确保万级消息列表不卡顿
- 表格底部显示 "加载更多" 按钮，或滚动到底部自动触发加载下一批
- 表格顶部显示进度指示：`已加载 200 / 1000 条消息`

#### 3.2.4 消息详情面板

**触发**：单击表格中的一行消息后，表格下方展开详情面板（可拖拽调整高度，默认 300px）

**面板布局**：
```
┌─────────────────────────────────────────────────────────┐
│ Partition: 2  │ Offset: 1234  │ Timestamp: 2026-05-11...│
├─────────────────────────────────────────────────────────┤
│ [Key] [Value] [Headers]                                 │ ← Tab 切换
├─────────────────────────────────────────────────────────┤
│ 格式: [Auto ▾] [Text ▾] [JSON ▾] [XML ▾] [Hex ▾]      │ ← 格式切换
│ [📋 复制] [💾 保存到文件]                                │ ← 操作按钮
├─────────────────────────────────────────────────────────┤
│                                                         │
│  {                                                      │
│    "userId": 12345,                                     │
│    "action": "login",                                   │
│    "timestamp": "2026-05-11T10:00:00Z"                  │
│  }                                                      │
│                                                         │
│  字节大小: 128 bytes                                     │
└─────────────────────────────────────────────────────────┘
```

**格式选项**：
| 格式 | 说明 |
|------|------|
| Auto | 自动检测格式：尝试 JSON → XML → UTF-8 String → Hex |
| Text | 强制 UTF-8 字符串显示 |
| JSON | JSON 美化展示（带语法高亮、折叠/展开、行号） |
| XML | XML 格式化展示（带缩进和语法高亮） |
| Hex | 十六进制 + ASCII 双栏显示（类似 Hex Editor） |
| Avro | 通过 Schema Registry 解码展示（需配置 Schema Registry） |
| Protobuf | 通过 .proto 文件或 Schema Registry 解码展示 |

**Headers Tab**：
以 Key-Value 表格展示所有 Headers：

| Header Key | Header Value | 格式 |
|-----------|-------------|------|
| trace-id | abc-123-def | Text |
| content-type | application/json | Text |

#### 3.2.5 实时消息流模式

**交互流程**：
1. 点击 "🔄 实时模式" 按钮开启
2. 按钮变为激活状态（蓝色高亮），旁边显示闪烁的红色圆点和 "LIVE" 标签
3. 新消息从表格顶部实时追加，每秒最多渲染 100 条（超过则批量合并渲染）
4. 表格自动滚动到最新消息（用户手动向上滚动后暂停自动滚动，底部出现 "⬇ 回到最新" 悬浮按钮）
5. 显示消息速率指标：`xx msgs/sec`
6. 再次点击按钮或点击停止按钮关闭实时模式

**技术实现要点**：
- 使用 Tauri Event 系统从 Rust 推送消息到前端
- Rust 端使用 `assign()` 而非 `subscribe()` 消费，不加入任何 Consumer Group
- 前端使用虚拟滚动（Virtual Scroll）处理大量消息渲染

### 3.3 消息过滤

#### 3.3.1 基础过滤

在消息列表顶部的过滤栏中操作：

1. 输入过滤文本
2. 通过下拉选择过滤字段（可多选）：Offset / Key / Value / Header Key / Header Value
3. 可选启用 Regex 模式
4. 过滤实时生效于已加载的消息列表（客户端过滤）

#### 3.3.2 高级过滤（JSONPath）

**触发**：点击过滤栏的 "高级过滤" 按钮

**弹出面板**：
```
┌────────────────────────────────────────────┐
│ 高级过滤                                    │
├────────────────────────────────────────────┤
│ 条件 1:                                    │
│ 字段: [Value ▾]                            │
│ JSONPath: [$.user.age          ]           │
│ 运算符: [> ▾]                              │
│ 值:     [18                   ]           │
│                                            │
│ [AND ▾]                                    │
│                                            │
│ 条件 2:                                    │
│ 字段: [Key ▾]                              │
│ 匹配:  [包含 ▾]                            │
│ 值:    [order-                ]           │
│                                            │
│ [+ 添加条件]                               │
│                                            │
│         [清除]  [应用]                      │
└────────────────────────────────────────────┘
```

**运算符选项**：等于 / 不等于 / 包含 / 不包含 / 大于 / 小于 / 正则匹配 / 存在 / 不存在

### 3.4 消息生产

#### 3.4.1 触发方式

- Topic 或 Partition 节点的右键菜单 → "发送消息"
- Topic 数据面板的工具栏 → "+" 发送消息按钮
- 消息表格右键 → "克隆并发送"（用当前消息内容预填充）

#### 3.4.2 发送消息对话框

**对话框尺寸**：720 x 560px

**Tab 页签**：单条发送 / 批量发送

**单条发送 Tab**：
```
┌──────────────────────────────────────────────────┐
│ 发送消息到: my-topic                              │
├──────────────────────────────────────────────────┤
│ 目标分区: [自动（按 Key 分区）▾]                   │
│                                                   │
│ Key                                               │
│ 格式: [String ▾]  [从文件加载]                     │
│ ┌──────────────────────────────────────────────┐ │
│ │ order-12345                                   │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ Value                                             │
│ 格式: [JSON ▾]  [从文件加载]  [从模板加载 ▾]       │
│ ┌──────────────────────────────────────────────┐ │
│ │ {                                             │ │
│ │   "orderId": "12345",                         │ │
│ │   "amount": 99.99                             │ │
│ │ }                                             │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ Headers                                           │
│ ┌──────────────┬─────────────────┬─────┐         │
│ │ Key          │ Value           │  ✕  │         │
│ ├──────────────┼─────────────────┼─────┤         │
│ │ trace-id     │ abc-123         │  ✕  │         │
│ │ content-type │ application/json│  ✕  │         │
│ └──────────────┴─────────────────┴─────┘         │
│ [+ 添加 Header]                                   │
│                                                   │
│ [□ 发送后保存为模板]                               │
│                                                   │
│              [取消]  [发送]                        │
└──────────────────────────────────────────────────┘
```

**格式选项**：String / JSON / Hex / Avro / Protobuf
- 选择 Avro / Protobuf 时，显示 Schema 选择下拉（从 Schema Registry 拉取可用 Schema 列表）
- JSON 格式时启用 JSON 编辑器（带语法高亮和格式化按钮）
- Hex 格式时显示 Hex 输入编辑器

**目标分区选项**：
- 自动（按 Key 分区）— 使用默认分区器
- 指定分区号 — 显示分区列表下拉（Partition 0 / 1 / 2 / ...）

**批量发送 Tab**：
```
┌──────────────────────────────────────────────────┐
│ 批量发送消息到: my-topic                          │
├──────────────────────────────────────────────────┤
│ 模式: [Key,Value 模式 ▾]                         │
│ 分隔符: [, ▾] (逗号)                             │
│                                                   │
│ ┌──────────────────────────────────────────────┐ │
│ │ order-001,{"amount":10.00}                    │ │
│ │ order-002,{"amount":20.00}                    │ │
│ │ order-003,{"amount":30.00}                    │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ [从文件加载...]                                   │
│                                                   │
│ 预览: 将发送 3 条消息                              │
│              [取消]  [发送]                        │
└──────────────────────────────────────────────────┘
```

**模式选项**：
- Key,Value 模式 — 每行格式为 `key<分隔符>value`
- 仅 Value 模式 — 每行为一条消息的 Value，Key 为空
- 仅 Key 模式 — 每行为一条消息的 Key，Value 为空

**发送结果反馈**：
- 成功：Toast 通知 "已发送 N 条消息到 topic-name"，显示 Partition 和 Offset 信息
- 失败：弹出错误对话框，显示失败原因和失败的消息列表

#### 3.4.3 消息模板管理

**数据模型**：
```
MessageTemplate {
  id: UUID
  name: String                  // 模板名称
  topic_pattern: Option<String> // 关联的 Topic 名称模式（用于自动推荐）
  key_format: ContentType       // String / JSON / Hex / Avro / Protobuf
  key_content: Option<String>   // Key 模板内容
  value_format: ContentType
  value_content: Option<String> // Value 模板内容
  headers: Vec<(String, String)> // 预设 Headers
  created_at: DateTime
  updated_at: DateTime
}
```

**模板管理入口**：
- 发送消息对话框 → "从模板加载" 下拉
- 全局设置 → 消息模板管理页面（增删改查）
- 发送消息后勾选 "发送后保存为模板" → 弹出命名对话框

### 3.5 消息保存与导出

#### 3.5.1 单条消息保存

**触发**：消息详情面板 → "💾 保存到文件" 按钮

**流程**：
1. 弹出保存对话框
2. 选择保存内容：Key / Value / 两者
3. 选择保存格式：原始字节 / 文本 / JSON 美化
4. 选择保存路径和文件名（默认 `{topic}_{partition}_{offset}_key.dat` 或 `_value.dat`）
5. 保存完成后 Toast 通知成功

#### 3.5.2 批量消息导出

**触发**：在消息表格中多选消息后，工具栏出现 "导出选中的 N 条消息" 按钮

**流程**：
1. 选择导出格式：JSON Lines / CSV / 原始二进制文件
2. JSON Lines 格式：每行一个 JSON 对象 `{"partition":0, "offset":123, "key":"...", "value":"...", "timestamp":..., "headers":{...}}`
3. CSV 格式：标题行 + 数据行，字段为 Partition / Offset / Timestamp / Key / Value
4. 二进制格式：按 Offset Explorer 兼容格式导出 Key 和 Value 的原始字节文件
5. 选择目标目录
6. 显示导出进度条
7. 完成后 Toast 通知 + 打开目标目录

#### 3.5.3 复制到剪贴板

- 右键消息 → "复制 Key"：复制 Key 内容为文本
- 右键消息 → "复制 Value"：复制 Value 内容为文本
- 右键消息 → "复制为 JSON"：复制整条消息为格式化 JSON（含 Partition / Offset / Key / Value / Headers / Timestamp）

---

## 四、Topic 管理

### 4.1 Topic 属性面板

**触发**：点击 Topic 节点 → Properties Tab

**面板内容**：
```
┌──────────────────────────────────────────────────┐
│ Topic: order-events                               │
├──────────────────────────────────────────────────┤
│ Content Type 设置                                 │
│                                                   │
│ Key 序列化类型:   [String      ▾]                 │
│ Value 序列化类型: [JSON        ▾]                 │
│ [更新]                                            │
├──────────────────────────────────────────────────┤
│ Topic 配置                                        │
│ ┌────────────────────────┬──────────┬──────────┐ │
│ │ 配置项                  │ 值       │ 来源     │ │
│ ├────────────────────────┼──────────┼──────────┤ │
│ │ cleanup.policy         │ delete   │ DEFAULT  │ │
│ │ retention.ms           │ 604800000│ TOPIC    │ │
│ │ segment.bytes          │ 1073741824│ DEFAULT │ │
│ │ min.insync.replicas    │ 2        │ TOPIC    │ │
│ │ ...                    │          │          │ │
│ └────────────────────────┴──────────┴──────────┘ │
│ [搜索配置项...] [仅显示非默认值 ☑]                 │
│                                                   │
│ [编辑配置]                                        │
└──────────────────────────────────────────────────┘
```

**Content Type 选项**：String / Hex / JSON / Avro / Protobuf / 自定义插件

**编辑配置交互**：
1. 点击 "编辑配置" 进入编辑模式
2. 值列变为可编辑状态（输入框）
3. 修改的值高亮显示（蓝色背景）
4. 底部出现 "取消" / "保存更改" 按钮
5. 保存前弹出确认对话框，显示变更内容摘要
6. 保存后刷新配置列表

### 4.2 Topic 分区面板

**触发**：点击 Topic 节点 → Partitions Tab

**面板内容**：

| 列 | 说明 |
|----|------|
| Partition | 分区 ID |
| Leader | Leader Broker ID |
| Replicas | 副本所在 Broker 列表 |
| ISR | In-Sync Replicas 列表 |
| Start Offset | 分区最早 Offset |
| End Offset | 分区最新 Offset |
| 消息数 | End Offset - Start Offset |
| 大小 | 分区数据大小（如果可获取） |

**非正常状态高亮**：
- ISR 数量 < Replicas 数量 → 行标黄（Under-replicated）
- Leader = -1 → 行标红（No Leader）

### 4.3 创建 Topic

**触发**：Topics 文件夹右键 → "创建 Topic" 或工具栏 "+" 按钮

**对话框**：
```
┌──────────────────────────────────────────────────┐
│ 创建 Topic                                        │
├──────────────────────────────────────────────────┤
│ Topic 名称:    [____________________]             │
│ 分区数:        [3        ]                        │
│ 副本因子:      [2        ]                        │
│                                                   │
│ 高级配置（可选）:                                  │
│ ┌──────────────────────┬────────────────┬─────┐  │
│ │ 配置项                │ 值             │  ✕  │  │
│ ├──────────────────────┼────────────────┼─────┤  │
│ │ retention.ms         │ 604800000      │  ✕  │  │
│ │ cleanup.policy       │ compact        │  ✕  │  │
│ └──────────────────────┴────────────────┴─────┘  │
│ [+ 添加配置项]                                    │
│                                                   │
│              [取消]  [创建]                        │
└──────────────────────────────────────────────────┘
```

**校验规则**：
- Topic 名称：非空，长度 1-249，仅允许字母、数字、`.`、`_`、`-`
- 分区数：正整数，1-10000
- 副本因子：正整数，不超过 Broker 数量
- 创建成功后自动刷新树形并选中新 Topic

### 4.4 删除 Topic

**触发**：Topic 节点右键 → "删除 Topic"

**确认对话框**：
- 警告文案："此操作不可撤销！Topic 下所有数据将被永久删除。"
- 需用户输入 Topic 名称确认（输入内容必须完全匹配）
- 输入匹配后 "删除" 按钮变为可用状态（红色危险按钮）

### 4.5 Topic 文件夹分组

**创建文件夹**：Topics 根节点右键 → "新建文件夹" → 输入文件夹名称

**操作**：
- 拖拽 Topic 到文件夹中进行分组
- 拖拽 Topic 出文件夹取消分组
- 文件夹支持重命名和删除（删除文件夹不删除其中的 Topic，Topic 回到根级别）
- 文件夹内 Topic 按名称排序

**持久化**：文件夹和分组关系存储在本地 SQLite 中，仅对当前用户生效，不影响 Kafka 集群

### 4.6 增加分区

**触发**：Topic 节点右键 → "增加分区"

**对话框**：
- 当前分区数：3（只读显示）
- 新分区数：[数字输入] （必须大于当前分区数）
- 警告提示："增加分区后不可减少。对于使用 Key 分区的 Topic，新分区可能导致相同 Key 的消息分布到不同分区。"
- [取消] [确认增加]

### 4.7 批量 Topic 操作

**触发**：Topics 文件夹节点右键 → "批量操作"

**功能**：
- 批量删除：勾选要删除的 Topic 列表，统一确认
- 批量配置修改：选择 Topic 列表 → 选择配置项 → 输入新值 → 应用到所有选中 Topic

---

## 五、消费者管理

### 5.1 Consumer Group 列表

**触发**：点击树形中的 "Consumer Groups" 文件夹节点

**右侧面板**：

| 列 | 说明 |
|----|------|
| Consumer Group | 消费者组 ID |
| 状态 | Active (绿色) / Empty (灰色) / Rebalancing (黄色) / Dead (红色) |
| 成员数 | 组内消费者实例数 |
| 订阅 Topic 数 | 订阅的 Topic 数量 |
| 总 Lag | 所有分区的 Lag 之和 |
| 协调器 Broker | Coordinator Broker ID |

**工具栏**：
- 搜索输入框：过滤 Consumer Group
- 刷新按钮
- 隐藏空组 开关（默认隐藏 Empty/Dead 状态的组）

### 5.2 Consumer Group 详情面板

**触发**：点击具体的 Consumer Group 节点

**Tab 结构**：

| Tab | 内容 |
|-----|------|
| Offsets | 每个分区的 Offset 和 Lag 详情 |
| Members | 消费者组成员列表 |
| 设置 | Consumer Group 操作 |

**Offsets Tab**：

| 列 | 说明 |
|----|------|
| Topic | Topic 名称 |
| Partition | 分区 ID |
| Start Offset | 分区最早 Offset |
| End Offset（Log End） | 分区最新 Offset |
| Consumer Offset | 消费者当前 Offset |
| Lag | End Offset - Consumer Offset（Lag > 0 标黄，Lag > 10000 标红） |
| 消费者实例 | 处理该分区的 Consumer 实例 ID |

**底部汇总行**：
- 总分区数 / 总 Lag / 平均 Lag

**Members Tab**：

| 列 | 说明 |
|----|------|
| 成员 ID | Consumer 实例的 Member ID |
| Client ID | 客户端 ID |
| Host | Consumer 运行的主机地址 |
| 分配的分区 | 该成员负责消费的分区列表 |
| 分区数 | 分配的分区数量 |

### 5.3 Offset 重置

**触发**：Consumer Group 详情面板 → 设置 Tab → "重置 Offset" 按钮

**前提条件**：消费者组必须处于 Empty 或 Dead 状态（无活跃消费者）。如果有活跃消费者，按钮置灰并提示 "请先停止所有消费者实例"

**对话框**：
```
┌──────────────────────────────────────────────────┐
│ 重置 Consumer Group Offset                        │
│ Group: my-consumer-group                          │
├──────────────────────────────────────────────────┤
│ 目标 Topic: [所有订阅的 Topic ▾]                  │
│                                                   │
│ 重置策略:                                         │
│ ○ 重置到最早 (Earliest)                           │
│ ○ 重置到最新 (Latest)                             │
│ ● 重置到指定时间 → [2026-05-11 00:00:00]         │
│ ○ 重置到指定 Offset → 每个分区单独指定             │
│ ○ 按偏移量调整 → 向前/向后 [____] 条              │
│                                                   │
│ ⚠️ 此操作将修改消费者组的 Offset 位置，            │
│    可能导致消息重复消费或跳过。                     │
│                                                   │
│ 预览:                                             │
│ ┌──────────┬───────────┬──────────┬──────────┐   │
│ │ Topic    │ Partition │ 当前Offset│ 目标Offset│  │
│ ├──────────┼───────────┼──────────┼──────────┤   │
│ │ topic-1  │ 0         │ 500      │ 0        │   │
│ │ topic-1  │ 1         │ 480      │ 0        │   │
│ │ topic-1  │ 2         │ 520      │ 0        │   │
│ └──────────┴───────────┴──────────┴──────────┘   │
│                                                   │
│              [取消]  [确认重置]                    │
└──────────────────────────────────────────────────┘
```

**选择 "重置到指定 Offset"** 时，每个分区显示一个数字输入框，用户可以逐个设置

### 5.4 删除 Consumer Group

**触发**：Consumer Group 节点右键 → "删除 Consumer Group"

**前提条件**：消费者组必须处于 Empty 或 Dead 状态

**确认对话框**：
- 显示 Consumer Group 名称和当前状态
- 需输入 Group 名称确认
- 确认后删除

### 5.5 Consumer Lag 监控

**Lag 显示规则**：
- Lag = 0：绿色，正常
- 0 < Lag ≤ 1000：默认色，轻微滞后
- 1000 < Lag ≤ 10000：黄色警告
- Lag > 10000：红色告警

**Lag 趋势图**（在 Consumer Group Offsets Tab 底部）：
- X 轴：时间（最近 1 小时，每 30 秒采样一次）
- Y 轴：Lag 值
- 每个分区一条折线，可点击图例显示/隐藏
- 数据存储在本地 SQLite 中，仅在应用运行期间采集
- **采集触发条件**：仅当用户打开 Consumer Group 详情面板时启动后台轮询采集，关闭面板后自动停止采集，避免后台资源浪费
- **采集上限**：同一时间最多为 5 个 Consumer Group 并行采集 Lag 数据

---

## 六、Schema Registry 管理

### 6.1 功能概述

完整的 Confluent Schema Registry GUI 管理功能，支持 Avro / Protobuf / JSON Schema 三种格式。

### 6.2 Schema 列表面板

**触发**：点击树形中的 "Schema Registry" 节点

**右侧面板**：

| 列 | 说明 |
|----|------|
| Subject | Schema Subject 名称 |
| 类型 | AVRO / PROTOBUF / JSON |
| 版本数 | 当前版本号 |
| 兼容性级别 | BACKWARD / FORWARD / FULL / NONE 等 |
| 最后更新时间 | 最近一次注册/更新的时间 |

**工具栏**：
- 搜索过滤
- "注册新 Schema" 按钮
- 刷新按钮

### 6.3 Schema 详情面板

**触发**：点击具体的 Schema Subject

**Tab 结构**：

| Tab | 内容 |
|-----|------|
| Schema | 当前版本的 Schema 内容（带语法高亮） |
| 版本历史 | 所有版本的列表，可切换查看每个版本的 Schema |
| 兼容性 | 兼容性级别设置和检查 |

**Schema Tab**：
- 版本选择下拉：v1 / v2 / v3 / ... （默认显示最新版本）
- Schema 内容以代码编辑器展示，只读模式，支持语法高亮和折叠
- 底部显示 Schema ID 和引用信息

**版本历史 Tab**：
- 左侧版本列表（v1 / v2 / v3 / ...），点击切换右侧显示
- 右侧显示选中版本的 Schema 内容
- 支持选择两个版本进行 Diff 对比（类似 Git Diff 的并排视图或行内视图）

**兼容性 Tab**：
- 当前兼容性级别显示 + 修改下拉（BACKWARD / BACKWARD_TRANSITIVE / FORWARD / FORWARD_TRANSITIVE / FULL / FULL_TRANSITIVE / NONE）
- "检查兼容性" 功能：粘贴新 Schema 内容 → 点击检查 → 显示是否兼容 + 不兼容时的具体错误信息

### 6.4 注册新 Schema

**触发**：Schema 列表工具栏 → "注册新 Schema"

**对话框**：
```
┌──────────────────────────────────────────────────┐
│ 注册 Schema                                       │
├──────────────────────────────────────────────────┤
│ Subject:  [____________________]                  │
│ 类型:     [AVRO ▾]                                │
│                                                   │
│ Schema 内容:                                      │
│ ┌──────────────────────────────────────────────┐ │
│ │ {                                             │ │
│ │   "type": "record",                           │ │
│ │   "name": "User",                             │ │
│ │   "fields": [                                 │ │
│ │     {"name": "id", "type": "long"},           │ │
│ │     {"name": "name", "type": "string"}        │ │
│ │   ]                                           │ │
│ │ }                                             │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ [从文件加载...]  [格式化]  [验证语法]              │
│                                                   │
│              [取消]  [注册]                        │
└──────────────────────────────────────────────────┘
```

**交互规则**：
- "验证语法" 按钮检查 Schema 语法正确性（不提交到 Registry）
- 注册前自动检查与已有版本的兼容性，不兼容时弹出警告并给出选项（强制注册 / 取消）
- 注册成功后刷新 Schema 列表

---

## 七、数据导入/导出工具

### 7.1 导出工具

**触发**：Topic 节点右键 → "导出 Topic 数据" 或 菜单栏 → 工具 → 导出

**向导式对话框（3 步）**：

**Step 1：选择数据源**
- 选择 Topic（下拉选择，支持搜索）
- 选择分区（全部 / 勾选特定分区）
- 消息范围：最早 N 条 / 最新 N 条 / 全部 / 指定 Offset 范围 / 指定时间范围
- 数量限制：[数字输入]

**Step 2：选择导出格式**
- 导出格式：JSON Lines / CSV / 二进制文件（Offset Explorer 兼容）
- Key 文件命名模式（仅二进制格式）：`{topic}_{partition}_{offset}_key.dat`
- Value 文件命名模式（仅二进制格式）：`{topic}_{partition}_{offset}_value.dat`
- 选择导出目标目录（文件选择器）
- 是否导出 Key / Value / Headers（复选框）

**Step 3：确认与执行**
- 显示导出配置摘要
- 估算文件数量和大小
- 进度条 + 已导出消息数 / 总消息数
- 完成后显示结果摘要：总消息数、总文件数、总大小、每个分区的明细

### 7.2 导入工具

**触发**：Topic 节点右键 → "导入数据到 Topic" 或 菜单栏 → 工具 → 导入

**向导式对话框（3 步）**：

**Step 1：选择数据源**
- 导入格式：JSON Lines / CSV / 二进制文件目录
- 选择源文件或目录
- 预览前 10 条数据

**Step 2：选择目标**
- 目标 Topic（下拉选择或新建）
- 分区策略：保留原分区 / 按 Key 重新分区 / 指定分区
- Key / Value 格式映射

**Step 3：确认与执行**
- 显示导入配置摘要
- 进度条 + 已导入消息数 / 总消息数
- 完成后显示结果摘要

### 7.3 跨集群复制

**触发**：Topic 节点右键 → "复制到其他集群"

**对话框**：
- 源集群 + 源 Topic（自动填充）
- 目标集群（下拉选择已配置的集群，目标集群必须已连接）
- 目标 Topic 名称（默认与源 Topic 同名，可修改）
- 如果目标 Topic 不存在，是否自动创建（勾选后显示分区数/副本因子配置）
- 复制范围：全部 / 最新 N 条 / 指定时间范围
- 速率限制：[不限制 / 100条/秒 / 500条/秒 / 1000条/秒 / 自定义]（防止目标集群过载）
- 预估信息：在用户选择复制范围后，自动计算预估消息数量和预估耗时
- 进度条和结果摘要

**风险提示**：
- 复制前弹出确认对话框，显示预估消息量和目标集群信息
- 复制过程中支持随时取消（已复制的消息不会回滚）
- 大批量复制（> 10000 条）时额外警告提示

---

## 八、Kafka Connect 管理

### 8.1 Connector 列表面板

**触发**：点击树形中的 "Kafka Connect" 节点

**右侧面板**：

| 列 | 说明 |
|----|------|
| Connector 名称 | Connector 实例名称 |
| 类型 | Source / Sink |
| 状态 | RUNNING (绿色) / PAUSED (黄色) / FAILED (红色) / UNASSIGNED (灰色) |
| Task 数 | 运行的 Task 数量 |
| Worker | 运行所在的 Connect Worker 地址 |

**工具栏**：
- "创建 Connector" 按钮
- 刷新按钮
- 搜索过滤

### 8.2 Connector 详情面板

**触发**：点击具体的 Connector 节点

**Tab 结构**：

| Tab | 内容 |
|-----|------|
| 概览 | Connector 状态、类型、配置摘要 |
| 配置 | 完整配置 Key-Value 表格（可编辑） |
| Tasks | Task 列表及每个 Task 的状态和错误信息 |

**概览 Tab**：
- 状态卡片：Connector 状态 + 运行时长
- 基本信息：类型、类名、Worker、创建时间
- 操作按钮栏：[暂停] [恢复] [重启] [删除]

**Tasks Tab**：

| 列 | 说明 |
|----|------|
| Task ID | Task 编号（0, 1, 2, ...） |
| 状态 | RUNNING / FAILED / UNASSIGNED |
| Worker | 运行所在的 Worker 地址 |
| 错误信息 | 仅 FAILED 状态显示，展示 trace 信息 |

右键菜单：重启 Task

### 8.3 创建 Connector

**对话框**：
```
┌──────────────────────────────────────────────────┐
│ 创建 Connector                                    │
├──────────────────────────────────────────────────┤
│ Connector 名称:  [____________________]           │
│ Connector 类名:  [____________________]           │
│                                                   │
│ 配置项:                                           │
│ ┌──────────────────────┬─────────────────┬─────┐ │
│ │ Key                  │ Value           │  ✕  │ │
│ ├──────────────────────┼─────────────────┼─────┤ │
│ │ connector.class      │ io.debezium...  │  ✕  │ │
│ │ tasks.max            │ 1               │  ✕  │ │
│ │ topics               │ my-topic        │  ✕  │ │
│ └──────────────────────┴─────────────────┴─────┘ │
│ [+ 添加配置项]                                    │
│                                                   │
│ [从 JSON 粘贴]  [验证配置]                        │
│                                                   │
│              [取消]  [创建]                        │
└──────────────────────────────────────────────────┘
```

**"从 JSON 粘贴"**：打开大文本框，用户可以直接粘贴 Connector 配置 JSON，自动解析为 Key-Value 表格

**"验证配置"**：调用 Connect REST API 的 validate 接口，显示验证结果

---

## 九、ACL 权限管理

### 9.1 ACL 列表面板

**触发**：点击树形中的 "ACLs" 节点

**右侧面板**：

| 列 | 说明 |
|----|------|
| 主体 (Principal) | 用户或组标识，例 `User:alice` |
| 资源类型 | TOPIC / GROUP / CLUSTER / TRANSACTIONAL_ID |
| 资源名称 | 具体的资源名称或 `*` (通配) |
| 匹配模式 | LITERAL / PREFIXED |
| 操作 | READ / WRITE / CREATE / DELETE / ALTER / DESCRIBE / ALL 等 |
| 权限类型 | ALLOW / DENY |
| 主机 | 允许的来源主机，`*` 表示所有 |

**工具栏**：
- "添加 ACL" 按钮
- 搜索过滤（按 Principal / 资源名称过滤）
- 按 Principal 分组 / 按资源分组 切换

### 9.2 添加 ACL

**对话框**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Principal | 文本输入 | 是 | 格式 `User:username` |
| 资源类型 | 下拉 | 是 | TOPIC / GROUP / CLUSTER / TRANSACTIONAL_ID |
| 资源名称 | 文本输入 | 是 | 具体名称或 `*` |
| 匹配模式 | 下拉 | 是 | LITERAL / PREFIXED |
| 操作 | 下拉多选 | 是 | READ / WRITE / CREATE / DELETE / ALTER / DESCRIBE / ALL |
| 权限类型 | 下拉 | 是 | ALLOW / DENY |
| 主机 | 文本输入 | 是 | 默认 `*` |

### 9.3 删除 ACL

**触发**：ACL 行右键 → "删除"

**确认对话框**：显示即将删除的 ACL 规则详情，需确认

---

## 十、增强功能

### 10.1 WASM 插件系统

**用途**：用户可以编写自定义消息解码器插件，用于展示 Kafka 不原生支持的数据格式

**插件接口定义**：
```
// 插件需要实现的接口（由 WASM 模块导出）
interface MessageDecoder {
  // 返回解码器显示名称，显示在 Content Type 下拉中
  get_display_name() -> String

  // 将原始字节解码为可读字符串
  decode(topic: String, partition: i64, offset: i64, key_or_value: Bytes, headers: Map) -> String
}
```

**插件管理页面**（设置 → 插件）：
- 插件列表：名称 / 文件路径 / 状态（已加载/错误）/ 操作（启用/禁用/删除）
- "添加插件" 按钮：选择 `.wasm` 文件
- 插件加载后自动出现在 Topic Content Type 下拉选项中

### 10.2 全局设置页面

**触发**：`Cmd/Ctrl + ,` 或 菜单栏 → 设置

**Tab 结构**：

| Tab | 设置项 |
|-----|--------|
| 通用 | 语言（中文/English）、主题（亮色/暗色/跟随系统）、启动时自动连接上次使用的集群、通知弹窗时长 |
| 编辑器 | JSON 编辑器缩进（2/4 空格）、字体大小（12-20px）、自动格式化 JSON、Hex 显示每行字节数（8/16/32） |
| 消息 | 默认消息加载数量、消息预览截断长度、时间戳显示格式（ISO 8601 / Unix 毫秒 / 自定义）、默认 Content Type |
| 快捷键 | 所有快捷键的查看和自定义 |
| 插件 | WASM 插件管理 |
| 消息模板 | 消息模板的增删改查 |
| 关于 | 版本信息、检查更新、开源许可 |

### 10.3 标签页系统

**设计**：参考浏览器/IDE 的标签页模式
- 双击树形节点在新标签页打开
- 标签页显示图标 + 名称
- 标签页右键菜单：关闭 / 关闭其他 / 关闭右侧 / 全部关闭
- 标签页可拖拽排序
- 标签页过多时出现左右滚动箭头
- 最大标签页数量：20（超过时最早的标签页自动关闭）

### 10.4 命令面板

**触发**：`Cmd/Ctrl + K`

**功能**：
- 搜索框 + 实时结果列表
- 搜索范围：所有操作命令（新建连接、创建 Topic、打开设置...）+ 所有资源（Topic / Consumer Group / 连接名称）
- 键盘上下选择 + Enter 执行
- 每个结果显示：图标 + 名称 + 快捷键（如有）+ 所属集群
- 最近使用的命令排在前面

### 10.5 自动更新

- 启动时静默检查更新（不打断用户操作）
- 发现新版本后在状态栏显示 "新版本可用" 提示
- 点击提示弹出更新对话框：当前版本 → 新版本 + 更新日志
- "立即更新" / "稍后提醒" 按钮
- 使用 Tauri 内置的自动更新机制（增量更新）

---

## 十一、技术架构

### 11.1 技术选型

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面框架 | Tauri v2 (Rust) | 轻量级跨平台框架，安装包小、启动快、内存占用低 |
| 前端框架 | React 18 + TypeScript | 成熟的组件化方案，生态丰富 |
| UI 组件库 | Ant Design 5 / Shadcn UI | 企业级组件库，表格/树/表单开箱即用 |
| 状态管理 | Zustand | 轻量级状态管理，适合桌面应用 |
| Kafka 客户端 | rdkafka (Rust) | 高性能 Kafka 客户端库，原生 Rust 绑定 |
| 本地存储 | SQLite (rusqlite) | 存储连接配置、用户偏好、收藏夹等 |
| 序列化 | serde + avro-rs + prost | Avro / Protobuf / JSON 多格式支持 |
| 构建工具 | Vite | 极速 HMR 开发体验 |
| 包管理 | pnpm | 高效的 Node 包管理 |

### 11.2 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端展示层 (React + TS)                │
│  树形浏览器 / 消息表格 / JSON 编辑器 / 配置表单 / 图表面板  │
├─────────────────────────────────────────────────────────┤
│                    通信层 (Tauri IPC)                     │
│       Tauri Command（请求/响应）/ Event（消息流推送）       │
├─────────────────────────────────────────────────────────┤
│                   后端服务层 (Rust)                       │
│  Kafka Admin / Consumer / Producer / Schema / Connect    │
├─────────────────────────────────────────────────────────┤
│                   持久化层 (SQLite)                       │
│           连接配置 / 用户偏好 / 收藏夹 / 模板              │
└─────────────────────────────────────────────────────────┘
```

### 11.3 Rust 后端模块

| 模块 | 职责 |
|------|------|
| `connection_manager` | 多集群连接生命周期管理、凭证加密存储 |
| `kafka_admin` | Topic CRUD、分区管理、ACL 管理、配置管理 |
| `kafka_consumer` | 消息消费、Offset 查询、Consumer Group 管理 |
| `kafka_producer` | 消息发送、批量生产、指定分区发送 |
| `schema_registry` | Schema Registry HTTP 客户端、Avro/Protobuf/JSON 解码 |
| `connect_manager` | Kafka Connect REST API 客户端 |
| `data_io` | 消息导入/导出、格式转换 |
| `storage` | SQLite 本地持久化、配置管理 |
| `plugin_host` | WASM 插件加载和执行沙箱 |

### 11.4 Tauri IPC 接口汇总

```
// 连接管理
connect_cluster(id) -> ClusterInfo
disconnect_cluster(id) -> ()
test_connection(config) -> TestResult
save_connection(config) -> UUID
delete_connection(id) -> ()
list_connections() -> Vec<ClusterConnection>
export_connections(ids, path) -> ()
import_connections(path) -> Vec<ClusterConnection>

// 集群浏览
get_cluster_overview(cluster_id) -> ClusterOverview
list_brokers(cluster_id) -> Vec<BrokerInfo>
get_broker_config(cluster_id, broker_id) -> Vec<ConfigEntry>

// Topic 管理
list_topics(cluster_id) -> Vec<TopicInfo>
get_topic_detail(cluster_id, topic) -> TopicDetail
create_topic(cluster_id, config) -> ()
delete_topic(cluster_id, topic) -> ()
update_topic_config(cluster_id, topic, configs) -> ()
add_partitions(cluster_id, topic, count) -> ()

// 消息管理（分批拉取：后端每批通过 Event 推送 100 条到前端）
fetch_messages(cluster_id, topic, partition, offset, count) -> stream_id
cancel_fetch(stream_id) -> ()
// Event: "kafka://fetch/{stream_id}" -> Vec<KafkaMessage>（每批 100 条）
// Event: "kafka://fetch/{stream_id}/done" -> FetchSummary（拉取完成通知）
send_message(cluster_id, topic, partition, key, value, headers) -> SendResult
send_batch_messages(cluster_id, topic, messages) -> Vec<SendResult>
save_message_to_file(message, path, format) -> ()

// 消息实时流（通过 Tauri Event）
start_live_consume(cluster_id, topic) -> stream_id
stop_live_consume(stream_id) -> ()
// Event: "kafka://messages/{stream_id}" -> KafkaMessage

// Consumer 管理
list_consumer_groups(cluster_id) -> Vec<ConsumerGroupInfo>
get_consumer_group_detail(cluster_id, group) -> ConsumerGroupDetail
reset_offsets(cluster_id, group, topic, strategy) -> Vec<PartitionOffset>
delete_consumer_group(cluster_id, group) -> ()

// Schema Registry
list_subjects(cluster_id) -> Vec<SubjectInfo>
get_schema(cluster_id, subject, version) -> SchemaDetail
register_schema(cluster_id, subject, schema) -> SchemaId
check_compatibility(cluster_id, subject, schema) -> CompatibilityResult
set_compatibility(cluster_id, subject, level) -> ()

// Kafka Connect
list_connectors(cluster_id) -> Vec<ConnectorInfo>
get_connector_detail(cluster_id, name) -> ConnectorDetail
create_connector(cluster_id, config) -> ()
update_connector(cluster_id, name, config) -> ()
delete_connector(cluster_id, name) -> ()
pause_connector(cluster_id, name) -> ()
resume_connector(cluster_id, name) -> ()
restart_connector(cluster_id, name) -> ()
restart_task(cluster_id, connector, task_id) -> ()

// ACL 管理
list_acls(cluster_id) -> Vec<AclEntry>
create_acl(cluster_id, acl) -> ()
delete_acl(cluster_id, acl) -> ()

// 导入/导出
export_topic_data(cluster_id, topic, config) -> ExportResult
import_topic_data(cluster_id, topic, config) -> ImportResult

// KRaft Controllers
get_cluster_mode(cluster_id) -> ClusterMode           // AUTO_DETECT 结果: KRAFT | ZOOKEEPER | HYBRID
describe_quorum(cluster_id) -> QuorumInfo             // Controller Quorum 状态
list_kraft_controllers(cluster_id) -> Vec<ControllerInfo>  // Controller 节点列表
get_metadata_log_info(cluster_id) -> MetadataLogInfo  // Metadata 日志信息

// Zookeeper
list_zk_children(cluster_id, path) -> Vec<ZkNode>
get_zk_node_data(cluster_id, path) -> ZkNodeData

// Topic 文件夹分组
create_topic_folder(cluster_id, name, parent_id) -> UUID
rename_topic_folder(folder_id, name) -> ()
delete_topic_folder(folder_id) -> ()
move_topic_to_folder(cluster_id, topic, folder_id) -> ()
remove_topic_from_folder(cluster_id, topic) -> ()

// 收藏夹
toggle_favorite(resource_type, resource_id) -> bool
list_favorites() -> Vec<FavoriteItem>

// 设置
get_settings() -> AppSettings
update_settings(settings) -> ()

// 插件
list_plugins() -> Vec<PluginInfo>
add_plugin(path) -> PluginInfo
remove_plugin(id) -> ()
toggle_plugin(id, enabled) -> ()

// 消息模板
list_templates() -> Vec<MessageTemplate>
save_template(template) -> UUID
delete_template(id) -> ()
```
