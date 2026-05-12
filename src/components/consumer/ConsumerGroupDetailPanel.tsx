/**
 * Consumer group detail
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { ConsumerGroupInfo } from '../../types';
import { useClusterStore } from '../../stores/clusterStore';
import { ResetOffsetDialog } from './ResetOffsetDialog';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';

const EMPTY_GROUPS: unknown[] = [];

const STATE_I18N: Record<ConsumerGroupInfo['state'], TranslationKey> = {
  Active: 'consumer.state.active',
  Stable: 'consumer.state.stable',
  Empty: 'consumer.state.empty',
  Rebalancing: 'consumer.state.rebalancing',
  PreparingRebalance: 'consumer.state.preparing',
  CompletingRebalance: 'consumer.state.completing',
  Dead: 'consumer.state.dead',
};

type TabKey = 'offsets' | 'members' | 'settings';

interface OffsetRow {
  topic: string;
  partition: number;
  startOffset: string;
  endOffset: string;
  consumerOffset: string;
  lag: number;
}

interface MemberRow {
  memberId: string;
  clientId: string;
  host: string;
}

interface DescribeResult {
  offsets: Array<{
    topic: string;
    partition: number;
    start_offset: number;
    end_offset: number;
    consumer_offset: number;
    lag: number;
  }>;
  members: Array<{
    member_id: string;
    client_id: string;
    client_host: string;
  }>;
}

const OFFSET_HEADERS: { key: TranslationKey; align: 'left' | 'right' | 'center' }[] = [
  { key: 'consumerDetail.topic', align: 'left' },
  { key: 'consumerDetail.partition', align: 'center' },
  { key: 'consumerDetail.startOffset', align: 'right' },
  { key: 'consumerDetail.logEndOffset', align: 'right' },
  { key: 'consumerDetail.consumerOffset', align: 'right' },
  { key: 'consumerDetail.lag', align: 'center' },
];

function lagColor(lag: number): string {
  if (lag === 0) return 'var(--color-success)';
  if (lag <= 1000) return 'var(--color-text)';
  if (lag <= 10000) return 'var(--color-warning)';
  return 'var(--color-error)';
}

export function ConsumerGroupDetailPanel({ clusterId, groupId }: { clusterId: string; groupId: string }) {
  const t = useT();
  const loadConsumerGroups = useClusterStore((s) => s.loadConsumerGroups);
  const groups = useClusterStore((s) => s.consumerGroups[clusterId] ?? EMPTY_GROUPS);
  const info = useMemo(
    () => (groups as ConsumerGroupInfo[]).find((g) => g.groupId === groupId),
    [groups, groupId],
  );

  const [tab, setTab] = useState<TabKey>('offsets');
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [offsets, setOffsets] = useState<OffsetRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const refreshMeta = useCallback(async () => {
    setLoading(true);
    try {
      await loadConsumerGroups(clusterId);
      const result = await invoke<DescribeResult>('describe_consumer_group', { clusterId, groupId });
      setOffsets(
        result.offsets.map((o) => ({
          topic: o.topic,
          partition: o.partition,
          startOffset: String(o.start_offset),
          endOffset: String(o.end_offset),
          consumerOffset: String(o.consumer_offset),
          lag: o.lag,
        })),
      );
      setMembers(
        result.members.map((m) => ({
          memberId: m.member_id,
          clientId: m.client_id,
          host: m.client_host,
        })),
      );
    } catch (e) {
      console.warn('[ConsumerGroupDetailPanel] describe:', e);
    } finally {
      setLoading(false);
    }
  }, [clusterId, groupId, loadConsumerGroups]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  const subscribedTopics = useMemo(() => [...new Set(offsets.map((o) => o.topic))], [offsets]);

  const totalPartitions = offsets.length;
  const totalLag = offsets.reduce((s, r) => s + r.lag, 0);
  const avgLag = totalPartitions > 0 ? Math.round(totalLag / totalPartitions) : 0;

  const state = info?.state ?? 'Active';
  const canResetOffset = state === 'Empty' || state === 'Dead' || state === 'Stable';

  const handleDeleteGroup = async () => {
    if (!window.confirm(t('consumerDetail.deleteConfirm'))) return;
    setDeleting(true);
    setActionError(null);
    try {
      await invoke('delete_consumer_group', { clusterId, groupId });
    } catch (e) {
      console.warn('[ConsumerGroupDetailPanel] delete_consumer_group:', e);
      setActionError(
        typeof e === 'string' ? e : e instanceof Error ? e.message : t('consumerDetail.deleteFailed'),
      );
    } finally {
      setDeleting(false);
    }
  };

  const tabDefs: { id: TabKey; labelKey: TranslationKey }[] = [
    { id: 'offsets', labelKey: 'consumerDetail.offsets' },
    { id: 'members', labelKey: 'consumerDetail.members' },
    { id: 'settings', labelKey: 'consumerDetail.settings' },
  ];

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

      <header style={{ marginBottom: 'var(--space-4)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 6,
          }}
        >
          {groupId}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
          {t('consumerDetail.status')}: {info ? t(STATE_I18N[info.state]) : t('common.loading')}
          {loading && (
            <Loader2 size={12} strokeWidth={2} style={{ marginLeft: 8, animation: 'km-spin 1s linear infinite' }} aria-hidden />
          )}
        </p>
      </header>

      <div
        role="tablist"
        aria-label={t('consumerDetail.title')}
        style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)' }}
      >
        {tabDefs.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`consumer-detail-panel-${id}`}
            id={`consumer-detail-tab-${id}`}
            onClick={() => setTab(id)}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: tab === id ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: tab === id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: tab === id ? 600 : 400,
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              if (tab !== id) e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              if (tab !== id) e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {actionError && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: 'var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--color-error)',
            fontSize: 12,
          }}
        >
          {actionError}
        </div>
      )}

      {tab === 'offsets' && (
        <section
          role="tabpanel"
          id="consumer-detail-panel-offsets"
          aria-labelledby="consumer-detail-tab-offsets"
          aria-label={t('consumerDetail.offsets')}
        >
          {offsets.length === 0 && !loading ? (
            <p style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>{t('consumerDetail.noOffsetsCommitted')}</p>
          ) : (
          <div
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {OFFSET_HEADERS.map(({ key, align }) => (
                    <th
                      key={key}
                      style={{
                        padding: '8px 12px',
                        textAlign: align,
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-text-faint)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offsets.map((r, i) => (
                  <tr
                    key={`${r.topic}-${r.partition}`}
                    style={{
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
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-heading)', fontSize: 12 }}>{r.topic}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'var(--font-heading)', color: 'var(--color-text-muted)' }}>
                      {r.partition}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {r.startOffset}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {r.endOffset}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {r.consumerOffset}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'center',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 700,
                        color: lagColor(r.lag),
                      }}
                    >
                      {r.lag.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(59,130,246,0.06)' }}>
                  <td
                    colSpan={6}
                    style={{
                      padding: '10px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      borderTop: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {t('consumerDetail.offsetFooter', {
                      totalPartitions,
                      totalLag: totalLag.toLocaleString(),
                      avgLag: avgLag.toLocaleString(),
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </section>
      )}

      {tab === 'members' && (
        <section
          role="tabpanel"
          id="consumer-detail-panel-members"
          aria-labelledby="consumer-detail-tab-members"
          aria-label={t('consumerDetail.members')}
        >
          {members.length === 0 && !loading ? (
            <p style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>{t('consumerDetail.noActiveMembers')}</p>
          ) : (
          <div
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {(['consumerDetail.memberId', 'consumerDetail.clientId', 'consumerDetail.host'] as const).map((key) => (
                    <th
                      key={key}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
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
                {members.map((m, i) => (
                  <tr
                    key={m.memberId}
                    style={{
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
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-heading)', fontSize: 12 }}>{m.memberId}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>{m.clientId}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>{m.host}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section
          role="tabpanel"
          id="consumer-detail-panel-settings"
          aria-labelledby="consumer-detail-tab-settings"
          aria-label={t('consumerDetail.settings')}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}
        >
          <button
            type="button"
            disabled={!canResetOffset}
            onClick={() => setResetOpen(true)}
            title={!canResetOffset ? t('consumerDetail.resetOffsetDisabledTitle') : ''}
            aria-label={t('consumerDetail.resetOffset')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              background: canResetOffset ? 'var(--color-surface)' : 'var(--color-surface-2)',
              border: `1px solid ${canResetOffset ? 'var(--color-border)' : 'var(--color-border-subtle)'}`,
              borderRadius: 'var(--radius-sm)',
              color: canResetOffset ? 'var(--color-text)' : 'var(--color-text-faint)',
              fontSize: 13,
              cursor: canResetOffset ? 'pointer' : 'not-allowed',
              transition: 'background var(--transition-fast)',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              if (canResetOffset) e.currentTarget.style.background = 'var(--color-surface-2)';
            }}
            onMouseLeave={(e) => {
              if (canResetOffset) e.currentTarget.style.background = 'var(--color-surface)';
            }}
          >
            <RotateCcw size={18} strokeWidth={2} aria-hidden />
            {t('consumerDetail.resetOffset')}
          </button>

          <button
            type="button"
            onClick={() => void handleDeleteGroup()}
            disabled={deleting}
            aria-label={t('consumerDetail.deleteGroup')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              background: deleting ? 'var(--color-surface-2)' : 'rgba(239, 68, 68, 0.18)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-error)',
              fontSize: 13,
              cursor: deleting ? 'not-allowed' : 'pointer',
              transition: 'background var(--transition-fast)',
              width: '100%',
            }}
          >
            {deleting ? (
              <Loader2 size={18} strokeWidth={2} style={{ animation: 'km-spin 1s linear infinite' }} />
            ) : (
              <Trash2 size={18} strokeWidth={2} aria-hidden />
            )}
            {t('consumerDetail.deleteGroup')}
          </button>

          {!canResetOffset && (
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)', lineHeight: 1.5 }}>
              {t('consumerDetail.resetOffsetUnavailable')}
            </p>
          )}
        </section>
      )}

      <ResetOffsetDialog
        open={resetOpen}
        clusterId={clusterId}
        groupId={groupId}
        topics={subscribedTopics}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}
