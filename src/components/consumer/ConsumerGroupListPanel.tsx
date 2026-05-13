/**
 * Consumer group list
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import type { ConsumerGroupInfo } from '../../types';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';

const EMPTY_GROUPS: ConsumerGroupInfo[] = [];

const STATE_I18N: Record<ConsumerGroupInfo['state'], TranslationKey> = {
  Active: 'consumer.state.active',
  Stable: 'consumer.state.stable',
  Empty: 'consumer.state.empty',
  Rebalancing: 'consumer.state.rebalancing',
  PreparingRebalance: 'consumer.state.preparing',
  CompletingRebalance: 'consumer.state.completing',
  Dead: 'consumer.state.dead',
};

function StatusBadge({ state }: { state: ConsumerGroupInfo['state'] }) {
  const t = useT();
  const ACTIVE_STYLE = {
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: 'var(--color-success)',
    border: 'rgba(34, 197, 94, 0.35)',
  };
  const map: Record<string, { bg: string; fg: string; border: string }> = {
    Active: ACTIVE_STYLE,
    Stable: ACTIVE_STYLE,
    Empty: {
      bg: 'var(--color-surface-2)',
      fg: 'var(--color-text-muted)',
      border: 'var(--color-border)',
    },
    Rebalancing: {
      bg: 'rgba(245, 158, 11, 0.12)',
      fg: 'var(--color-warning)',
      border: 'rgba(245, 158, 11, 0.35)',
    },
    PreparingRebalance: {
      bg: 'rgba(245, 158, 11, 0.12)',
      fg: 'var(--color-warning)',
      border: 'rgba(245, 158, 11, 0.35)',
    },
    CompletingRebalance: {
      bg: 'rgba(245, 158, 11, 0.12)',
      fg: 'var(--color-warning)',
      border: 'rgba(245, 158, 11, 0.35)',
    },
    Dead: {
      bg: 'rgba(239, 68, 68, 0.12)',
      fg: 'var(--color-error)',
      border: 'rgba(239, 68, 68, 0.35)',
    },
  };
  const s = map[state] ?? ACTIVE_STYLE;
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
      {t(STATE_I18N[state])}
    </span>
  );
}

const HEADER_DEFS: { key: TranslationKey; numeric: boolean }[] = [
  { key: 'consumer.groupId', numeric: false },
  { key: 'consumer.status', numeric: false },
  { key: 'consumer.memberCount', numeric: true },
  { key: 'consumer.topicCount', numeric: true },
  { key: 'consumer.totalLag', numeric: true },
  { key: 'consumer.coordinator', numeric: true },
];

export function ConsumerGroupListPanel({ clusterId }: { clusterId: string }) {
  const t = useT();
  const groups = useClusterStore((s) => s.consumerGroups[clusterId] ?? EMPTY_GROUPS);
  const loadConsumerGroups = useClusterStore((s) => s.loadConsumerGroups);
  const openTab = useUIStore((s) => s.openTab);

  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadConsumerGroups(clusterId);
    } finally {
      setLoading(false);
    }
  }, [clusterId, loadConsumerGroups]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (hideEmpty && g.state === 'Empty') return false;
      if (!q) return true;
      return g.groupId.toLowerCase().includes(q);
    });
  }, [groups, search, hideEmpty]);

  const openDetail = (g: ConsumerGroupInfo) => {
    openTab({ type: 'consumer-group-detail', clusterId, groupId: g.groupId }, g.groupId, 'users');
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
            {t('consumer.title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
            {t('consumer.listSubtitle')}
          </p>
        </div>
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
            placeholder={t('consumer.search')}
            aria-label={t('consumer.search')}
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
          title={t('consumer.refresh')}
          aria-label={t('consumer.refresh')}
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
            transition: 'background var(--transition-fast), color var(--transition-fast)',
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
          {t('consumer.refresh')}
        </button>
        <button
          type="button"
          aria-pressed={hideEmpty}
          aria-label={t('consumer.hideEmptyGroups')}
          onClick={() => setHideEmpty((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: hideEmpty ? 'var(--color-primary-muted)' : 'var(--color-surface)',
            border: `1px solid ${hideEmpty ? 'var(--color-primary)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: hideEmpty ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'background var(--transition-fast), color var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!hideEmpty) {
              e.currentTarget.style.background = 'var(--color-surface-2)';
              e.currentTarget.style.color = 'var(--color-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (!hideEmpty) {
              e.currentTarget.style.background = 'var(--color-surface)';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }
          }}
        >
          <Filter size={14} strokeWidth={2} aria-hidden />
          {t('consumer.hideEmptyGroups')}
        </button>
      </header>

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
            role="status"
            aria-busy="true"
            aria-label={t('consumer.loadingGroups')}
          >
            <Loader2
              size={22}
              strokeWidth={2}
              style={{ animation: 'km-spin 1s linear infinite' }}
              aria-hidden
            />
            {t('consumer.loadingGroups')}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              color: 'var(--color-text-faint)',
            }}
            role="status"
          >
            <Users
              size={36}
              strokeWidth={1.5}
              style={{ marginBottom: 12, opacity: 0.5 }}
              aria-hidden
            />
            <p style={{ fontSize: 14 }}>
              {groups.length === 0 ? t('consumer.noGroups') : t('consumer.noMatch')}
            </p>
            <p style={{ fontSize: 12, marginTop: 6 }}>{t('consumer.emptyHint')}</p>
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
            aria-label={t('consumer.title')}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--color-surface)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {HEADER_DEFS.map(({ key, numeric }) => (
                  <th
                    key={key}
                    style={{
                      padding: '8px 14px',
                      textAlign: numeric ? 'right' : 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-text-faint)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((g, i) => (
                <tr
                  key={g.groupId}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t('consumer.groupId')}: ${g.groupId}`}
                  onClick={() => openDetail(g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(g);
                    }
                  }}
                  style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)',
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
                    {g.groupId}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <StatusBadge state={g.state} />
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {g.memberCount}
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {g.subscribedTopicCount}
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {g.totalLag.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {g.coordinatorBrokerId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
