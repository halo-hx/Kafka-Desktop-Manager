/**
 * ClusterConfigEditDialog — 集群配置编辑对话框
 * 基于控制器 Broker 调用 DescribeConfigs 加载当前值，
 * 用户修改后通过 IncrementalAlterConfigs 仅提交差异。
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { tauriInvoke } from '../../lib/tauri';
import { useT } from '../../i18n';

interface BrokerConfigEntry {
  name: string;
  value: string;
  read_only: boolean;
  is_default: boolean;
  sensitive: boolean;
}

interface ConfigChange {
  name: string;
  value: string | null; // null 表示 DELETE，恢复默认
}

interface Props {
  open: boolean;
  clusterId: string;
  brokerId: number;
  onClose: () => void;
  onApplied?: () => void;
}

export function ClusterConfigEditDialog({ open, clusterId, brokerId, onClose, onApplied }: Props) {
  const t = useT();
  const [entries, setEntries] = useState<BrokerConfigEntry[]>([]);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyEditable, setOnlyEditable] = useState(true);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tauriInvoke<BrokerConfigEntry[]>('get_broker_config', {
        clusterId,
        brokerId,
      });
      const sorted = [...result].sort((a, b) => a.name.localeCompare(b.name));
      setEntries(sorted);
      setEdited({});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t('overview.editConfig.loadError', { error: msg }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
      setSearch('');
      setOnlyEditable(true);
      setOnlyChanged(false);
      setConfirmOpen(false);
      setToast(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clusterId, brokerId]);

  const changes: ConfigChange[] = useMemo(() => {
    const list: ConfigChange[] = [];
    for (const [name, newVal] of Object.entries(edited)) {
      const original = entries.find((e) => e.name === name);
      if (!original) continue;
      // 敏感字段原值不可信（Kafka 返回 null/空）；只要有输入就视作 SET。
      const originalValue = original.sensitive ? '' : original.value;
      if (newVal !== originalValue) {
        list.push({ name, value: newVal });
      }
    }
    return list;
  }, [edited, entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (onlyEditable && e.read_only) return false;
      if (onlyChanged && !(e.name in edited)) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.value.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [entries, search, onlyEditable, onlyChanged, edited]);

  const setEntryValue = (name: string, value: string) => {
    setEdited((prev) => {
      const next = { ...prev };
      next[name] = value;
      return next;
    });
  };

  const resetEntry = (name: string) => {
    setEdited((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const resetAll = () => setEdited({});

  const apply = async () => {
    if (changes.length === 0) return;
    setApplying(true);
    try {
      await tauriInvoke<void>('alter_cluster_configs', {
        clusterId,
        brokerId,
        changes: changes.map((c) => ({ name: c.name, value: c.value })),
      });
      setToast({
        kind: 'ok',
        text: t('overview.editConfig.applySuccess', { count: changes.length }),
      });
      setConfirmOpen(false);
      onApplied?.();
      // 重新拉取以反映最新值
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ kind: 'err', text: t('overview.editConfig.applyError', { error: msg }) });
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('overview.editConfig.title')}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 820,
          maxWidth: '92vw',
          maxHeight: '88vh',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              {t('overview.editConfig.title')}
            </h2>
            <p
              style={{
                fontSize: 11,
                color: 'var(--color-text-faint)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('overview.editConfig.subtitle', { brokerId })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-faint)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search
              size={12}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('overview.editConfig.searchPlaceholder')}
              style={{
                width: '100%',
                padding: '6px 8px 6px 26px',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                outline: 'none',
              }}
            />
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={onlyEditable}
              onChange={(e) => setOnlyEditable(e.target.checked)}
              style={{ accentColor: 'var(--color-primary)' }}
            />
            {t('overview.editConfig.showOnlyEditable')}
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              style={{ accentColor: 'var(--color-primary)' }}
            />
            {t('overview.editConfig.showOnlyChanged')}
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title={t('common.refresh')}
            style={{
              padding: '5px 10px',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {loading ? <Loader2 className="animate-km-spin" size={12} /> : <RefreshCw size={12} />}
            {t('common.refresh')}
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="alert"
            style={{
              margin: '10px 20px 0',
              padding: '8px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background:
                toast.kind === 'ok' ? 'var(--color-primary-muted)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${
                toast.kind === 'ok' ? 'var(--color-primary)' : 'rgba(239,68,68,0.3)'
              }`,
              color: toast.kind === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {toast.text}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 12px' }}>
          {error && (
            <div
              style={{
                margin: '10px 0',
                padding: '10px 12px',
                fontSize: 13,
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(239,68,68,0.35)',
                background: 'rgba(239,68,68,0.08)',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <AlertCircle
                size={16}
                color="var(--color-error)"
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              {error}
            </div>
          )}

          {loading && !entries.length && (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Loader2 className="animate-km-spin" size={22} />
              {t('common.loading')}
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <p
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--color-text-faint)',
                fontSize: 12,
              }}
            >
              {t('overview.editConfig.empty')}
            </p>
          )}

          {filtered.map((entry) => {
            const isEdited = entry.name in edited;
            const displayValue = isEdited ? edited[entry.name] : entry.sensitive ? '' : entry.value;
            return (
              <div
                key={entry.name}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  display: 'grid',
                  gridTemplateColumns: '260px 1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  background: isEdited ? 'var(--color-primary-muted)' : 'transparent',
                  borderRadius: isEdited ? 'var(--radius-sm)' : 0,
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--color-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={entry.name}
                  >
                    {entry.name}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {entry.read_only && (
                      <Badge color="#9CA3AF">{t('overview.editConfig.readonlyBadge')}</Badge>
                    )}
                    {entry.is_default && (
                      <Badge color="#6B7280">{t('overview.editConfig.defaultBadge')}</Badge>
                    )}
                    {entry.sensitive && (
                      <Badge color="#F59E0B">{t('overview.editConfig.sensitiveBadge')}</Badge>
                    )}
                    {isEdited && (
                      <Badge color="var(--color-primary)">
                        {t('overview.editConfig.modifiedBadge')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <input
                    type="text"
                    value={displayValue}
                    placeholder={entry.sensitive ? t('overview.editConfig.sensitiveHidden') : ''}
                    readOnly={entry.read_only}
                    onChange={(e) => setEntryValue(entry.name, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      background: entry.read_only ? 'var(--color-bg)' : 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: `1px solid ${isEdited ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontFamily: 'var(--font-heading)',
                      outline: 'none',
                      opacity: entry.read_only ? 0.7 : 1,
                    }}
                  />
                </div>
                <div>
                  {isEdited && (
                    <button
                      type="button"
                      onClick={() => resetEntry(entry.name)}
                      style={{
                        padding: '3px 8px',
                        background: 'transparent',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      {t('overview.editConfig.reset')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
            {changes.length === 0
              ? t('overview.editConfig.noChanges')
              : t('overview.editConfig.apply', { count: changes.length })}
          </span>
          <div style={{ flex: 1 }} />
          {changes.length > 0 && (
            <button
              type="button"
              onClick={resetAll}
              style={{
                padding: '6px 12px',
                background: 'none',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {t('overview.editConfig.reset')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              background: 'none',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={changes.length === 0 || applying}
            onClick={() => setConfirmOpen(true)}
            style={{
              padding: '6px 14px',
              background:
                changes.length === 0 || applying
                  ? 'var(--color-primary-muted)'
                  : 'var(--color-primary)',
              color:
                changes.length === 0 || applying
                  ? 'var(--color-primary)'
                  : 'var(--color-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: changes.length === 0 || applying ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {applying ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Loader2 className="animate-km-spin" size={13} />
                {t('common.saving')}
              </span>
            ) : (
              t('overview.editConfig.apply', { count: changes.length })
            )}
          </button>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            style={{
              width: 480,
              maxWidth: '90vw',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 18,
              boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 8,
              }}
            >
              {t('overview.editConfig.confirmTitle')}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              {t('overview.editConfig.confirmMessage', { brokerId })}
            </p>
            <div
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: 8,
                marginBottom: 14,
              }}
            >
              {changes.map((c) => (
                <div
                  key={c.name}
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 11,
                    color: 'var(--color-text)',
                    padding: '3px 0',
                    borderBottom: '1px dashed var(--color-border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--color-primary)' }}>{c.name}</span>
                  <span style={{ color: 'var(--color-text-faint)' }}> = </span>
                  <span>{c.value ?? '<delete>'}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={applying}
                style={{
                  padding: '6px 12px',
                  background: 'none',
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applying}
                style={{
                  padding: '6px 14px',
                  background: 'var(--color-primary)',
                  color: 'var(--color-primary-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: applying ? 'wait' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {applying && <Loader2 className="animate-km-spin" size={12} />}
                {t('overview.editConfig.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 8,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}
