export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
export type ClusterMode = 'AUTO_DETECT' | 'ZOOKEEPER' | 'KRAFT';
export type SecurityProtocol = 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SSL' | 'SASL_SSL';
export type SaslMechanism = 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512' | 'GSSAPI' | 'AWS_MSK_IAM';

export interface ClusterConnection {
  id: string;
  name: string;
  groupId?: string;
  bootstrapServers: string;
  kafkaVersion: string;
  zookeeperHost?: string;
  zookeeperPort?: number;
  zkChrootPath?: string;
  clusterMode: ClusterMode;
  securityProtocol: SecurityProtocol;
  saslMechanism?: SaslMechanism;
  saslJaasConfig?: string;
  sslCaCertPath?: string;
  sslClientCertPath?: string;
  sslClientKeyPath?: string;
  sslClientKeyPassword?: string;
  sslVerifyHostname: boolean;
  schemaRegistryUrl?: string;
  schemaRegistryUsername?: string;
  schemaRegistryPassword?: string;
  connectUrls?: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
  isFavorite: boolean;
  colorTag?: string;
  notes?: string;
  // Runtime state (not persisted)
  status: ConnectionStatus;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  sortOrder: number;
  parentId?: string;
}

export interface BrokerInfo {
  id: number;
  host: string;
  port: number;
  rack?: string;
  isController: boolean;
}

export interface TopicInfo {
  name: string;
  partitionCount: number;
  replicationFactor: number;
  isInternal: boolean;
}

export interface ConsumerGroupInfo {
  groupId: string;
  state:
    | 'Active'
    | 'Stable'
    | 'Empty'
    | 'Rebalancing'
    | 'Dead'
    | 'PreparingRebalance'
    | 'CompletingRebalance';
  memberCount: number;
  subscribedTopicCount: number;
  totalLag: number;
  coordinatorBrokerId: number;
}

export interface ClusterOverviewData {
  clusterName: string;
  brokers: BrokerInfo[];
  topicCount: number;
  partitionCount: number;
  consumerGroupCount: number;
  clusterMode: ClusterMode;
  configs: Record<string, string>;
}

export interface KafkaMessage {
  partition: number;
  offset: number;
  timestamp: string;
  key: string;
  value: string;
  headers: Record<string, string>;
  size: number;
}

/** 消息拉取范围 */
export type MessageRange = 'newest' | 'oldest' | 'offset' | 'timestamp';

/** 过滤字段 */
export type FilterField = 'Offset' | 'Key' | 'Value' | 'Header Key' | 'Header Value';

/** 单条过滤条件（含可选 JSONPath，针对 Value JSON 子路径） */
export interface FilterCondition {
  id: string;
  field: FilterField;
  value: string;
  regex: boolean;
  logic: 'AND' | 'OR';
  /** JSONPath 风格路径，例如 $.user.id 或 user.name */
  jsonPath?: string;
}

export type PanelType =
  | { type: 'welcome' }
  | { type: 'cluster-dashboard'; clusterId: string }
  | { type: 'cluster-overview'; clusterId: string }
  | { type: 'broker-detail'; clusterId: string; brokerId: number }
  | { type: 'topic-data'; clusterId: string; topicName: string }
  | { type: 'topic-properties'; clusterId: string; topicName: string }
  | { type: 'topic-partitions'; clusterId: string; topicName: string }
  | { type: 'consumer-group-list'; clusterId: string }
  | { type: 'consumer-group-detail'; clusterId: string; groupId: string }
  | { type: 'schema-registry'; clusterId: string }
  | { type: 'schema-detail'; clusterId: string; subject: string }
  | { type: 'kafka-connect'; clusterId: string }
  | { type: 'connector-detail'; clusterId: string; connectorName: string }
  | { type: 'acl-list'; clusterId: string }
  | { type: 'settings' };

export interface ConnectorInfo {
  name: string;
  type: 'source' | 'sink';
  state: 'RUNNING' | 'PAUSED' | 'FAILED' | 'UNASSIGNED';
  taskCount: number;
  workerUrl: string;
}

export interface ConnectorDetail {
  name: string;
  type: string;
  state: string;
  config: Record<string, string>;
  tasks: ConnectorTask[];
  connectorClass?: string;
  workerUrl?: string;
  uptimeHuman?: string | null;
}

export interface ConnectorTask {
  taskId: number;
  state: 'RUNNING' | 'FAILED' | 'UNASSIGNED';
  workerUrl: string;
  errorMessage?: string;
}

export interface AclEntry {
  principal: string;
  resourceType: 'TOPIC' | 'GROUP' | 'CLUSTER' | 'TRANSACTIONAL_ID';
  resourceName: string;
  patternType: 'LITERAL' | 'PREFIXED';
  operation: string;
  permissionType: 'ALLOW' | 'DENY';
  host: string;
}

export interface TabItem {
  id: string;
  title: string;
  icon?: string;
  panel: PanelType;
  closable: boolean;
}

export interface SchemaSubjectInfo {
  subject: string;
  schemaType: 'AVRO' | 'PROTOBUF' | 'JSON';
  latestVersion: number;
  /** 已注册版本个数（列表「版本数」列） */
  versionCount?: number;
  compatibilityLevel: string;
  lastUpdated?: string;
}

export interface SchemaDetail {
  subject: string;
  version: number;
  id: number;
  schemaType: string;
  schema: string;
  references?: { name: string; subject: string; version: number }[];
}

export interface CompatibilityResult {
  isCompatible: boolean;
  messages?: string[];
}

/** 用户偏好（设置页持久化，不含连接等敏感数据） */
export interface AppUserSettings {
  autoConnectOnStartup: boolean;
  notificationToastSeconds: number;
  jsonIndent: 2 | 4;
  editorFontSize: number;
  autoFormatJson: boolean;
  hexBytesPerRow: 8 | 16 | 32;
  defaultMessageLoadCount: 50 | 100 | 500 | 1000 | 5000;
  messagePreviewTruncateLength: number;
  timestampDisplayFormat: 'iso8601' | 'unix_ms' | 'custom';
  timestampCustomPattern: string;
  defaultContentType: 'string' | 'json' | 'hex' | 'avro' | 'protobuf';
}

export const DEFAULT_APP_USER_SETTINGS: AppUserSettings = {
  autoConnectOnStartup: false,
  notificationToastSeconds: 5,
  jsonIndent: 2,
  editorFontSize: 14,
  autoFormatJson: true,
  hexBytesPerRow: 16,
  defaultMessageLoadCount: 100,
  messagePreviewTruncateLength: 256,
  timestampDisplayFormat: 'iso8601',
  timestampCustomPattern: 'yyyy-MM-dd HH:mm:ss',
  defaultContentType: 'string',
};

export interface PersistedSettingsBlob extends AppUserSettings {
  theme?: 'light' | 'dark' | 'system';
  language?: 'zh' | 'en';
}
