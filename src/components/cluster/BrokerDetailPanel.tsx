/**
 * Broker 详情面板：配置与 Leader 分区
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Inbox,
  LayoutList,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Settings,
} from 'lucide-react';
import { snakeToCamel } from '../../lib/tauri';
import { useClusterStore } from '../../stores/clusterStore';
import { useT } from '../../i18n';

export interface BrokerDetailPanelProps {
  clusterId: string;
  brokerId: number;
}

interface ConfigRow {
  key: string;
  value: string;
  source: string;
}

interface LeaderPartRow {
  topic: string;
  partition: number;
  replicas: number[];
  isr: number[];
}

const PLACEHOLDER_CONFIG: ConfigRow[] = [
  { key: 'log.retention.hours', value: '168', source: 'DEFAULT' },
  { key: 'num.network.threads', value: '8', source: 'DEFAULT' },
  { key: 'socket.send.buffer.bytes', value: '102400', source: 'DEFAULT' },
];

const PLACEHOLDER_LEADERS: LeaderPartRow[] = [
  { topic: 'topic-1', partition: 0, replicas: [0, 1, 2], isr: [0, 1, 2] },
  { topic: 'events-stream', partition: 2, replicas: [1, 2, 3], isr: [1, 2] },
];

function normalizeConfigEntry(row: unknown): ConfigRow | null {
  const r = snakeToCamel(row) as Record<string, unknown>;
  const key = String(r.name ?? r.key ?? r.configName ?? '').trim();
  if (!key) return null;
  const value = String(r.value ?? r.configValue ?? '');
  const source = String(r.source ?? r.configSource ?? '—');
  return { key, value, source };
}

function parseBrokerConfigResponse(raw: unknown): ConfigRow[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const o = snakeToCamel(raw) as { entries?: unknown[]; configs?: unknown[] };
    if (Array.isArray(o.entries)) list = o.entries;
    else if (Array.isArray(o.configs)) list = o.configs;
  }
  return list.map(normalizeConfigEntry).filter((x): x is ConfigRow => x !== null);
}

type SubTab = 'config' | 'leaders';

export function BrokerDetailPanel({ clusterId, brokerId }: BrokerDetailPanelProps) {
  const t = useT();
  const overview = useClusterStore((s) => s.overviews[clusterId]);
  const loadClusterOverview = useClusterStore((s) => s.loadClusterOverview);

  const broker = overview?.brokers.find((b) => b.id === brokerId);

  const [subTab, setSubTab] = useState<SubTab>('config');
  const [configSearch, setConfigSearch] = useState('');
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | undefined>();
  /** 使用占位数据（接口不可用或为空） */
  const [usingPlaceholderConfig, setUsingPlaceholderConfig] = useState(false);

  const leaders = PLACEHOLDER_LEADERS;

  useEffect(() => {
    if (!overview && clusterId) {
      void loadClusterOverview(clusterId);
    }
  }, [overview, clusterId, loadClusterOverview]);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(undefined);
    try {
      const raw = await invoke<unknown>('get_broker_config', {
        clusterId,
        brokerId,
      });
      const rows = parseBrokerConfigResponse(raw);
      if (rows.length > 0) {
        setConfigRows(rows);
        setUsingPlaceholderConfig(false);
      } else {
        setConfigRows(PLACEHOLDER_CONFIG);
        setUsingPlaceholderConfig(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[BrokerDetailPanel] get_broker_config:', e);
      setConfigError(msg);
      setConfigRows(PLACEHOLDER_CONFIG);
      setUsingPlaceholderConfig(true);
    } finally {
      setConfigLoading(false);
    }
  }, [clusterId, brokerId]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const query = configSearch.trim().toLowerCase();
  const filteredConfigs = useMemo(() => {
    return configRows.filter(
      (row) =>
        !query ||
        row.key.toLowerCase().includes(query) ||
        row.value.toLowerCase().includes(query) ||
        row.source.toLowerCase().includes(query),
    );
  }, [configRows, query]);

  const subtitle =
    broker != null ? `${broker.host}:${broker.port}` : t('overview.resolving');

  const tabBtn = (id: SubTab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      key={id}
      role="tab"
      aria-selected={subTab === id}
      onClick={() => setSubTab(id)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        transition: 'background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
        ...(subTab === id
          ? {
              background: 'var(--color-primary-muted)',
              color: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
            }
          : {
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              borderColor: 'var(--color-border)',
            }),
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      style={{
        padding: '24px',
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'var(--font-body)',
        background: 'var(--color-bg)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 20, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Server size={20} strokeWidth={2} aria-hidden />
            Broker {brokerId} · {subtitle}
          </h1>
          {usingPlaceholderConfig && !configLoading && (
            <p style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{t('broker.placeholderConfigNote')}</p>
          )}
        </div>
        <button
          type="button"
          disabled={configLoading}
          onClick={() => void fetchConfig()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--color-surface)',
            color: configLoading ? 'var(--color-text-faint)' : 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            cursor: configLoading ? 'wait' : 'pointer',
            fontSize: 12,
          }}
        >
          {configLoading ? (
            <Loader2 className="animate-km-spin" size={13} aria-hidden />
          ) : (
            <RefreshCw size={13} aria-hidden />
          )}
          {t('common.refresh')}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: t('overview.id'), value: String(brokerId) },
          { label: t('broker.rack'), value: broker?.rack?.trim() ? broker.rack : '—' },
          {
            label: t('overview.controller'),
            value: broker?.isController ? '✓' : '—',
            accent: broker?.isController,
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              minWidth: 120,
              flex: '1 1 120px',
              padding: '12px 16px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--color-text-faint)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color:
                  'accent' in card && card.accent ? 'var(--color-primary)' : 'var(--color-text)',
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tabBtn('config', <Settings size={14} aria-hidden />, t('broker.configTab'))}
        {tabBtn('leaders', <LayoutList size={14} aria-hidden />, t('broker.leadersTab'))}
      </div>

      {configError && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-error)',
            fontSize: 12,
          }}
        >
          {configError}
        </div>
      )}

      {subTab === 'config' && (
        <div role="tabpanel">
          <div style={{ marginBottom: 10 }}>
            <div style={{ position: 'relative', maxWidth: 220 }}>
              <Search
                size={12}
                strokeWidth={2}
                aria-hidden
                color="var(--color-text-faint)"
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="search"
                value={configSearch}
                onChange={(e) => setConfigSearch(e.target.value)}
                placeholder={t('common.search')}
                aria-label={t('broker.searchConfigAria')}
                style={{
                  width: '100%',
                  padding: '5px 8px 5px 28px',
                  fontSize: 12,
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  outline: 'none',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              minHeight: 120,
            }}
          >
            {configLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: 32,
                  color: 'var(--color-text-muted)',
                  fontSize: 13,
                }}
              >
                <Loader2 className="animate-km-spin" size={20} aria-hidden />
                {t('common.loading')}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface)' }}>
                    {[t('broker.configuration'), t('broker.configValue'), t('broker.configSource')].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 14px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--color-text-faint)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          borderBottom: '1px solid var(--color-border-subtle)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredConfigs.map((row, i) => (
                    <tr
                      key={`${row.key}-${i}`}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      }}
                    >
                      <td
                        style={{
                          padding: '9px 14px',
                          fontFamily: 'var(--font-heading)',
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {row.key}
                      </td>
                      <td
                        style={{
                          padding: '9px 14px',
                          fontFamily: 'var(--font-heading)',
                          fontSize: 12,
                          color: 'var(--color-primary)',
                          fontWeight: 500,
                        }}
                      >
                        {row.value}
                      </td>
                      <td
                        style={{
                          padding: '9px 14px',
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {row.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!configLoading && filteredConfigs.length === 0 && (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--color-text-faint)',
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Inbox size={28} strokeWidth={1.5} opacity={0.45} aria-hidden />
                {configRows.length === 0 ? t('broker.noConfigRows') : t('broker.noMatchingConfigFilter')}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'leaders' && (
        <div role="tabpanel">
          <div
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface)' }}>
                  {[t('broker.topic'), t('broker.partition'), t('broker.replicas'), t('broker.isr')].map((h, colIdx) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 14px',
                        textAlign: colIdx === 1 ? 'center' : 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-text-faint)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaders.map((row, i) => (
                  <tr
                    key={`${row.topic}-${row.partition}`}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}
                  >
                    <td
                      style={{
                        padding: '9px 14px',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text)',
                      }}
                    >
                      {row.topic}
                    </td>
                    <td
                      style={{
                        padding: '9px 14px',
                        textAlign: 'center',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {row.partition}
                    </td>
                    <td
                      style={{
                        padding: '9px 14px',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      [{row.replicas.join(', ')}]
                    </td>
                    <td
                      style={{
                        padding: '9px 14px',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      [{row.isr.join(', ')}]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p
              style={{
                padding: '10px 14px',
                fontSize: 11,
                color: 'var(--color-text-faint)',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              {t('broker.leaderPlaceholderNote')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
