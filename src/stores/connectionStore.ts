import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ClusterConnection, ConnectionGroup } from '../types';
import { camelToSnake, snakeToCamel } from '../lib/tauri';

export interface TestResult {
  success: boolean;
  message?: string;
  latencyMs?: number;
}

interface ConnectionStore {
  connections: ClusterConnection[];
  groups: ConnectionGroup[];
  loading: boolean;
  error: string | null;

  loadConnections: () => Promise<void>;
  loadGroups: () => Promise<void>;
  saveConnection: (conn: Partial<ClusterConnection>) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (conn: Partial<ClusterConnection>) => Promise<TestResult>;
  connectCluster: (id: string) => Promise<void>;
  disconnectCluster: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setColorTag: (id: string, color: string | null) => Promise<void>;

  saveGroup: (group: Partial<ConnectionGroup>) => Promise<string>;
  deleteGroup: (id: string) => Promise<void>;

  getConnection: (id: string) => ClusterConnection | undefined;
  getConnectedClusters: () => ClusterConnection[];
}

function normalizeConnection(row: unknown): ClusterConnection {
  const c = snakeToCamel(row) as Partial<ClusterConnection>;
  return {
    id: c.id ?? '',
    name: c.name ?? '',
    groupId: c.groupId ?? undefined,
    bootstrapServers: c.bootstrapServers ?? '',
    kafkaVersion: c.kafkaVersion ?? '',
    zookeeperHost: c.zookeeperHost,
    zookeeperPort: c.zookeeperPort,
    zkChrootPath: c.zkChrootPath,
    clusterMode: c.clusterMode ?? 'AUTO_DETECT',
    securityProtocol: c.securityProtocol ?? 'PLAINTEXT',
    saslMechanism: c.saslMechanism,
    saslJaasConfig: c.saslJaasConfig,
    sslCaCertPath: c.sslCaCertPath,
    sslClientCertPath: c.sslClientCertPath,
    sslClientKeyPath: c.sslClientKeyPath,
    sslClientKeyPassword: c.sslClientKeyPassword,
    sslVerifyHostname: c.sslVerifyHostname ?? true,
    schemaRegistryUrl: c.schemaRegistryUrl,
    schemaRegistryUsername: c.schemaRegistryUsername,
    schemaRegistryPassword: c.schemaRegistryPassword,
    connectUrls: c.connectUrls,
    createdAt: c.createdAt ?? new Date().toISOString(),
    updatedAt: c.updatedAt ?? new Date().toISOString(),
    lastConnectedAt: c.lastConnectedAt,
    isFavorite: c.isFavorite ?? false,
    colorTag: c.colorTag,
    notes: c.notes,
    status: c.status ?? 'disconnected',
  };
}

function normalizeGroup(row: unknown): ConnectionGroup {
  const g = snakeToCamel(row) as Partial<ConnectionGroup>;
  return {
    id: g.id ?? '',
    name: g.name ?? '',
    sortOrder: g.sortOrder ?? 0,
    parentId: g.parentId,
  };
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`[connectionStore] Tauri command '${cmd}' is missing or failed:`, e);
    return undefined;
  }
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  groups: [],
  loading: false,
  error: null,

  getConnection: (id) => get().connections.find((c) => c.id === id),
  getConnectedClusters: () => get().connections.filter((c) => c.status === 'connected'),

  loadConnections: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await invoke<unknown>('load_connections');
      console.log('[connectionStore] loadConnections raw:', raw);
      const list = Array.isArray(raw) ? raw : [];
      const connections = list.map((row) => normalizeConnection(row));
      console.log('[connectionStore] loadConnections normalized:', connections.length, 'items');
      set({ connections, loading: false, error: null });
    } catch (e) {
      console.error('[connectionStore] loadConnections error:', e);
      set({ loading: false, error: String(e) });
    }
  },

  loadGroups: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await safeInvoke<unknown>('load_connection_groups');
      if (raw === undefined) {
        set({ loading: false });
        return;
      }
      const list = Array.isArray(raw) ? raw : (raw as { groups?: unknown[] }).groups;
      const groups = Array.isArray(list) ? list.map((row) => normalizeGroup(row)) : [];
      set({ groups, loading: false, error: null });
    } catch (e) {
      console.warn('[connectionStore] loadGroups failed:', e);
      set({ loading: false, error: String(e) });
    }
  },

  saveConnection: async (conn) => {
    const connectionPayload = { ...conn, id: conn.id ?? crypto.randomUUID() };
    const payload = camelToSnake({ connection: connectionPayload }) as Record<string, unknown>;
    console.log('[connectionStore] saveConnection payload:', JSON.stringify(payload));
    let id = connectionPayload.id;
    try {
      const returned = await invoke<unknown>('save_connection', payload);
      console.log('[connectionStore] saveConnection returned:', returned);
      if (typeof returned === 'string') {
        id = returned;
      }
    } catch (e) {
      console.error('[connectionStore] saveConnection error:', e);
    }
    await get().loadConnections();
    return id;
  },

  deleteConnection: async (id) => {
    console.log('[connectionStore] deleteConnection called, id:', id);
    try {
      await invoke('delete_connection', { connectionId: id });
      console.log('[connectionStore] deleteConnection success');
    } catch (e) {
      console.error('[connectionStore] deleteConnection error:', e);
    }
    await get().loadConnections();
  },

  testConnection: async (conn) => {
    const payload = camelToSnake({ connection: conn }) as Record<string, unknown>;
    const raw = await safeInvoke<unknown>('test_connection', payload);
    if (raw === undefined) {
      return {
        success: false,
        message: 'Backend command test_connection is not available.',
      };
    }
    const result = snakeToCamel(raw) as Partial<TestResult> & Record<string, unknown>;
    const success =
      typeof result.success === 'boolean'
        ? result.success
        : typeof (result as { ok?: boolean }).ok === 'boolean'
          ? Boolean((result as { ok?: boolean }).ok)
          : false;
    return {
      success,
      message: (result.message as string) ?? undefined,
      latencyMs:
        typeof result.latencyMs === 'number'
          ? result.latencyMs
          : typeof (result as { latency_ms?: number }).latency_ms === 'number'
            ? (result as { latency_ms: number }).latency_ms
            : undefined,
    };
  },

  connectCluster: async (id) => {
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, status: 'connecting' as const } : c,
      ),
    }));
    const ok = await safeInvoke<boolean>('connect_cluster', { clusterId: id });
    set((state) => ({
      connections: state.connections.map((c) => {
        if (c.id !== id) return c;
        if (ok === undefined) {
          return { ...c, status: 'error' as const };
        }
        return ok
          ? { ...c, status: 'connected' as const, lastConnectedAt: new Date().toISOString() }
          : { ...c, status: 'error' as const };
      }),
    }));
    if (ok === undefined) {
      console.warn('[connectionStore] connectCluster: backend unavailable');
    }
    if (ok) {
      const conn = get().connections.find((c) => c.id === id);
      if (conn) {
        const { useUIStore } = await import('./uiStore');
        useUIStore.getState().openTab(
          { type: 'cluster-dashboard', clusterId: id },
          conn.name,
          'layout-dashboard',
        );
      }
    }
  },

  disconnectCluster: async (id) => {
    const ok = await safeInvoke<boolean>('disconnect_cluster', { clusterId: id });
    if (ok === undefined) {
      console.warn('[connectionStore] disconnectCluster: backend unavailable');
    }
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, status: ok === false ? c.status : ('disconnected' as const) } : c,
      ),
    }));
  },

  toggleFavorite: async (id) => {
    const ok = await safeInvoke<boolean>('toggle_connection_favorite', { connectionId: id });
    if (ok === undefined) {
      console.warn('[connectionStore] toggleFavorite: backend unavailable, toggling locally');
      set((state) => ({
        connections: state.connections.map((c) =>
          c.id === id ? { ...c, isFavorite: !c.isFavorite } : c,
        ),
      }));
      return;
    }
    await get().loadConnections();
  },

  setColorTag: async (id, color) => {
    const ok = await safeInvoke<boolean>('set_connection_color_tag', {
      connectionId: id,
      colorTag: color,
    });
    if (ok === undefined) {
      console.warn('[connectionStore] setColorTag: backend unavailable, updating locally');
      set((state) => ({
        connections: state.connections.map((c) =>
          c.id === id ? { ...c, colorTag: color ?? undefined } : c,
        ),
      }));
      return;
    }
    await get().loadConnections();
  },

  saveGroup: async (group) => {
    const merged = {
      ...group,
      id: group.id ?? crypto.randomUUID(),
      name: group.name ?? 'Untitled',
      sortOrder: group.sortOrder ?? 0,
    };
    const payload = camelToSnake({ group: merged }) as Record<string, unknown>;
    const returned = await safeInvoke<unknown>('save_connection_group', payload);
    if (returned === undefined) {
      return merged.id;
    }
    let id: string;
    if (typeof returned === 'string') id = returned;
    else if (typeof returned === 'object' && returned !== null && 'id' in returned) {
      id = String((returned as { id: unknown }).id);
    } else {
      id = normalizeGroup(returned).id;
    }
    await get().loadGroups();
    return id;
  },

  deleteGroup: async (id) => {
    const ok = await safeInvoke<boolean>('delete_connection_group', { groupId: id });
    if (ok === undefined) {
      console.warn('[connectionStore] deleteGroup: backend unavailable, noop');
      return;
    }
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
    }));
  },
}));
