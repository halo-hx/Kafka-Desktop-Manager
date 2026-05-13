/**
 * Topic 属性 / 配置面板
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Loader2, Pencil, Save, X } from 'lucide-react';
import { snakeToCamel } from '../../lib/tauri';
import { useT } from '../../i18n';

export type SerializationType = 'String' | 'JSON' | 'Hex' | 'Avro' | 'Protobuf';

export type TopicConfigSource = 'DEFAULT' | 'TOPIC' | 'BROKER';

export interface TopicConfigRow {
  key: string;
  value: string;
  source: TopicConfigSource;
  /** 集群/Broker 默认值，用于「仅显示非默认值」 */
  defaultValue: string;
}

const SER_OPTIONS: SerializationType[] = ['String', 'JSON', 'Hex', 'Avro', 'Protobuf'];

const PLACEHOLDER_CONFIGS: TopicConfigRow[] = [
  { key: 'cleanup.policy', value: 'delete', source: 'TOPIC', defaultValue: 'delete' },
  { key: 'compression.type', value: 'producer', source: 'DEFAULT', defaultValue: 'producer' },
  { key: 'retention.ms', value: '604800000', source: 'BROKER', defaultValue: '604800000' },
  { key: 'segment.bytes', value: '1073741824', source: 'DEFAULT', defaultValue: '1073741824' },
  { key: 'min.insync.replicas', value: '2', source: 'TOPIC', defaultValue: '1' },
  { key: 'max.message.bytes', value: '1048588', source: 'BROKER', defaultValue: '1048588' },
];

const inputBase: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-heading)',
  fontSize: 12,
  outline: 'none',
  transition: 'border-color var(--transition-fast)',
};

function SourceBadge({ source }: { source: TopicConfigSource }) {
  const styles: Record<TopicConfigSource, CSSProperties> = {
    DEFAULT: {
      background: 'var(--color-surface-2)',
      color: 'var(--color-text-muted)',
      border: '1px solid var(--color-border)',
    },
    TOPIC: {
      background: 'rgba(34, 197, 94, 0.12)',
      color: 'var(--color-success)',
      border: '1px solid rgba(34, 197, 94, 0.35)',
    },
    BROKER: {
      background: 'rgba(59, 130, 246, 0.12)',
      color: 'var(--color-info)',
      border: '1px solid rgba(59, 130, 246, 0.35)',
    },
  };
  const labels: Record<TopicConfigSource, string> = {
    DEFAULT: 'DEFAULT',
    TOPIC: 'TOPIC',
    BROKER: 'BROKER',
  };
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
        ...styles[source],
      }}
    >
      {labels[source]}
    </span>
  );
}

function normalizeConfigPayload(raw: unknown): TopicConfigRow[] | null {
  if (raw === null || raw === undefined) return null;
  const camel = snakeToCamel(raw);
  if (Array.isArray(camel)) {
    return camel.map((row) => {
      const r = row as Record<string, unknown>;
      const key = String(r.key ?? r.name ?? '');
      const value = String(r.value ?? '');
      const sourceRaw = String(r.source ?? 'DEFAULT').toUpperCase();
      const source = (
        ['DEFAULT', 'TOPIC', 'BROKER'].includes(sourceRaw) ? sourceRaw : 'DEFAULT'
      ) as TopicConfigSource;
      const defaultValue = String(r.defaultValue ?? r.default_value ?? value);
      return { key, value, source, defaultValue };
    });
  }
  if (typeof camel === 'object' && camel !== null && !Array.isArray(camel)) {
    const entries = camel as Record<string, unknown>;
    if (Array.isArray(entries.configs)) {
      return normalizeConfigPayload(entries.configs);
    }
    return Object.entries(entries).map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        const o = value as Record<string, unknown>;
        return {
          key,
          value: String(o.value ?? ''),
          source: (String(o.source).toUpperCase() as TopicConfigSource) || 'TOPIC',
          defaultValue: String(o.defaultValue ?? o.default_value ?? ''),
        };
      }
      return {
        key,
        value: String(value ?? ''),
        source: 'TOPIC' as TopicConfigSource,
        defaultValue: String(value ?? ''),
      };
    });
  }
  return null;
}

export function TopicPropertiesPanel({
  clusterId,
  topicName,
}: {
  clusterId: string;
  topicName: string;
}) {
  const t = useT();
  const [keySer, setKeySer] = useState<SerializationType>('String');
  const [valueSer, setValueSer] = useState<SerializationType>('String');
  const [rows, setRows] = useState<TopicConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [configSearch, setConfigSearch] = useState('');
  const [onlyNonDefault, setOnlyNonDefault] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const raw = await invoke<unknown>('get_topic_config', {
        clusterId,
        topicName,
      });
      const parsed = normalizeConfigPayload(raw);
      if (parsed && parsed.length > 0) {
        setRows(parsed);
      } else if (parsed?.length === 0) {
        setRows([]);
      } else {
        setRows(PLACEHOLDER_CONFIGS);
        setFetchError(t('topicProps.fetchErrorPlaceholder'));
      }
    } catch (e) {
      console.warn('[TopicPropertiesPanel] get_topic_config:', e);
      setRows(PLACEHOLDER_CONFIGS);
      setFetchError(
        typeof e === 'string'
          ? e
          : e instanceof Error
            ? e.message
            : t('topicProps.fetchErrorGeneric'),
      );
    } finally {
      setLoading(false);
      setEditMode(false);
      setDraft({});
    }
  }, [clusterId, topicName, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = configSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyNonDefault && r.value === r.defaultValue) return false;
      if (!q) return true;
      return r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q);
    });
  }, [rows, configSearch, onlyNonDefault]);

  const startEdit = () => {
    const d: Record<string, string> = {};
    for (const r of rows) d[r.key] = r.value;
    setDraft(d);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft({});
  };

  const saveEdit = () => {
    setRows((prev) =>
      prev.map((r) => (draft[r.key] !== undefined ? { ...r, value: draft[r.key] } : r)),
    );
    setEditMode(false);
    setDraft({});
    // 实际持久化需对接 alter_topic_configs 等后端命令
  };

  const isChanged = (key: string) =>
    editMode && draft[key] !== undefined && draft[key] !== rows.find((r) => r.key === key)?.value;

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

      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 4,
          }}
        >
          {topicName}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
          {t('topicProps.pageSubtitle')}
        </p>
      </header>

      {fetchError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            marginBottom: 'var(--space-4)',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--color-error)',
            fontSize: 12,
          }}
        >
          <AlertCircle size={16} strokeWidth={2} aria-hidden />
          {fetchError}
        </div>
      )}

      <section style={{ marginBottom: 'var(--space-5)' }}>
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {t('topicProps.contentSerialization')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480 }}>
          <div>
            <label
              style={{
                fontSize: 11,
                color: 'var(--color-text-faint)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('messages.key')}
            </label>
            <select
              value={keySer}
              onChange={(e) => setKeySer(e.target.value as SerializationType)}
              style={{ ...inputBase, cursor: 'pointer' }}
            >
              {SER_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                color: 'var(--color-text-faint)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('messages.value')}
            </label>
            <select
              value={valueSer}
              onChange={(e) => setValueSer(e.target.value as SerializationType)}
              style={{ ...inputBase, cursor: 'pointer' }}
            >
              {SER_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <h2
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              marginRight: 8,
            }}
          >
            {t('topicProps.config')}
          </h2>
          <input
            type="search"
            placeholder={t('topicProps.searchConfigPlaceholder')}
            value={configSearch}
            onChange={(e) => setConfigSearch(e.target.value)}
            style={{ ...inputBase, maxWidth: 220, fontFamily: 'var(--font-body)' }}
          />
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={onlyNonDefault}
              onChange={(e) => setOnlyNonDefault(e.target.checked)}
              style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
            />
            {t('topicProps.onlyNonDefault')}
          </label>
          <div style={{ flex: 1 }} />
          {!editMode ? (
            <button
              type="button"
              onClick={startEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface)';
              }}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
              {t('topicProps.editConfig')}
            </button>
          ) : null}
        </div>

        <div
          style={{
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'auto',
            maxHeight: 'calc(100vh - 320px)',
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
              {t('topicProps.loadingConfig')}
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 48,
                color: 'var(--color-text-faint)',
                fontSize: 13,
              }}
            >
              {t('topicProps.noMatchingConfig')}
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
                    t('topicProps.configName'),
                    t('topicProps.configValue'),
                    t('topicProps.configSource'),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 14px',
                        textAlign: 'left',
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
                {filtered.map((r, i) => {
                  const changed = isChanged(r.key);
                  const displayVal = editMode ? (draft[r.key] ?? r.value) : r.value;
                  return (
                    <tr
                      key={r.key}
                      style={{
                        background: changed
                          ? 'rgba(59, 130, 246, 0.08)'
                          : i % 2 === 0
                            ? 'transparent'
                            : 'rgba(255,255,255,0.015)',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => {
                        if (!changed) e.currentTarget.style.background = 'var(--color-surface-2)';
                      }}
                      onMouseLeave={(e) => {
                        if (!changed) {
                          e.currentTarget.style.background =
                            i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
                        } else {
                          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                        }
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
                        {r.key}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {editMode ? (
                          <input
                            value={displayVal}
                            onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                            style={{
                              ...inputBase,
                              borderColor: changed ? 'var(--color-info)' : 'var(--color-border)',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              fontFamily: 'var(--font-heading)',
                              fontSize: 12,
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            {r.value}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <SourceBadge source={r.source} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {editMode && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 'var(--space-4)',
            }}
          >
            <button
              type="button"
              onClick={cancelEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-muted)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
              }}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={saveEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                background: 'var(--color-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: '#000',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'opacity var(--transition-fast)',
              }}
            >
              <Save size={16} strokeWidth={2} aria-hidden />
              {t('common.save')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
