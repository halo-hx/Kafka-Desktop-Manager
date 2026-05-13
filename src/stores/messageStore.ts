import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FilterCondition, KafkaMessage, MessageRange } from '../types';
import { snakeToCamel } from '../lib/tauri';

function topicStoreKey(clusterId: string, topicName: string): string {
  return `${clusterId}/${topicName}`;
}

function normalizeMessage(row: unknown): KafkaMessage {
  const m = snakeToCamel(row) as Partial<KafkaMessage> & {
    headers?: Record<string, string> | unknown;
  };
  let headers: Record<string, string> = {};
  if (m.headers && typeof m.headers === 'object' && !Array.isArray(m.headers)) {
    headers = m.headers as Record<string, string>;
  }
  return {
    partition: Number(m.partition ?? 0),
    offset: Number(m.offset ?? 0),
    timestamp: String(m.timestamp ?? ''),
    key: String(m.key ?? ''),
    value: String(m.value ?? ''),
    headers,
    size: Number(m.size ?? 0),
  };
}

function extractJsonPath(raw: string, path: string): string {
  const p = path.trim().replace(/^\$\.?/, '');
  if (!p) return raw;
  try {
    const obj = JSON.parse(raw) as unknown;
    const parts = p.split('.').filter(Boolean);
    let cur: unknown = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined) return '';
      if (typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[part];
    }
    if (cur === null || cur === undefined) return '';
    return typeof cur === 'string' ? cur : JSON.stringify(cur);
  } catch {
    return '';
  }
}

function getMatchText(m: KafkaMessage, field: FilterCondition['field'], jsonPath?: string): string {
  switch (field) {
    case 'Offset':
      return String(m.offset);
    case 'Key':
      return m.key;
    case 'Value':
      return jsonPath?.trim() ? extractJsonPath(m.value, jsonPath) : m.value;
    case 'Header Key':
      return Object.keys(m.headers).join(' ');
    case 'Header Value':
      return Object.values(m.headers).join(' ');
    default:
      return '';
  }
}

function matchOne(m: KafkaMessage, cond: FilterCondition): boolean {
  const needle = cond.value.trim();
  if (!needle) return true;
  const hay = getMatchText(m, cond.field, cond.jsonPath).toLowerCase();
  const n = needle.toLowerCase();
  if (cond.regex) {
    try {
      const re = new RegExp(needle, 'i');
      if (cond.field === 'Header Key') {
        return Object.keys(m.headers).some((k) => re.test(k));
      }
      if (cond.field === 'Header Value') {
        return Object.values(m.headers).some((v) => re.test(v));
      }
      return re.test(getMatchText(m, cond.field, cond.jsonPath));
    } catch {
      return hay.includes(n);
    }
  }
  if (cond.field === 'Header Key') {
    return Object.keys(m.headers).some((k) => k.toLowerCase().includes(n));
  }
  if (cond.field === 'Header Value') {
    return Object.values(m.headers).some((v) => v.toLowerCase().includes(n));
  }
  return hay.includes(n);
}

function applyFilters(messages: KafkaMessage[], filters: FilterCondition[]): KafkaMessage[] {
  if (!filters.length) return messages;
  return messages.filter((m) => {
    let acc = matchOne(m, filters[0]);
    for (let i = 1; i < filters.length; i++) {
      const logic = filters[i].logic;
      const next = matchOne(m, filters[i]);
      acc = logic === 'AND' ? acc && next : acc || next;
    }
    return acc;
  });
}

export interface FetchProgressState {
  loaded: number;
  target: number;
}

interface LiveState {
  timer: ReturnType<typeof setInterval> | null;
  lastPollTs: number;
  pollCountWindow: number;
}

interface MessageStore {
  messages: Record<string, KafkaMessage[]>;
  loading: Record<string, boolean>;
  liveMode: Record<string, boolean>;
  fetchProgress: Record<string, FetchProgressState>;
  /** 停止拉取令牌，每次 stopFetch 递增 */
  fetchGeneration: Record<string, number>;
  live: Record<string, LiveState>;
  msgsPerSecond: Record<string, number>;

  fetchMessages: (
    clusterId: string,
    topicName: string,
    range: MessageRange,
    count: number,
    filters: FilterCondition[],
    offsetValue?: number,
    timestampValue?: string,
    partition?: number | null,
  ) => Promise<void>;

  /** 预留：服务端流式事件 channel */
  attachFetchStreamListeners: (_streamId: string, _topicKey: string) => Promise<void>;

  stopFetch: (clusterId: string, topicName: string) => void;
  toggleLiveMode: (clusterId: string, topicName: string) => void;
  clearMessages: (clusterId: string, topicName: string) => void;
}

async function invokeFetch(clusterId: string, topicName: string, args: Record<string, unknown>) {
  return invoke<unknown[]>('fetch_messages', {
    clusterId,
    topic: topicName,
    ...args,
  });
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: {},
  loading: {},
  liveMode: {},
  fetchProgress: {},
  fetchGeneration: {},
  live: {},
  msgsPerSecond: {},

  attachFetchStreamListeners: async (streamId: string, topicKey: string) => {
    const unBatch = await listen<unknown[]>(`kafka://fetch/${streamId}`, (ev) => {
      const rows = Array.isArray(ev.payload) ? ev.payload : [];
      const batch = rows.map(normalizeMessage);
      set((s) => ({
        messages: {
          ...s.messages,
          [topicKey]: [...(s.messages[topicKey] ?? []), ...batch],
        },
        fetchProgress: {
          ...s.fetchProgress,
          [topicKey]: {
            loaded: (s.messages[topicKey]?.length ?? 0) + batch.length,
            target: s.fetchProgress[topicKey]?.target ?? batch.length,
          },
        },
      }));
    });
    let unDone: UnlistenFn | undefined;
    unDone = await listen(`kafka://fetch/${streamId}/done`, () => {
      unBatch();
      unDone?.();
      set((s) => ({
        loading: { ...s.loading, [topicKey]: false },
      }));
    });
  },

  fetchMessages: async (
    clusterId,
    topicName,
    range,
    count,
    filters,
    offsetValue,
    timestampValue,
    partition,
  ) => {
    const key = topicStoreKey(clusterId, topicName);
    let gen = 0;
    set((s) => {
      gen = (s.fetchGeneration[key] ?? 0) + 1;
      return {
        loading: { ...s.loading, [key]: true },
        fetchGeneration: { ...s.fetchGeneration, [key]: gen },
        fetchProgress: {
          ...s.fetchProgress,
          [key]: { loaded: 0, target: count },
        },
      };
    });

    const rangeMode = range;
    let offset_start: number | null | undefined =
      range === 'offset' && offsetValue !== undefined ? offsetValue : null;
    let timestamp_ms: number | null | undefined;
    if (range === 'timestamp' && timestampValue) {
      const d = Date.parse(timestampValue);
      timestamp_ms = Number.isFinite(d) ? d : null;
    }

    try {
      const raw = await invokeFetch(clusterId, topicName, {
        partition: partition ?? null,
        offsetStart: offset_start ?? null,
        count,
        rangeMode,
        timestampMs: timestamp_ms ?? null,
      });

      if (get().fetchGeneration[key] !== gen) return;

      const list = Array.isArray(raw) ? raw.map(normalizeMessage) : [];
      const filtered = applyFilters(list, filters);
      set((s) => ({
        messages: { ...s.messages, [key]: filtered },
        fetchProgress: {
          ...s.fetchProgress,
          [key]: { loaded: filtered.length, target: count },
        },
      }));
    } catch (e) {
      console.warn('[messageStore] fetch_messages unavailable or failed:', e);
      if (get().fetchGeneration[key] !== gen) return;
      set((s) => ({
        messages: { ...s.messages, [key]: s.messages[key] ?? [] },
        fetchProgress: {
          ...s.fetchProgress,
          [key]: { loaded: 0, target: count },
        },
      }));
    } finally {
      if (get().fetchGeneration[key] === gen) {
        set((s) => ({
          loading: { ...s.loading, [key]: false },
        }));
      }
    }
  },

  stopFetch: (clusterId, topicName) => {
    const key = topicStoreKey(clusterId, topicName);
    set((s) => ({
      fetchGeneration: { ...s.fetchGeneration, [key]: (s.fetchGeneration[key] ?? 0) + 1 },
      loading: { ...s.loading, [key]: false },
    }));
  },

  toggleLiveMode: (clusterId, topicName) => {
    const key = topicStoreKey(clusterId, topicName);
    const on = !get().liveMode[key];
    set((s) => ({ liveMode: { ...s.liveMode, [key]: on } }));

    const existing = get().live[key];
    if (existing?.timer) {
      clearInterval(existing.timer);
    }

    if (!on) {
      set((s) => ({
        live: { ...s.live, [key]: { timer: null, lastPollTs: 0, pollCountWindow: 0 } },
        msgsPerSecond: { ...s.msgsPerSecond, [key]: 0 },
      }));
      return;
    }

    const poll = async () => {
      if (!get().liveMode[key]) return;

      try {
        const raw = await invokeFetch(clusterId, topicName, {
          partition: null,
          offsetStart: null,
          count: 50,
          rangeMode: 'newest',
          timestampMs: null,
        });

        const incoming = Array.isArray(raw) ? raw.map(normalizeMessage) : [];
        const merged = [...incoming, ...(get().messages[key] ?? [])];
        const seen = new Set<string>();
        const dedup: KafkaMessage[] = [];
        for (const m of merged) {
          const id = `${m.partition}-${m.offset}`;
          if (seen.has(id)) continue;
          seen.add(id);
          dedup.push(m);
        }
        dedup.sort((a, b) => b.offset - a.offset);

        const now = Date.now();
        const prev = get().live[key];
        const dt = Math.max(1, now - (prev?.lastPollTs ?? now));
        let pollCountWindow = (prev?.pollCountWindow ?? 0) + incoming.length;
        let lastPollTs = prev?.lastPollTs ?? now;
        if (dt >= 1000) {
          const rate = pollCountWindow / (dt / 1000);
          set((s) => ({
            msgsPerSecond: { ...s.msgsPerSecond, [key]: Math.round(rate * 10) / 10 },
          }));
          pollCountWindow = 0;
          lastPollTs = now;
        }

        set((s) => ({
          messages: { ...s.messages, [key]: dedup.slice(0, 5000) },
          fetchProgress: {
            ...s.fetchProgress,
            [key]: { loaded: dedup.length, target: dedup.length },
          },
          live: {
            ...s.live,
            [key]: {
              timer: s.live[key]?.timer ?? null,
              lastPollTs,
              pollCountWindow,
            },
          },
        }));
      } catch (e) {
        console.warn('[messageStore] live poll failed:', e);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2000);

    set((s) => ({
      live: {
        ...s.live,
        [key]: { timer, lastPollTs: Date.now(), pollCountWindow: 0 },
      },
    }));
  },

  clearMessages: (clusterId, topicName) => {
    const key = topicStoreKey(clusterId, topicName);
    set((s) => ({
      messages: { ...s.messages, [key]: [] },
      fetchProgress: { ...s.fetchProgress, [key]: { loaded: 0, target: 0 } },
    }));
  },
}));
