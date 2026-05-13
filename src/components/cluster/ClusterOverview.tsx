/**
 * ClusterOverview — 集群概览面板（点击集群根节点触发）
 * Design: ui-ux-pro-max · Palette: Code Dark + Run Green
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Database, Loader2, RefreshCw, Search, Server, Settings } from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useT } from '../../i18n';
import { ClusterConfigEditDialog } from './ClusterConfigEditDialog';

interface Props {
  clusterId: string;
  onNavigate?: (module: string) => void;
}

function StatCard({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: number | string;
  color?: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        flex: 1,
        padding: '16px 20px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background var(--transition-fast), border-color var(--transition-fast)',
      }}
      onMouseEnter={
        clickable
          ? (e) => {
              e.currentTarget.style.background = 'var(--color-surface-2)';
              e.currentTarget.style.borderColor = 'var(--color-primary)';
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? (e) => {
              e.currentTarget.style.background = 'var(--color-surface)';
              e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
            }
          : undefined
      }
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-faint)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          color: color ?? 'var(--color-text)',
          lineHeight: 1.2,
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function OverviewSkeleton() {
  const bar = (h: number, flex = 1): React.CSSProperties => ({
    height: h,
    flex,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface-2)',
    opacity: 0.6,
  });
  return (
    <div
      style={{
        padding: '24px',
        height: '100%',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, alignItems: 'center' }}>
        <div style={{ ...bar(20, 0), width: 160 }} />
        <div style={{ flex: 1 }} />
        <div style={{ ...bar(32, 0), width: 88 }} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ flex: 1, ...bar(72) }} />
        ))}
      </div>
      <div style={{ ...bar(14, 0), width: 120, marginBottom: 12 }} />
      <div style={{ ...bar(200) }} />
    </div>
  );
}

export function ClusterOverview({ clusterId, onNavigate }: Props) {
  const t = useT();
  const overview = useClusterStore((s) => s.overviews[clusterId]);
  const loading = useClusterStore((s) => s.loadingOverview[clusterId]);
  const overviewError = useClusterStore((s) => s.overviewErrors[clusterId]);
  const loadOverview = useClusterStore((s) => s.loadClusterOverview);
  const openTab = useUIStore((s) => s.openTab);
  const getConnection = useConnectionStore((s) => s.getConnection);

  const [configSearch, setConfigSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    void loadOverview(clusterId);
  }, [clusterId, loadOverview]);

  const configQuery = configSearch.trim().toLowerCase();

  const filteredConfigs = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.configs).filter(
      ([k, v]) =>
        !configQuery ||
        k.toLowerCase().includes(configQuery) ||
        v.toLowerCase().includes(configQuery),
    );
  }, [overview, configQuery]);

  const openBrokerTab = (brokerId: number) => {
    const conn = getConnection(clusterId);
    const prefix = conn?.name?.trim() || overview?.clusterName?.trim() || t('common.cluster');
    openTab(
      { type: 'broker-detail', clusterId, brokerId },
      `${prefix} · Broker ${brokerId}`,
      'server',
    );
  };

  if (loading && !overview && !overviewError) {
    return (
      <div style={{ height: '100%', position: 'relative', background: 'var(--color-bg)' }}>
        <OverviewSkeleton />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'var(--color-overlay)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
          }}
        >
          <Loader2 className="animate-km-spin" size={28} strokeWidth={2} aria-hidden />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!overview && overviewError) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          background: 'var(--color-bg)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <AlertCircle size={40} color="var(--color-error)" aria-hidden />
        <p
          style={{
            color: 'var(--color-text-muted)',
            textAlign: 'center',
            maxWidth: 420,
            fontSize: 14,
          }}
        >
          {overviewError}
        </p>
        <button
          type="button"
          onClick={() => void loadOverview(clusterId)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'var(--color-primary-muted)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={14} aria-hidden />
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!overview && !loading) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          background: 'var(--color-bg)',
        }}
      >
        <Database size={36} strokeWidth={1.5} opacity={0.5} aria-hidden />
        <span>{t('overview.emptyPrompt')}</span>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  return (
    <div
      style={{
        padding: '24px',
        overflowY: 'auto',
        height: '100%',
        fontFamily: 'var(--font-body)',
      }}
    >
      {overviewError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            marginBottom: 16,
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-text-muted)',
            fontSize: 13,
          }}
        >
          <AlertCircle
            size={18}
            color="var(--color-error)"
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <span style={{ flex: 1 }}>{overviewError}</span>
          <button
            type="button"
            onClick={() => void loadOverview(clusterId)}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-primary)',
              background: 'transparent',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12 }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Database size={20} strokeWidth={2} aria-hidden />
            {overview.clusterName}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
            {t('overview.pageSubtitle')}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          aria-label={t('overview.refreshClusterAria')}
          title={t('common.refresh')}
          disabled={!!loading}
          onClick={() => void loadOverview(clusterId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--color-surface)',
            color: loading ? 'var(--color-text-faint)' : 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 12,
            transition: 'background var(--transition-fast), color var(--transition-fast)',
            opacity: loading ? 0.85 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'var(--color-surface-2)';
              e.currentTarget.style.color = 'var(--color-text)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-surface)';
            e.currentTarget.style.color = loading
              ? 'var(--color-text-faint)'
              : 'var(--color-text-muted)';
          }}
        >
          {loading ? (
            <Loader2 className="animate-km-spin" size={13} aria-hidden />
          ) : (
            <RefreshCw size={13} aria-hidden />
          )}
          {t('common.refresh')}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <StatCard
          label={t('overview.statBrokers')}
          value={overview.brokers.length}
          color="#0EA5E9"
        />
        <StatCard
          label={t('overview.statTopics')}
          value={overview.topicCount}
          color="var(--color-primary)"
          onClick={onNavigate ? () => onNavigate('topics') : undefined}
        />
        <StatCard
          label={t('overview.statPartitions')}
          value={overview.partitionCount}
          color="#8B5CF6"
        />
        <StatCard
          label={t('overview.statConsumers')}
          value={overview.consumerGroupCount}
          color="#10B981"
          onClick={onNavigate ? () => onNavigate('consumers') : undefined}
        />
      </div>

      {/* Broker table */}
      <section aria-labelledby="broker-heading" style={{ marginBottom: 28 }}>
        <h2
          id="broker-heading"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            marginBottom: 10,
            fontFamily: 'var(--font-body)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Server size={14} strokeWidth={2} aria-hidden />
          {t('overview.brokerSectionTitle')}
        </h2>

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
                {[
                  t('overview.id'),
                  t('overview.host'),
                  t('overview.port'),
                  t('overview.rack'),
                  t('overview.role'),
                ].map((h, colIdx) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 14px',
                      textAlign: colIdx === 0 || colIdx === 2 ? 'center' : 'left',
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
              {overview.brokers.map((broker, i) => (
                <tr
                  key={broker.id}
                  role="button"
                  tabIndex={0}
                  aria-label={t('overview.openBrokerDetail', { id: broker.id })}
                  onClick={() => openBrokerTab(broker.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      openBrokerTab(broker.id);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
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
                      textAlign: 'center',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {broker.id}
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                      color: 'var(--color-text)',
                    }}
                  >
                    {broker.host}
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
                    {broker.port}
                  </td>
                  <td
                    style={{ padding: '9px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}
                  >
                    {broker.rack || '—'}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    {broker.isController ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          border: '1px solid var(--color-primary)',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {t('overview.controller')}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          background: 'var(--color-surface-2)',
                          color: 'var(--color-text-muted)',
                          borderRadius: 10,
                          fontSize: 11,
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {t('overview.follower')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {overview.brokers.length === 0 && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--color-text-faint)',
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Server size={28} strokeWidth={1.5} opacity={0.4} aria-hidden />
              {t('overview.noBrokers')}
            </div>
          )}
        </div>
      </section>

      {/* Cluster configs */}
      <section aria-labelledby="config-heading">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <h2
            id="config-heading"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-body)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Settings size={14} strokeWidth={2} aria-hidden />
            {t('overview.clusterConfigReadonly')}
          </h2>
          <button
            type="button"
            onClick={() => {
              const controller = overview.brokers.find((b) => b.isController);
              if (!controller) {
                setEditError(t('overview.editConfig.noControllerError'));
                window.setTimeout(() => setEditError(null), 3500);
                return;
              }
              setEditError(null);
              setEditOpen(true);
            }}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-primary)',
              background: 'var(--color-primary-muted)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            {t('overview.editConfig')}
          </button>
          {editError && (
            <span style={{ fontSize: 12, color: 'var(--color-error)' }}>{editError}</span>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <Search
              aria-hidden
              size={12}
              strokeWidth={2}
              color="var(--color-text-faint)"
              style={{
                position: 'absolute',
                left: 7,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              value={configSearch}
              onChange={(e) => setConfigSearch(e.target.value)}
              placeholder={t('overview.searchConfigsPlaceholder')}
              aria-label={t('overview.searchConfigsAria')}
              style={{
                padding: '4px 8px 4px 26px',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                outline: 'none',
                width: 180,
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
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {filteredConfigs.map(([key, value], i) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '7px 14px',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                borderBottom:
                  i < filteredConfigs.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                gap: 16,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  minWidth: 260,
                  flexShrink: 0,
                }}
              >
                {key}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 12,
                  color: 'var(--color-primary)',
                  fontWeight: 500,
                }}
              >
                {value}
              </span>
            </div>
          ))}
          {filteredConfigs.length === 0 && (
            <p
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--color-text-faint)',
                fontSize: 12,
              }}
            >
              {Object.keys(overview.configs).length === 0
                ? t('overview.noClusterConfigs')
                : t('overview.noMatchingConfigs')}
            </p>
          )}
        </div>
      </section>

      {editOpen &&
        (() => {
          const controller = overview.brokers.find((b) => b.isController);
          if (!controller) return null;
          return (
            <ClusterConfigEditDialog
              open={editOpen}
              clusterId={clusterId}
              brokerId={controller.id}
              onClose={() => setEditOpen(false)}
              onApplied={() => {
                void loadOverview(clusterId);
              }}
            />
          );
        })()}
    </div>
  );
}
