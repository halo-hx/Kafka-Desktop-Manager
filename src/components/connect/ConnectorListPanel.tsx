/**
 * Kafka Connect Connector 列表
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Plug, RefreshCw, Search } from 'lucide-react';
import type { ConnectorInfo } from '../../types';
import { snakeToCamel } from '../../lib/tauri';
import { useT } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { CreateConnectorDialog } from './CreateConnectorDialog';

function StateBadge({ state }: { state: ConnectorInfo['state'] }) {
  const map: Record<ConnectorInfo['state'], { bg: string; fg: string; border: string }> = {
    RUNNING: {
      bg: 'rgba(34, 197, 94, 0.12)',
      fg: 'var(--color-success)',
      border: 'rgba(34, 197, 94, 0.35)',
    },
    PAUSED: {
      bg: 'rgba(245, 158, 11, 0.12)',
      fg: 'var(--color-warning)',
      border: 'rgba(245, 158, 11, 0.35)',
    },
    FAILED: {
      bg: 'rgba(239, 68, 68, 0.12)',
      fg: 'var(--color-error)',
      border: 'rgba(239, 68, 68, 0.35)',
    },
    UNASSIGNED: {
      bg: 'var(--color-surface-2)',
      fg: 'var(--color-text-muted)',
      border: 'var(--color-border)',
    },
  };
  const s = map[state];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
      }}
    >
      {state}
    </span>
  );
}

function TypeBadge({ type }: { type: ConnectorInfo['type'] }) {
  const t = useT();
  const isSource = type === 'source';
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        background: isSource ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
        color: isSource ? 'var(--color-info)' : '#C084FC',
        border: `1px solid ${isSource ? 'rgba(59, 130, 246, 0.35)' : 'rgba(168, 85, 247, 0.35)'}`,
      }}
    >
      {isSource ? t('createConnector.source') : t('createConnector.sink')}
    </span>
  );
}

function normalizeConnector(row: unknown): ConnectorInfo {
  const x = snakeToCamel(row) as Partial<ConnectorInfo>;
  const st = String(x.state ?? 'UNASSIGNED').toUpperCase();
  const state: ConnectorInfo['state'] =
    st === 'RUNNING' || st === 'PAUSED' || st === 'FAILED' || st === 'UNASSIGNED'
      ? (st as ConnectorInfo['state'])
      : 'UNASSIGNED';
  const tp = String(x.type ?? 'source').toLowerCase();
  const type: ConnectorInfo['type'] = tp === 'sink' ? 'sink' : 'source';
  return {
    name: x.name ?? '',
    type,
    state,
    taskCount: x.taskCount ?? 0,
    workerUrl: x.workerUrl ?? '',
  };
}

export function ConnectorListPanel({ clusterId }: { clusterId: string }) {
  const t = useT();
  const openTab = useUIStore((s) => s.openTab);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<unknown[]>('list_connectors', { clusterId });
      const list = Array.isArray(raw) ? raw.map(normalizeConnector) : [];
      setConnectors(list);
    } catch (e) {
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
      setError(msg);
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter(
      (c) => c.name.toLowerCase().includes(q) || c.workerUrl.toLowerCase().includes(q),
    );
  }, [connectors, search]);

  const openDetail = (c: ConnectorInfo) => {
    openTab({ type: 'connector-detail', clusterId, connectorName: c.name }, c.name, 'plug');
  };

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-6)',
        fontFamily: 'var(--font-body)',
        background: 'var(--color-bg)',
      }}
    >
      <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>

      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: 4,
            }}
          >
            {t('connect.title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{t('connect.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--color-primary-muted)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('connect.create')}
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            minWidth: 200,
          }}
        >
          <Search
            size={16}
            strokeWidth={2}
            style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('connect.searchWorkersPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text)',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
            }}
          />
        </div>
        <button
          type="button"
          title={t('connect.refresh')}
          onClick={() => void refresh()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-2)';
            e.currentTarget.style.color = 'var(--color-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-surface)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <RefreshCw size={14} strokeWidth={2} aria-hidden />
          {t('connect.refresh')}
        </button>
      </header>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: 'var(--color-error)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'auto',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 48,
              color: 'var(--color-text-muted)',
            }}
          >
            <Loader2
              size={22}
              strokeWidth={2}
              style={{ animation: 'km-spin 1s linear infinite' }}
              aria-hidden
            />
            {t('connect.loadingConnectors')}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              color: 'var(--color-text-faint)',
            }}
          >
            <Plug
              size={36}
              strokeWidth={1.5}
              style={{ marginBottom: 12, opacity: 0.5 }}
              aria-hidden
            />
            <p style={{ fontSize: 14 }}>
              {connectors.length === 0 ? t('connect.noConnectors') : t('connect.noMatch')}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--color-surface)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {[
                  t('connect.name'),
                  t('connect.type'),
                  t('connect.status'),
                  t('connect.taskCount'),
                  t('connect.workerUrl'),
                ].map((h, colIdx) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 14px',
                      textAlign: colIdx === 3 ? 'right' : 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-text-faint)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(c);
                    }
                  }}
                  style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
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
                    {c.name}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <TypeBadge type={c.type} />
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <StateBadge state={c.state} />
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {c.taskCount}
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      maxWidth: 280,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={c.workerUrl}
                  >
                    {c.workerUrl}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateConnectorDialog
        open={createOpen}
        clusterId={clusterId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void refresh()}
      />
    </div>
  );
}
