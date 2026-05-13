import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { BrokerInfo, ClusterOverviewData, ConsumerGroupInfo, TopicInfo } from '../types';
import { snakeToCamel } from '../lib/tauri';
import { getT } from '../i18n';

interface ClusterStore {
  overviews: Record<string, ClusterOverviewData>;
  topics: Record<string, TopicInfo[]>;
  consumerGroups: Record<string, ConsumerGroupInfo[]>;

  loadingOverview: Record<string, boolean>;
  loadingTopics: Record<string, boolean>;
  /** Last load error per cluster (cleared on successful load). */
  overviewErrors: Record<string, string | undefined>;

  loadClusterOverview: (clusterId: string) => Promise<void>;
  loadTopics: (clusterId: string) => Promise<void>;
  loadConsumerGroups: (clusterId: string) => Promise<void>;
  clearClusterData: (clusterId: string) => void;
}

async function clusterInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`[clusterStore] Tauri command '${cmd}' is missing or failed:`, e);
    return undefined;
  }
}

function normalizeOverview(row: unknown): ClusterOverviewData {
  const d = snakeToCamel(row) as Partial<ClusterOverviewData>;
  return {
    clusterName: d.clusterName ?? '',
    brokers: Array.isArray(d.brokers)
      ? d.brokers.map((b) => {
          const broker = snakeToCamel(b) as Partial<BrokerInfo>;
          return {
            id: broker.id ?? 0,
            host: broker.host ?? '',
            port: broker.port ?? 0,
            rack: broker.rack,
            isController: broker.isController ?? false,
          };
        })
      : [],
    topicCount: d.topicCount ?? 0,
    partitionCount: d.partitionCount ?? 0,
    consumerGroupCount: d.consumerGroupCount ?? 0,
    clusterMode: d.clusterMode ?? 'AUTO_DETECT',
    configs:
      d.configs && typeof d.configs === 'object' && !Array.isArray(d.configs)
        ? (d.configs as Record<string, string>)
        : {},
  };
}

function normalizeTopic(row: unknown): TopicInfo {
  const t = snakeToCamel(row) as Partial<TopicInfo>;
  return {
    name: t.name ?? '',
    partitionCount: t.partitionCount ?? 0,
    replicationFactor: t.replicationFactor ?? 0,
    isInternal: t.isInternal ?? false,
  };
}

function normalizeConsumerGroup(row: unknown): ConsumerGroupInfo {
  const g = snakeToCamel(row) as Partial<ConsumerGroupInfo> & { total_lag?: number; name?: string };
  return {
    groupId: g.groupId || g.name || '',
    state: (g.state as ConsumerGroupInfo['state']) ?? 'Dead',
    memberCount: g.memberCount ?? 0,
    subscribedTopicCount: g.subscribedTopicCount ?? 0,
    totalLag: g.totalLag ?? g.total_lag ?? 0,
    coordinatorBrokerId: g.coordinatorBrokerId ?? 0,
  };
}

export const useClusterStore = create<ClusterStore>((set, get) => ({
  overviews: {},
  topics: {},
  consumerGroups: {},
  loadingOverview: {},
  loadingTopics: {},
  overviewErrors: {},

  loadClusterOverview: async (clusterId) => {
    set((s) => ({
      loadingOverview: { ...s.loadingOverview, [clusterId]: true },
      overviewErrors: { ...s.overviewErrors, [clusterId]: undefined },
    }));
    try {
      const raw = await invoke<unknown>('load_cluster_overview', { clusterId: clusterId });
      if (raw === undefined || raw === null) {
        set((s) => ({
          overviewErrors: {
            ...s.overviewErrors,
            [clusterId]: getT()('overview.emptyPrompt'),
          },
        }));
      } else {
        const overview = normalizeOverview(raw);
        set((s) => ({
          overviews: { ...s.overviews, [clusterId]: overview },
          overviewErrors: { ...s.overviewErrors, [clusterId]: undefined },
        }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => ({
        overviewErrors: { ...s.overviewErrors, [clusterId]: msg || getT()('common.error') },
      }));
    } finally {
      set((s) => ({
        loadingOverview: { ...s.loadingOverview, [clusterId]: false },
      }));
    }
  },

  loadTopics: async (clusterId) => {
    set((s) => ({
      loadingTopics: { ...s.loadingTopics, [clusterId]: true },
    }));
    try {
      const raw = await clusterInvoke<unknown>('load_cluster_topics', { clusterId });
      let list: unknown[] | undefined;
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === 'object') {
        const boxed = snakeToCamel(raw) as { topics?: unknown[] };
        list = Array.isArray(boxed.topics) ? boxed.topics : undefined;
      }
      const topics = list?.map((row) => normalizeTopic(row)) ?? get().topics[clusterId] ?? [];
      set((s) => ({
        topics: { ...s.topics, [clusterId]: topics },
      }));
    } finally {
      set((s) => ({
        loadingTopics: { ...s.loadingTopics, [clusterId]: false },
      }));
    }
  },

  loadConsumerGroups: async (clusterId) => {
    try {
      const raw = await clusterInvoke<unknown>('load_consumer_groups', { clusterId });
      let list: unknown[] | undefined;
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === 'object') {
        const boxed = snakeToCamel(raw) as { consumerGroups?: unknown[]; groups?: unknown[] };
        list = Array.isArray(boxed.consumerGroups)
          ? boxed.consumerGroups
          : Array.isArray(boxed.groups)
            ? boxed.groups
            : undefined;
      }
      const consumerGroups =
        list?.map((row) => normalizeConsumerGroup(row)) ?? get().consumerGroups[clusterId] ?? [];
      set((s) => ({
        consumerGroups: { ...s.consumerGroups, [clusterId]: consumerGroups },
      }));
    } catch (e) {
      console.warn('[clusterStore] loadConsumerGroups:', e);
    }
  },

  clearClusterData: (clusterId) =>
    set((s) => {
      const { [clusterId]: _o, ...overviews } = s.overviews;
      const { [clusterId]: _t, ...topics } = s.topics;
      const { [clusterId]: _c, ...consumerGroups } = s.consumerGroups;
      const { [clusterId]: _lo, ...loadingOverview } = s.loadingOverview;
      const { [clusterId]: _lt, ...loadingTopics } = s.loadingTopics;
      const { [clusterId]: _le, ...overviewErrors } = s.overviewErrors;
      return {
        overviews,
        topics,
        consumerGroups,
        loadingOverview,
        loadingTopics,
        overviewErrors,
      };
    }),
}));
