/**
 * Kafka Connect — Connector 详情（概览 / 配置 / Tasks）
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Download,
  Save,
  Search,
} from 'lucide-react';
import type { ConnectorDetail, ConnectorTask } from '../../types';
import { snakeToCamel } from '../../lib/tauri';
import { useT } from '../../i18n';
import { panelToTabId, useUIStore } from '../../stores/uiStore';

function StateBadge({ state }: { state: string }) {
  const s = String(state).toUpperCase();
  let style: { bg: string; fg: string; border: string };
  if (s === 'RUNNING') {
    style = {
      bg: 'rgba(34, 197, 94, 0.12)',
      fg: 'var(--color-success)',
      border: 'rgba(34, 197, 94, 0.35)',
    };
  } else if (s === 'PAUSED') {
    style = {
      bg: 'rgba(245, 158, 11, 0.12)',
      fg: 'var(--color-warning)',
      border: 'rgba(245, 158, 11, 0.35)',
    };
  } else if (s === 'FAILED') {
    style = {
      bg: 'rgba(239, 68, 68, 0.12)',
      fg: 'var(--color-error)',
      border: 'rgba(239, 68, 68, 0.35)',
    };
  } else {
    style = {
      bg: 'var(--color-surface-2)',
      fg: 'var(--color-text-muted)',
      border: 'var(--color-border)',
    };
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        background: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
      }}
    >
      {state}
    </span>
  );
}

function normalizeTasks(raw: unknown[]): ConnectorTask[] {
  return raw.map((item) => {
    const x = snakeToCamel(item) as Partial<ConnectorTask>;
    const st = String(x.state ?? 'UNASSIGNED').toUpperCase();
    const state: ConnectorTask['state'] =
      st === 'RUNNING' || st === 'FAILED' || st === 'UNASSIGNED'
        ? (st as ConnectorTask['state'])
        : 'UNASSIGNED';
    return {
      taskId: typeof x.taskId === 'number' ? x.taskId : Number(x.taskId) || 0,
      state,
      workerUrl: x.workerUrl ?? '',
      errorMessage: x.errorMessage,
    };
  });
}

function normalizeDetail(raw: unknown): ConnectorDetail {
  const x = snakeToCamel(raw) as Partial<ConnectorDetail> & { tasks?: unknown[] };
  const tasks = Array.isArray(x.tasks) ? normalizeTasks(x.tasks as unknown[]) : [];
  const cfgRaw = x.config && typeof x.config === 'object' && !Array.isArray(x.config) ? x.config : {};
  const cfg: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfgRaw as Record<string, unknown>)) {
    cfg[k] = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  }
  return {
    name: x.name ?? '',
    type: x.type ?? '',
    state: x.state ?? 'UNASSIGNED',
    config: cfg,
    tasks,
    connectorClass: x.connectorClass,
    workerUrl: x.workerUrl,
    uptimeHuman: x.uptimeHuman ?? null,
  };
}

type TabKey = 'overview' | 'config' | 'tasks';

export function ConnectorDetailPanel({
  clusterId,
  connectorName,
}: {
  clusterId: string;
  connectorName: string;
}) {
  const t = useT();
  const closeTab = useUIStore((s) => s.closeTab);
  const [tab, setTab] = useState<TabKey>('overview');
  const [detail, setDetail] = useState<ConnectorDetail | null>(null);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [configSearch, setConfigSearch] = useState('');
  const [configSaveMsg, setConfigSaveMsg] = useState<string | null>(null);
  const [expandedFailed, setExpandedFailed] = useState<Set<number>>(() => new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; taskId: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConfigSaveMsg(null);
    try {
      const raw = await invoke<unknown>('get_connector_detail', {
        clusterId,
        name: connectorName,
      });
      const d = normalizeDetail(raw);
      setDetail(d);
      setConfigDraft({ ...d.config });
    } catch (e) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [clusterId, connectorName]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onCloseCtx = () => setCtxMenu(null);
    window.addEventListener('click', onCloseCtx);
    window.addEventListener('scroll', onCloseCtx, true);
    return () => {
      window.removeEventListener('click', onCloseCtx);
      window.removeEventListener('scroll', onCloseCtx, true);
    };
  }, []);

  const runAction = async (key: string, fn: () => Promise<void>, opts?: { skipReload?: boolean }) => {
    setActionBusy(key);
    setConfigSaveMsg(null);
    try {
      await fn();
      if (!opts?.skipReload) {
        await load();
      }
    } catch (e) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveConfig = async () => {
    setConfigSaveMsg(null);
    await runAction('save', async () => {
      await invoke('update_connector_config', {
        clusterId,
        name: connectorName,
        config: configDraft,
      });
      setConfigSaveMsg(t('connectorDetail.configSaved'));
    });
  };

  const exportConfigJson = () => {
    const blob = new Blob([JSON.stringify(configDraft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${connectorName}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredConfigRows = useMemo(() => {
    const q = configSearch.trim().toLowerCase();
    const entries = Object.entries(configDraft);
    if (!q) return entries;
    return entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  }, [configDraft, configSearch]);

  const toggleExpandFailed = (taskId: number) => {
    setExpandedFailed((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleDelete = async () => {
    await runAction(
      'delete',
      async () => {
        await invoke('delete_connector', { clusterId, name: connectorName });
        closeTab(panelToTabId({ type: 'connector-detail', clusterId, connectorName }));
        setDeleteOpen(false);
      },
      { skipReload: true },
    );
  };

  const restartTask = (taskId: number) =>
    runAction(`task-${taskId}`, async () => {
      await invoke('restart_task', {
        clusterId,
        connector: connectorName,
        taskId,
      });
    });

  if (loading && !detail) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-body)',
          background: 'var(--color-bg)',
        }}
      >
        <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>
        <Loader2 size={24} style={{ animation: 'km-spin 0.85s linear infinite' }} aria-hidden />
        {t('connectorDetail.loadingConnector')}
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div style={{ padding: 'var(--space-6)', background: 'var(--color-bg)', height: '100%' }}>
        <p style={{ color: 'var(--color-error)', marginBottom: 12 }}>{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const d = detail!;

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>

      {error ? (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 12,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: 'var(--color-error)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 8,
          }}
        >
          {d.name || connectorName}
        </h1>
        <nav style={{ display: 'flex', gap: 4 }}>
          {([
            ['overview', t('connectorDetail.overview')],
            ['config', t('connectorDetail.config')],
            ['tasks', t('connectorDetail.tasks')],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: tab === k ? 'var(--color-primary)' : 'var(--color-border)',
                background: tab === k ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                color: tab === k ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: 'var(--space-5)',
            }}
          >
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginBottom: 8 }}>{t('connectorDetail.status')}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <StateBadge state={d.state} />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {t('connectorDetail.uptimeLabel')}
                {d.uptimeHuman && d.uptimeHuman !== 'null' ? d.uptimeHuman : '—'}
              </span>
            </div>
          </div>

          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: 'var(--space-5)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>{t('connectorDetail.type')}</span>
              <p style={{ fontFamily: 'var(--font-heading)', fontSize: 13, marginTop: 4 }}>{d.type}</p>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>{t('connectorDetail.implClass')}</span>
              <p
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 12,
                  marginTop: 4,
                  wordBreak: 'break-all',
                }}
              >
                {d.connectorClass || d.config['connector.class'] || '—'}
              </p>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>{t('connectorDetail.workerUrl')}</span>
              <p style={{ fontFamily: 'var(--font-heading)', fontSize: 12, marginTop: 4 }}>
                {d.workerUrl || '—'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(
              [
                {
                  key: 'pause',
                  label: t('connectorDetail.pause'),
                  icon: Pause,
                  danger: false,
                  onClick: () =>
                    void runAction('pause', () =>
                      invoke('pause_connector', { clusterId, name: connectorName }),
                    ),
                },
                {
                  key: 'resume',
                  label: t('connectorDetail.resume'),
                  icon: Play,
                  danger: false,
                  onClick: () =>
                    void runAction('resume', () =>
                      invoke('resume_connector', { clusterId, name: connectorName }),
                    ),
                },
                {
                  key: 'restart',
                  label: t('connectorDetail.restart'),
                  icon: RotateCcw,
                  danger: false,
                  onClick: () =>
                    void runAction('restart', () =>
                      invoke('restart_connector', { clusterId, name: connectorName }),
                    ),
                },
                {
                  key: 'delete',
                  label: t('connectorDetail.delete'),
                  icon: Trash2,
                  danger: true,
                  onClick: () => setDeleteOpen(true),
                },
              ] as const
            ).map(({ key, label, icon: Icon, onClick, danger }) => (
              <button
                key={key}
                type="button"
                disabled={!!actionBusy}
                onClick={onClick}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${danger ? 'rgba(239,68,68,0.45)' : 'var(--color-border)'}`,
                  background: danger ? 'rgba(239,68,68,0.08)' : 'var(--color-surface)',
                  color: danger ? 'var(--color-error)' : 'var(--color-text)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: actionBusy ? 'not-allowed' : 'pointer',
                  opacity: actionBusy ? 0.6 : 1,
                }}
              >
                <Icon size={16} strokeWidth={2} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
              alignItems: 'center',
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-faint)',
                  pointerEvents: 'none',
                }}
              />
              <input
                value={configSearch}
                onChange={(e) => setConfigSearch(e.target.value)}
                placeholder={t('connectorDetail.filterConfigPlaceholder')}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'text',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSaveConfig()}
              disabled={!!actionBusy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-primary)',
                background: 'var(--color-primary-muted)',
                color: 'var(--color-primary)',
                fontWeight: 600,
                fontSize: 13,
                cursor: actionBusy ? 'not-allowed' : 'pointer',
              }}
            >
              <Save size={16} />
              {t('connectorDetail.saveConfig')}
            </button>
            <button
              type="button"
              onClick={exportConfigJson}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <Download size={16} />
              {t('connectorDetail.exportJsonFile')}
            </button>
          </div>
          {configSaveMsg ? (
            <p style={{ color: 'var(--color-success)', fontSize: 12, marginBottom: 8 }}>{configSaveMsg}</p>
          ) : null}
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              overflow: 'auto',
              background: 'var(--color-surface)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                    {t('connectorDetail.configKey')}
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                    {t('connectorDetail.configValue')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredConfigRows.map(([key, val], i) => (
                  <tr
                    key={key}
                    style={{
                      background:
                        i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <td
                      style={{
                        padding: '8px 14px',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                        verticalAlign: 'top',
                        width: '34%',
                      }}
                    >
                      {key}
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <input
                        value={val}
                        onChange={(e) =>
                          setConfigDraft((c) => ({ ...c, [key]: e.target.value }))
                        }
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text)',
                          fontSize: 12,
                          fontFamily: 'var(--font-heading)',
                          outline: 'none',
                          cursor: 'text',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'auto',
            background: 'var(--color-surface)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                {[
                  { h: t('connectorDetail.taskId'), right: true },
                  { h: t('connectorDetail.taskStatus'), right: false },
                  { h: t('connectorDetail.taskWorker'), right: false },
                  { h: t('connectorDetail.taskErrorColumn'), right: false },
                ].map(({ h, right }) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px',
                      textAlign: right ? 'right' : 'left',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.tasks.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                    {t('connectorDetail.noTasksShort')}
                  </td>
                </tr>
              ) : (
                d.tasks.map((task, i) => {
                  const failedBg = 'rgba(239, 68, 68, 0.12)';
                  const isFail = task.state === 'FAILED';
                  const expanded = expandedFailed.has(task.taskId);
                  return (
                    <Fragment key={`task-${task.taskId}`}>
                      <tr
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtxMenu({ x: e.clientX, y: e.clientY, taskId: task.taskId });
                        }}
                        onClick={() => isFail && toggleExpandFailed(task.taskId)}
                        style={{
                          cursor: isFail ? 'pointer' : 'default',
                          background: isFail
                            ? failedBg
                            : i % 2 === 0
                              ? 'transparent'
                              : 'rgba(255,255,255,0.02)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isFail) {
                            e.currentTarget.style.background = 'var(--color-surface-2)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isFail) {
                            e.currentTarget.style.background =
                              i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
                          } else {
                            e.currentTarget.style.background = failedBg;
                          }
                        }}
                      >
                        <td
                          style={{
                            padding: '9px 14px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--color-text)',
                          }}
                        >
                          {task.taskId}
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <StateBadge state={task.state} />
                        </td>
                        <td
                          style={{
                            padding: '9px 14px',
                            fontFamily: 'var(--font-heading)',
                            fontSize: 12,
                            color: 'var(--color-text-muted)',
                            maxWidth: 260,
                          }}
                          title={task.workerUrl}
                        >
                          <div
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {task.workerUrl}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '9px 14px',
                            color: 'var(--color-error)',
                            fontSize: 12,
                            fontFamily: 'var(--font-heading)',
                          }}
                        >
                          {!isFail ? (
                            '—'
                          ) : expanded ? (
                            <span style={{ color: 'var(--color-text-muted)' }}>{t('connectorDetail.collapseDetail')}</span>
                          ) : (
                            <span>{t('connectorDetail.clickToExpand')}</span>
                          )}
                        </td>
                      </tr>
                      {isFail && expanded ? (
                        <tr>
                          <td colSpan={4} style={{ background: failedBg, padding: '12px 16px' }}>
                            <pre
                              style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontSize: 11,
                                color: 'var(--color-error)',
                                margin: 0,
                              }}
                            >
                              {task.errorMessage ?? '—'}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('connectorDetail.confirmDeleteAria')}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => e.target === e.currentTarget && setDeleteOpen(false)}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              maxWidth: 400,
              width: '90vw',
            }}
          >
            <p style={{ marginBottom: 12, fontWeight: 600 }}>{t('connectorDetail.confirmDeleteTitle')}</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              {connectorName}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={!!actionBusy}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--color-error)',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: actionBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ctxMenu ? (
        <div
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 1200,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            minWidth: 160,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void restartTask(ctxMenu.taskId);
              setCtxMenu(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 14px',
              border: 'none',
              background: 'none',
              color: 'var(--color-text)',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            {t('connectorDetail.restartTask')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
