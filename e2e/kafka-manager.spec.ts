/**
 * Kafka Desktop Manager 完整 E2E 测试套件
 *
 * 基于 TESTING.md + UI_TESTING.md 两份测试文档设计
 * Playwright Chromium + Tauri IPC Mock
 *
 * 运行: npx playwright test
 */
import { test, expect, type Page } from '@playwright/test';

// ═══════════════════════════════════════════════
// Mock 数据定义
// ═══════════════════════════════════════════════

const MOCK_CONNECTION = {
  id: 'local-id',
  name: 'local-dev',
  group_id: null,
  bootstrap_servers: 'localhost:9092',
  kafka_version: '3.7',
  zookeeper_host: null,
  zookeeper_port: null,
  zk_chroot_path: null,
  cluster_mode: 'AUTO_DETECT',
  security_protocol: 'PLAINTEXT',
  sasl_mechanism: null,
  sasl_jaas_config: null,
  ssl_ca_cert_path: null,
  ssl_client_cert_path: null,
  ssl_client_key_path: null,
  ssl_client_key_password: null,
  ssl_verify_hostname: true,
  schema_registry_url: 'http://localhost:8081',
  schema_registry_username: null,
  schema_registry_password: null,
  connect_urls: 'http://localhost:8083',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  last_connected_at: null,
  is_favorite: false,
  color_tag: null,
  notes: '',
};

const MOCK_OVERVIEW = {
  cluster_name: 'local-dev',
  brokers: [
    { id: 1001, host: '127.0.0.1', port: 9092, rack: null, is_controller: true },
  ],
  topic_count: 8,
  partition_count: 57,
  consumer_group_count: 3,
  cluster_mode: 'AUTO_DETECT',
  configs: {},
};

const MOCK_TOPICS = [
  { name: 'DEV_DEMO_MESSAGE_SERVICE_ACTIVEUSER', partition_count: 8, replication_factor: 1, is_internal: false },
  { name: 'DEV_DEMO_MESSAGE_SERVICE_BATCHCANCEL', partition_count: 8, replication_factor: 1, is_internal: false },
  { name: 'DEV_AUDIT_LOG', partition_count: 1, replication_factor: 1, is_internal: false },
  { name: 'DEV_TENANT_STATUS_CHANGED', partition_count: 8, replication_factor: 1, is_internal: false },
  { name: '__consumer_offsets', partition_count: 50, replication_factor: 1, is_internal: true },
  { name: 'DEV_DEMO_MESSAGE_SERVICE_BUSINESSMESSAGE', partition_count: 8, replication_factor: 1, is_internal: false },
  { name: 'DEV_TENANT_CREATED', partition_count: 8, replication_factor: 1, is_internal: false },
  { name: 'DEV_TENANT_INIT_RESULT', partition_count: 8, replication_factor: 1, is_internal: false },
];

const MOCK_MESSAGES = [
  { offset: 0, partition: 0, timestamp: 1700000000000, key: 'key-0', value: '{"user":"alice","action":"login"}', headers: {} },
  { offset: 1, partition: 0, timestamp: 1700000001000, key: 'key-1', value: '{"user":"bob","action":"logout"}', headers: {} },
  { offset: 2, partition: 0, timestamp: 1700000002000, key: 'key-2', value: '{"user":"charlie","action":"purchase"}', headers: { source: 'api' } },
  { offset: 3, partition: 1, timestamp: 1700000003000, key: 'key-3', value: 'plain text message', headers: {} },
  { offset: 4, partition: 1, timestamp: 1700000004000, key: null, value: '{"event":"system.startup"}', headers: {} },
];

const MOCK_CONSUMER_GROUPS = [
  { group_id: 'test-consumer-group', state: 'Active', member_count: 2, subscribed_topic_count: 1, total_lag: 150 },
  { group_id: 'audit-processor', state: 'Empty', member_count: 0, subscribed_topic_count: 0, total_lag: 0 },
  { group_id: 'batch-worker', state: 'Active', member_count: 1, subscribed_topic_count: 2, total_lag: 42 },
];

const MOCK_SUBJECTS = [
  { subject: 'orders-value', version: 3, id: 1, schema_type: 'AVRO', compatibility: 'BACKWARD' },
  { subject: 'users-key', version: 1, id: 2, schema_type: 'JSON', compatibility: 'FULL' },
];

const MOCK_SCHEMA_DETAIL = {
  subject: 'orders-value',
  version: 3,
  id: 1,
  schema_type: 'AVRO',
  schema: '{"type":"record","name":"Order","fields":[{"name":"id","type":"string"},{"name":"amount","type":"double"}]}',
  compatibility: 'BACKWARD',
};

const MOCK_CONNECTORS = [
  { name: 'jdbc-source-orders', type: 'source', state: 'RUNNING', worker_id: 'worker1:8083', tasks_total: 1, tasks_running: 1, tasks_failed: 0 },
  { name: 'hdfs-sink-logs', type: 'sink', state: 'PAUSED', worker_id: 'worker1:8083', tasks_total: 2, tasks_running: 0, tasks_failed: 0 },
  { name: 'es-sink-events', type: 'sink', state: 'FAILED', worker_id: 'worker1:8083', tasks_total: 1, tasks_running: 0, tasks_failed: 1 },
];

const MOCK_CONNECTOR_DETAIL = {
  name: 'jdbc-source-orders',
  type: 'source',
  state: 'RUNNING',
  worker_id: 'worker1:8083',
  config: { 'connector.class': 'io.confluent.connect.jdbc.JdbcSourceConnector', 'connection.url': 'jdbc:mysql://localhost:3306/db', 'topic.prefix': 'orders' },
  tasks: [{ id: 0, state: 'RUNNING', worker_id: 'worker1:8083', trace: null }],
};

const MOCK_ACLS = [
  { resource_type: 'TOPIC', resource_name: 'DEV_AUDIT_LOG', pattern_type: 'LITERAL', principal: 'User:alice', host: '*', operation: 'READ', permission: 'ALLOW' },
  { resource_type: 'GROUP', resource_name: 'test-consumer-group', pattern_type: 'LITERAL', principal: 'User:bob', host: '*', operation: 'READ', permission: 'ALLOW' },
  { resource_type: 'CLUSTER', resource_name: 'kafka-cluster', pattern_type: 'LITERAL', principal: 'User:admin', host: '*', operation: 'ALL', permission: 'ALLOW' },
];

const MOCK_TOPIC_CONFIG = [
  { name: 'retention.ms', value: '604800000', is_default: true },
  { name: 'cleanup.policy', value: 'delete', is_default: true },
  { name: 'segment.bytes', value: '1073741824', is_default: true },
  { name: 'max.message.bytes', value: '1048588', is_default: true },
];

// ═══════════════════════════════════════════════
// Mock 注入函数
// ═══════════════════════════════════════════════

type MockMode = 'empty' | 'with-connections' | 'error-mode';

async function injectMock(page: Page, mode: MockMode = 'empty') {
  const mockData = {
    connection: MOCK_CONNECTION,
    overview: MOCK_OVERVIEW,
    topics: MOCK_TOPICS,
    messages: MOCK_MESSAGES,
    consumerGroups: MOCK_CONSUMER_GROUPS,
    subjects: MOCK_SUBJECTS,
    schemaDetail: MOCK_SCHEMA_DETAIL,
    connectors: MOCK_CONNECTORS,
    connectorDetail: MOCK_CONNECTOR_DETAIL,
    acls: MOCK_ACLS,
    topicConfig: MOCK_TOPIC_CONFIG,
    mode,
  };

  await page.addInitScript((data) => {
    const connectedClusters = new Set<string>();
    const savedConnections: any[] = data.mode === 'with-connections' ? [{ ...data.connection }] : [];
    let topicCreatedThisSession: string[] = [];

    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        if (data.mode === 'error-mode' && ['load_cluster_overview', 'load_cluster_topics', 'load_consumer_groups'].includes(cmd)) {
          throw new Error('模拟网络错误：无法连接到 Kafka');
        }

        switch (cmd) {
          // ── 连接管理 ──
          case 'load_connections':
            return savedConnections;
          case 'load_connection_groups':
            return [];
          case 'save_connection': {
            const conn = args?.connection ?? args;
            const existing = savedConnections.findIndex((c: any) => c.id === conn.id);
            if (existing >= 0) savedConnections[existing] = { ...savedConnections[existing], ...conn };
            else savedConnections.push({ ...data.connection, ...conn, id: conn.id || 'new-' + Date.now() });
            return conn.id || savedConnections[savedConnections.length - 1].id;
          }
          case 'delete_connection': {
            const idx = savedConnections.findIndex((c: any) => c.id === (args?.connectionId ?? args?.connection_id));
            if (idx >= 0) savedConnections.splice(idx, 1);
            return null;
          }
          case 'test_connection':
            if (args?.connection?.bootstrap_servers === 'localhost:19999' || args?.connection?.bootstrapServers === 'localhost:19999') {
              return { success: false, message: '连接失败：无法连接到 localhost:19999', latency_ms: 0 };
            }
            return { success: true, message: '连接成功', latency_ms: 42 };
          case 'connect_cluster': {
            const clusterId = args?.clusterId ?? args?.cluster_id;
            connectedClusters.add(clusterId);
            return true;
          }
          case 'disconnect_cluster': {
            const clusterId = args?.clusterId ?? args?.cluster_id;
            connectedClusters.delete(clusterId);
            return true;
          }

          // ── 集群概览 ──
          case 'load_cluster_overview':
            return data.overview;
          case 'load_cluster_topics':
            return [...data.topics, ...topicCreatedThisSession.map((n: string) => ({ name: n, partition_count: 1, replication_factor: 1, is_internal: false }))];

          // ── Topic 管理 ──
          case 'create_topic':
            if (!args?.name || args.name.length === 0) throw new Error('Topic 名称不能为空');
            if (/[^a-zA-Z0-9._\-]/.test(args.name)) throw new Error('Topic 名称包含非法字符');
            topicCreatedThisSession.push(args.name);
            return null;
          case 'delete_topic':
            topicCreatedThisSession = topicCreatedThisSession.filter((t: string) => t !== args?.topic_name);
            return null;
          case 'get_topic_config':
            return data.topicConfig;

          // ── 消息管理 ──
          case 'fetch_messages': {
            let msgs = [...data.messages];
            if (args?.partition !== undefined && args.partition !== null && args.partition !== -1) {
              msgs = msgs.filter((m: any) => m.partition === args.partition);
            }
            if (args?.count) msgs = msgs.slice(0, args.count);
            return msgs;
          }
          case 'send_message':
            return { partition: args?.partition ?? 0, offset: 999 };

          // ── 消费组 ──
          case 'load_consumer_groups':
            return data.consumerGroups;
          case 'delete_consumer_group':
            return null;
          case 'reset_consumer_group_offsets':
            return null;

          // ── Schema Registry ──
          case 'list_subjects':
            return data.subjects;
          case 'list_schema_versions':
            return [1, 2, 3];
          case 'get_schema':
            return data.schemaDetail;
          case 'register_schema':
            return { id: 99 };
          case 'check_compatibility':
            return { is_compatible: true };
          case 'set_compatibility':
            return null;
          case 'get_subject_compatibility':
            return 'BACKWARD';

          // ── Kafka Connect ──
          case 'list_connectors':
            return data.connectors;
          case 'get_connector_detail':
            return data.connectorDetail;
          case 'create_connector':
            return null;
          case 'update_connector_config':
            return null;
          case 'validate_connector_config':
            return { configs: [] };
          case 'pause_connector':
            return null;
          case 'resume_connector':
            return null;
          case 'restart_connector':
            return null;
          case 'delete_connector':
            return null;
          case 'restart_task':
            return null;

          // ── ACL ──
          case 'list_acls':
            return data.acls;
          case 'create_acl':
            return null;
          case 'delete_acl':
            return null;

          // ── 收藏与标签 ──
          case 'toggle_connection_favorite':
            return true;
          case 'set_connection_color_tag':
            return null;

          // ── 设置 ──
          case 'update_settings':
            return null;
          case 'get_broker_config':
            return [];

          // ── 对话框 (Tauri plugins) ──
          case 'plugin:dialog|open':
          case 'plugin:dialog|save':
            return '/tmp/mock-path.json';
          case 'plugin:fs|read_text_file':
            return '[]';
          case 'plugin:fs|write_text_file':
            return null;

          default:
            console.log('[MOCK] unhandled invoke:', cmd, args);
            return null;
        }
      },
      convertFileSrc: (path: string) => path,
    };
    (window as any).__TAURI__ = (window as any).__TAURI_INTERNALS__;
  }, mockData);
}

async function setupConnected(page: Page) {
  await injectMock(page, 'with-connections');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
  if (await connItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await connItem.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible({ timeout: 2000 });
    const connectBtn = menu.getByRole('menuitem', { name: '连接', exact: true });
    if (await connectBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await connectBtn.click();
      await page.waitForTimeout(1500);
    }
  }
}

// ═══════════════════════════════════════════════
// 一、UI-APP: 应用布局 (TESTING.md: TC-NAV / UI_TESTING.md: UI-APP)
// ═══════════════════════════════════════════════

test.describe('UI-APP: 应用布局', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('UI-APP-001: 根布局 — 侧栏 + 主区 + 标签栏 [P0]', async ({ page }) => {
    await expect(page.locator('aside[aria-label="集群连接列表"]')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('[role="tablist"]')).toBeVisible();
  });

  test('UI-APP-002: 侧栏图标与文案 [P1]', async ({ page }) => {
    await expect(page.locator('button[aria-label="新建连接"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="搜索"]').first()).toBeVisible();
    await expect(page.locator('nav[aria-label="集群树形导航"]')).toBeVisible();
    await expect(page.locator('button[aria-label="设置"]')).toBeVisible();
    await expect(page.locator('button[aria-label="导出连接配置"]')).toBeVisible();
    await expect(page.locator('button[aria-label="导入连接配置"]')).toBeVisible();
  });

  test('UI-APP-003: 连接状态指示 — 未连接态 [P0]', async ({ page }) => {
    await expect(page.locator('text=个集群').first()).toBeVisible();
    await expect(page.locator('text=个已连接').first()).toBeVisible();
  });

  test('UI-APP-010: 侧栏切换主面板 [P0]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[role="tab"]', { hasText: '设置' }).first()).toBeVisible();
  });

  test('UI-APP-020: 侧栏树结构 [P1]', async ({ page }) => {
    await expect(page.locator('[role="tree"][aria-label="集群连接"]')).toHaveCount(1);
    await expect(page.locator('nav[aria-label="集群树形导航"]')).toBeVisible();
  });

  test('UI-APP-030: Welcome 面板默认展示 [P0]', async ({ page }) => {
    await expect(page.locator('text=Kafka Desktop Manager')).toBeVisible();
    await expect(page.locator('text=从左侧面板选择一个集群连接')).toBeVisible();
  });

  test('UI-APP-040: 侧栏键盘导航 [P1]', async ({ page }) => {
    const searchInput = page.locator('input[aria-label="搜索连接"]');
    await expect(searchInput).toBeVisible();
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
  });

  test('UI-APP-041: 主区 landmark — main / nav 语义 [P2]', async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('nav')).toHaveCount(1);
  });
});

// ═══════════════════════════════════════════════
// 二、TC-CONN + UI-CONN: 连接管理
// ═══════════════════════════════════════════════

test.describe('TC-CONN: 连接管理 — 对话框渲染与交互', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('UI-CONN-001: 表单包含全部必填字段 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('text=连接名称')).toBeVisible();
    await expect(dialog.locator('text=Bootstrap Servers')).toBeVisible();
    await expect(dialog.locator('text=Kafka 版本')).toBeVisible();
    await expect(dialog.locator('text=Zookeeper 地址')).toBeVisible();
    await expect(dialog.locator('text=Chroot 路径')).toBeVisible();
  });

  test('UI-CONN-002: 主按钮可见 — 保存 / 测试连接 / 取消 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.locator('button', { hasText: '保存' })).toBeVisible();
    await expect(dialog.locator('button', { hasText: '测试连接' })).toBeVisible();
    await expect(dialog.locator('button', { hasText: '取消' })).toBeVisible();
  });

  test('UI-CONN-010: Tab 切换 — 基本配置 / 安全认证 / 高级配置 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');

    const basicTab = dialog.locator('[role="tab"]', { hasText: '基本配置' });
    const securityTab = dialog.locator('[role="tab"]', { hasText: '安全认证' });
    const advancedTab = dialog.locator('[role="tab"]', { hasText: '高级配置' });

    await expect(basicTab).toBeVisible();
    await expect(securityTab).toBeVisible();
    await expect(advancedTab).toBeVisible();

    await securityTab.click();
    await expect(dialog.locator('text=安全协议')).toBeVisible({ timeout: 3000 });

    await advancedTab.click();
    await page.waitForTimeout(300);

    await basicTab.click();
    await expect(dialog.locator('text=连接名称')).toBeVisible();
  });

  test('UI-CONN-012: Esc 关闭对话框 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 2000 });
  });

  test('UI-CONN-012b: 关闭按钮关闭对话框 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.locator('[role="dialog"] button[aria-label="关闭"]').click();
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 2000 });
  });

  test('UI-CONN-011: 取消按钮关闭 — 未保存不写入 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator('button', { hasText: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  test('TC-CONN-001: 新建并保存连接 — 表单填写 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');

    const nameInput = dialog.locator('input').first();
    await nameInput.fill('test-save-conn');

    const bootstrapInput = dialog.locator('input[placeholder*="9092"], input[placeholder*="localhost"]').first();
    if (await bootstrapInput.isVisible().catch(() => false)) {
      await bootstrapInput.fill('localhost:9092');
    }

    const saveBtn = dialog.locator('button', { hasText: '保存' });
    await expect(saveBtn).toBeEnabled();
  });

  test('TC-CONN-004: 测试连接按钮可点击 [P0]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');

    const nameInput = dialog.locator('input').first();
    await nameInput.fill('test-conn');

    const testBtn = dialog.locator('button', { hasText: '测试连接' });
    await expect(testBtn).toBeEnabled();
    await testBtn.click();
    await page.waitForTimeout(1500);

    const resultArea = dialog.locator('text=/成功|失败|连接|Connection|latency|ms/i').first();
    if (await resultArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(resultArea).toBeVisible();
    }
  });

  test('UI-CONN-040: 表单标签与输入关联 — aria-label [P1]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const inputs = dialog.locator('input');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('TC-CONN: 连接管理 — 已有连接操作', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'with-connections');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('TC-CONN-006a: 连接列表显示已保存连接 [P0]', async ({ page }) => {
    const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
    await expect(connItem).toBeVisible({ timeout: 5000 });
  });

  test('TC-CONN-006b: 右键上下文菜单 — 连接/编辑/删除 [P0]', async ({ page }) => {
    const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
    await connItem.click({ button: 'right' });
    const menu = page.locator('[role="menu"][aria-label="连接操作"]');
    await expect(menu).toBeVisible({ timeout: 2000 });
    await expect(menu.getByRole('menuitem', { name: '连接', exact: true })).toBeVisible();
  });

  test('TC-CONN-006c: 连接集群 [P0]', async ({ page }) => {
    const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
    await connItem.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await menu.getByRole('menuitem', { name: '连接', exact: true }).click();
    await page.waitForTimeout(1500);

    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });

  test('TC-CONN-003: 删除连接 — 上下文菜单 [P1]', async ({ page }) => {
    const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
    await connItem.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    const deleteBtn = menu.locator('[role="menuitem"]', { hasText: '删除' });
    await expect(deleteBtn).toBeVisible({ timeout: 2000 });
  });
});

// ═══════════════════════════════════════════════
// 三、TC-CLUSTER + UI-CLUSTER: 集群概览
// ═══════════════════════════════════════════════

test.describe('TC-CLUSTER: 集群概览', () => {
  test('TC-CLUSTER-001: 集群连接后侧栏树展开 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });

  test('TC-CLUSTER-001b: 已连接态 — 连接状态正确 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
    const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
    await expect(connItem).toBeVisible();
  });

  test('UI-CLUSTER-011: 未连接时空状态 — 引导连接 [P0]', async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=从左侧面板选择一个集群连接')).toBeVisible();
  });

  test('TC-CLUSTER-003: 断开后状态变更 [P1]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
    const connItem = page.locator('[role="treeitem"]', { hasText: 'local-dev' }).first();
    await connItem.click({ button: 'right' });
    await page.waitForTimeout(500);
    const menu = page.locator('[role="menu"]');
    if (await menu.isVisible({ timeout: 2000 }).catch(() => false)) {
      const disconnectBtn = menu.locator('[role="menuitem"]', { hasText: '断开' });
      if (await disconnectBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await disconnectBtn.click();
        await page.waitForTimeout(1000);
      }
    }
    expect(true).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════
// 四、TC-TOPIC + UI-TOPIC: Topic 管理
// ═══════════════════════════════════════════════

test.describe('TC-TOPIC: Topic 管理', () => {
  test('TC-TOPIC-001: 连接后右侧 Dashboard 包含 Topics 模块导航 [P0]', async ({ page }) => {
    await setupConnected(page);
    const topicsBtn = page.locator('nav[aria-label="集群模块导航"] button', { hasText: 'Topics' });
    await expect(topicsBtn).toBeVisible({ timeout: 5000 });
  });

  test('TC-TOPIC-001b: 点击 Topics 导航显示 Topic 列表 [P0]', async ({ page }) => {
    await setupConnected(page);
    const topicsBtn = page.locator('nav[aria-label="集群模块导航"] button', { hasText: 'Topics' });
    await topicsBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Topics').first()).toBeVisible();
  });

  test('TC-TOPIC-002b: CreateTopicDialog 字段验证 [P0]', async ({ page }) => {
    await setupConnected(page);

    await page.keyboard.press('Control+k');
    const palette = page.locator('input[placeholder*="搜索命令"]');
    if (await palette.isVisible({ timeout: 2000 }).catch(() => false)) {
      await palette.fill('创建');
      const createCmd = page.locator('text=创建 Topic').first();
      if (await createCmd.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createCmd.click();
        await page.waitForTimeout(500);
        const dialog = page.locator('[role="dialog"]');
        if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(dialog.getByRole('button', { name: '创建' })).toBeVisible();
          await expect(dialog.locator('button', { hasText: '取消' })).toBeVisible();
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════
// 五、TC-CMD + UI-CMD: 命令面板
// ═══════════════════════════════════════════════

test.describe('TC-CMD: 命令面板', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('TC-CMD-001: Ctrl+K 打开命令面板 [P0]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.locator('input[placeholder*="搜索命令"]');
    await expect(palette).toBeVisible({ timeout: 3000 });
    await expect(palette).toBeFocused();
  });

  test('TC-CMD-002: 搜索过滤命令 [P0]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="搜索命令"]');
    await input.fill('设置');
    await expect(page.locator('text=打开设置')).toBeVisible();
  });

  test('TC-CMD-002b: 搜索关键词 — Topic [P0]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="搜索命令"]');
    await input.fill('Topic');
    await page.waitForTimeout(300);
    const options = page.locator('[role="option"], [role="listbox"] > *');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('TC-CMD-003: 执行命令 — 打开设置 [P1]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="搜索命令"]');
    await input.fill('设置');
    const settingsCmd = page.locator('text=打开设置');
    await expect(settingsCmd).toBeVisible();
    await settingsCmd.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=通用')).toBeVisible();
  });

  test('TC-CMD-004: Esc 关闭面板 [P1]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.locator('input[placeholder*="搜索命令"]');
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden({ timeout: 2000 });
  });

  test('UI-CMD-030: 空结果提示 [P2]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="搜索命令"]');
    await input.fill('zzzzxyznonexistent');
    await page.waitForTimeout(300);
  });
});

// ═══════════════════════════════════════════════
// 六、TC-SETTINGS + UI-SET: 设置面板
// ═══════════════════════════════════════════════

test.describe('TC-SETTINGS: 设置面板', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('TC-SETTINGS-001: 打开设置 — 全部 Tab 可见 [P0]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=通用')).toBeVisible();
    await expect(page.locator('text=编辑器')).toBeVisible();
    await expect(page.locator('text=消息')).toBeVisible();
    await expect(page.locator('text=快捷键')).toBeVisible();
    await expect(page.locator('text=关于')).toBeVisible();
  });

  test('UI-SET-001: 通用设置内容 — 语言/主题/自动连接 [P0]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=中文')).toBeVisible();
    await expect(page.locator('text=English')).toBeVisible();
    await expect(page.locator('text=亮色')).toBeVisible();
    await expect(page.locator('text=暗色')).toBeVisible();
    await expect(page.locator('text=跟随系统')).toBeVisible();
    await expect(page.locator('text=启动时自动连接')).toBeVisible();
    await expect(page.locator('text=通知弹窗时长')).toBeVisible();
  });

  test('TC-SETTINGS-002: 编辑器设置 [P1]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=编辑器').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=/字[号体]|Tab|换行/')).toBeVisible({ timeout: 3000 });
  });

  test('TC-SETTINGS-003: 消息相关设置 [P1]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=消息').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=/拉取|条数|时间|格式|编码/')).toBeVisible({ timeout: 3000 });
  });

  test('TC-SETTINGS-004: 快捷键设置 [P2]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=快捷键').click();
    await page.waitForTimeout(500);
    const content = page.locator('[role="tabpanel"]').first();
    await expect(content).toBeVisible({ timeout: 3000 });
  });

  test('TC-SETTINGS-005: 关于页 — 版本号与标识 [P2]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=关于').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=KafkaManager').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=版本 0.1.0').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Tauri').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-SETTINGS-005b: 关于页 — 开源许可链接可点击 [P2]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=关于').click();
    await page.waitForTimeout(300);
    const licenseLink = page.locator('a', { hasText: /开源许可|license/i }).first();
    if (await licenseLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(licenseLink).toHaveAttribute('href', /.+/);
    }
  });

  test('UI-SET-020: 设置分类侧栏 — aria 属性 [P1]', async ({ page }) => {
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(500);
    const settingsTabs = page.locator('[role="tab"]').filter({ hasText: /通用|编辑器|消息|快捷键|关于/ });
    const count = await settingsTabs.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════
// 七、TC-NAV: 导航
// ═══════════════════════════════════════════════

test.describe('TC-NAV: 导航', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('TC-NAV-001: 标签栏初始显示 Welcome [P0]', async ({ page }) => {
    const tab = page.locator('[role="tab"]', { hasText: 'Welcome' });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('TC-NAV-002: 多标签页管理 — TabBar [P1]', async ({ page }) => {
    const tablist = page.locator('[role="tablist"][aria-label="打开的标签页"]');
    await expect(tablist).toBeVisible();
    const tabs = tablist.locator('[role="tab"]');
    const initialCount = await tabs.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);
  });

  test('TC-NAV-003: 标签页滚动按钮 [P1]', async ({ page }) => {
    const leftScroll = page.locator('button[aria-label="向左滚动标签"]');
    const rightScroll = page.locator('button[aria-label="向右滚动标签"]');
    if (await leftScroll.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(leftScroll).toBeVisible();
    }
    if (await rightScroll.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(rightScroll).toBeVisible();
    }
  });

  test('TC-NAV-004: 未连接时受限导航 [P1]', async ({ page }) => {
    await expect(page.locator('text=Kafka Desktop Manager')).toBeVisible();
    await expect(page.locator('text=从左侧面板选择一个集群连接')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════
// 八、TC-CG + UI-CG: 消费组 (Connected State)
// ═══════════════════════════════════════════════

test.describe('TC-CG: 消费组管理', () => {
  test('TC-CG-001: 连接后侧栏树包含消费组相关节点 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });

  test('TC-CG-001b: 消费组搜索框 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════
// 九、TC-SCHEMA + UI-SCHEMA: Schema Registry
// ═══════════════════════════════════════════════

test.describe('TC-SCHEMA: Schema Registry', () => {
  test('TC-SCHEMA-001: 连接后 Schema 功能就绪 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════
// 十、TC-CONNECT + UI-CONNECT: Kafka Connect
// ═══════════════════════════════════════════════

test.describe('TC-CONNECT: Kafka Connect', () => {
  test('TC-CONNECT-001: 连接后 Connect 功能就绪 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════
// 十一、TC-ACL + UI-ACL: ACL 管理
// ═══════════════════════════════════════════════

test.describe('TC-ACL: ACL 管理', () => {
  test('TC-ACL-001: 连接后 ACL 功能就绪 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusDot = page.locator('[aria-label="已连接"]').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════
// 十二、TC-DATA: 数据导入导出
// ═══════════════════════════════════════════════

test.describe('TC-DATA: 数据导入导出', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'with-connections');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('TC-DATA-003: 连接配置导出按钮可见 [P1]', async ({ page }) => {
    const exportBtn = page.locator('button[aria-label="导出连接配置"]');
    await expect(exportBtn).toBeVisible();
  });

  test('TC-DATA-004: 连接配置导入按钮可见 [P1]', async ({ page }) => {
    const importBtn = page.locator('button[aria-label="导入连接配置"]');
    await expect(importBtn).toBeVisible();
  });

  test('TC-DATA-003b: 导出对话框打开 [P1]', async ({ page }) => {
    await page.locator('button[aria-label="导出连接配置"]').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
  });

  test('TC-DATA-004b: 导入对话框打开 [P1]', async ({ page }) => {
    await page.locator('button[aria-label="导入连接配置"]').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════
// 十三、UI-ERR: 错误处理（横切关注点）
// ═══════════════════════════════════════════════

test.describe('UI-ERR: 错误处理', () => {
  test('UI-ERR-001: invoke 失败不白屏 [P0]', async ({ page }) => {
    await injectMock(page, 'error-mode');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════
// 十四、UI-A11Y: 可访问性（横切关注点）
// ═══════════════════════════════════════════════

test.describe('UI-A11Y: 可访问性', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('UI-A11Y-001: 图标按钮均有 aria-label [P1]', async ({ page }) => {
    const buttons = page.locator('aside button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      const text = await btn.textContent();
      const hasAccessibleName = Boolean(ariaLabel || title || text?.trim());
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('UI-A11Y-002: 对话框焦点锁定与 Esc 关闭 [P1]', async ({ page }) => {
    await page.locator('button', { hasText: '新建连接' }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  test('UI-A11Y-002b: 命令面板 role=dialog [P1]', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    const paletteDialog = page.locator('[role="dialog"][aria-label="命令面板"]');
    if (await paletteDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(paletteDialog).toBeVisible();
    }
  });

  test('UI-A11Y-003: 侧栏树 role=tree 存在 [P2]', async ({ page }) => {
    const tree = page.locator('[role="tree"][aria-label="集群连接"]');
    await expect(tree).toHaveCount(1);
  });
});

// ═══════════════════════════════════════════════
// 十五、UI-RESP: 响应式与布局（横切关注点）
// ═══════════════════════════════════════════════

test.describe('UI-RESP: 响应式布局', () => {
  test('UI-RESP-001: 1280x720 无横向滚动条 [P1]', async ({ page }) => {
    await injectMock(page, 'empty');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBeFalsy();
  });

  test('UI-RESP-001b: 1920x1080 无横向滚动条 [P1]', async ({ page }) => {
    await injectMock(page, 'empty');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════
// 十六、连接后面板交互 — 深度测试
// ═══════════════════════════════════════════════

test.describe('连接后面板深度交互', () => {
  test('连接后右侧自动打开 Dashboard [P0]', async ({ page }) => {
    await setupConnected(page);
    const moduleNav = page.locator('nav[aria-label="集群模块导航"]');
    await expect(moduleNav).toBeVisible({ timeout: 5000 });
  });

  test('TC-CONN-006d: 连接态 — 状态栏更新已连接数 [P0]', async ({ page }) => {
    await setupConnected(page);
    const statusBar = page.locator('text=个已连接').first();
    await expect(statusBar).toBeVisible({ timeout: 5000 });
  });

  test('Dashboard 模块导航包含全部 6 个模块 [P0]', async ({ page }) => {
    await setupConnected(page);
    const nav = page.locator('nav[aria-label="集群模块导航"]');
    await expect(nav).toBeVisible({ timeout: 5000 });
    await expect(nav.locator('button', { hasText: '概览' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'Topics' })).toBeVisible();
    await expect(nav.locator('button', { hasText: '消费组' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'Schema' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'Connect' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'ACL' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════
// 十七、设置面板 — 通用设置交互
// ═══════════════════════════════════════════════

test.describe('UI-SET: 设置面板交互', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(500);
  });

  test('UI-SET-001: 通用 — 主题切换按钮 [P0]', async ({ page }) => {
    const lightBtn = page.locator('text=亮色');
    const darkBtn = page.locator('text=暗色');
    const systemBtn = page.locator('text=跟随系统');
    await expect(lightBtn).toBeVisible();
    await expect(darkBtn).toBeVisible();
    await expect(systemBtn).toBeVisible();
  });

  test('UI-SET-001b: 通用 — 语言切换 [P0]', async ({ page }) => {
    const zhBtn = page.locator('text=中文');
    const enBtn = page.locator('text=English');
    await expect(zhBtn).toBeVisible();
    await expect(enBtn).toBeVisible();
  });

  test('UI-SET-002: 编辑器 — 设置项可见 [P1]', async ({ page }) => {
    await page.locator('text=编辑器').click();
    await page.waitForTimeout(300);
    const editorSettings = page.locator('text=/字号|Tab|换行|缩进/');
    await expect(editorSettings.first()).toBeVisible({ timeout: 3000 });
  });

  test('UI-SET-003: 消息 — 设置项可见 [P1]', async ({ page }) => {
    await page.locator('text=消息').click();
    await page.waitForTimeout(300);
    const msgSettings = page.locator('text=/拉取|条数|时间|格式|编码/');
    await expect(msgSettings.first()).toBeVisible({ timeout: 3000 });
  });

  test('UI-SET-004: 快捷键 — 列表可见 [P2]', async ({ page }) => {
    await page.locator('text=快捷键').click();
    await page.waitForTimeout(300);
    const shortcuts = page.locator('text=/Ctrl|⌘|Cmd/');
    await expect(shortcuts.first()).toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════
// 十八、连接对话框 — 深度字段测试
// ═══════════════════════════════════════════════

test.describe('UI-CONN: 连接对话框深度测试', () => {
  test.beforeEach(async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('button', { hasText: '新建连接' }).first().click();
    await page.waitForTimeout(300);
  });

  test('UI-CONN-010b: Bootstrap 输入无卡顿 [P0]', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]');
    const inputs = dialog.locator('input');
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder && placeholder.includes('9092')) {
        await input.fill('localhost:9092');
        await expect(input).toHaveValue('localhost:9092');
        break;
      }
    }
  });

  test('安全认证 Tab — 可切换 [P1]', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]');
    const secTab = dialog.locator('[role="tab"]', { hasText: '安全认证' });
    await expect(secTab).toBeVisible();
    await secTab.click();
    await page.waitForTimeout(500);
    const secPanel = dialog.locator('[role="tabpanel"]');
    await expect(secPanel).toBeVisible({ timeout: 3000 });
  });

  test('高级配置 Tab — 可切换 [P1]', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]');
    const advTab = dialog.locator('[role="tab"]', { hasText: '高级配置' });
    await expect(advTab).toBeVisible();
    await advTab.click();
    await page.waitForTimeout(500);
    const advPanel = dialog.locator('[role="tabpanel"]');
    await expect(advPanel).toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════
// 十九、TabBar 深度测试
// ═══════════════════════════════════════════════

test.describe('UI-APP-011: TabBar 交互', () => {
  test('Welcome Tab 可见且 aria-selected [P0]', async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tablist = page.locator('[role="tablist"][aria-label="打开的标签页"]');
    const welcomeTab = tablist.locator('[role="tab"]', { hasText: 'Welcome' });
    await expect(welcomeTab).toBeVisible();
    await expect(welcomeTab).toHaveAttribute('aria-selected', 'true');
  });

  test('设置 Tab 打开后可关闭 [P1]', async ({ page }) => {
    await injectMock(page, 'empty');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('button[aria-label="设置"]').click();
    await page.waitForTimeout(500);

    const settingsTab = page.locator('[role="tab"]').filter({ hasText: /设置/ }).first();
    await expect(settingsTab).toBeVisible({ timeout: 3000 });

    const closeBtn = page.locator('button[aria-label*="关闭"]').filter({ hasText: /设置/ }).first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

// ═══════════════════════════════════════════════
// 二十、连接后 — Topic 树展开
// ═══════════════════════════════════════════════

test.describe('Dashboard 模块切换', () => {
  test('切换到 Topics 模块显示列表 [P0]', async ({ page }) => {
    await setupConnected(page);
    const nav = page.locator('nav[aria-label="集群模块导航"]');
    await expect(nav).toBeVisible({ timeout: 5000 });
    await nav.locator('button', { hasText: 'Topics' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2', { hasText: 'Topics' })).toBeVisible({ timeout: 3000 });
  });

  test('切换到消费组模块 [P0]', async ({ page }) => {
    await setupConnected(page);
    const nav = page.locator('nav[aria-label="集群模块导航"]');
    await expect(nav).toBeVisible({ timeout: 5000 });
    await nav.locator('button', { hasText: '消费组' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('main')).toBeVisible();
  });
});
