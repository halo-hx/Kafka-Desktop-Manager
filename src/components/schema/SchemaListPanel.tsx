/**
 * Schema Registry — Subject 列表
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, PlusCircle, RefreshCw, Search } from 'lucide-react';
import type { SchemaSubjectInfo } from '../../types';
import { useT } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { RegisterSchemaDialog } from './RegisterSchemaDialog';

function coerceSchemaType(t: string): SchemaSubjectInfo['schemaType'] {
  const u = t.toUpperCase();
  if (u === 'PROTOBUF' || u === 'JSON' || u === 'AVRO') return u as SchemaSubjectInfo['schemaType'];
  return 'AVRO';
}

function TypeBadge({ schemaType }: { schemaType: SchemaSubjectInfo['schemaType'] }) {
  const map: Record<SchemaSubjectInfo['schemaType'], { fg: string; bg: string; border: string }> = {
    AVRO: {
      fg: 'var(--color-info)',
      bg: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.4)',
    },
    PROTOBUF: {
      fg: '#C084FC',
      bg: 'rgba(168, 85, 247, 0.14)',
      border: 'rgba(168, 85, 247, 0.45)',
    },
    JSON: {
      fg: 'var(--color-success)',
      bg: 'rgba(34, 197, 94, 0.14)',
      border: 'rgba(34, 197, 94, 0.4)',
    },
  };
  const s = map[schemaType] ?? map.AVRO;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--font-heading)',
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
      }}
    >
      {schemaType}
    </span>
  );
}

export function SchemaListPanel({ clusterId }: { clusterId: string }) {
  const t = useT();
  const openTab = useUIStore((s) => s.openTab);
  const [rows, setRows] = useState<SchemaSubjectInfo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<SchemaSubjectInfo[]>('list_subjects', {
        clusterId,
      });
      setRows(
        list.map((r) => ({
          ...r,
          schemaType: coerceSchemaType(String(r.schemaType ?? 'AVRO')),
        })),
      );
    } catch (e) {
      console.warn('[SchemaListPanel]', e);
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : t('schema.loadFailed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.subject.toLowerCase().includes(q));
  }, [rows, search]);

  const openDetail = (s: SchemaSubjectInfo) => {
    openTab({ type: 'schema-detail', clusterId, subject: s.subject }, s.subject, 'file-text');
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
            {t('schema.title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('schema.subtitle')}</p>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ position: 'relative', minWidth: 200 }}>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('schema.search')}
              aria-label={t('schema.searchAria')}
              style={{
                width: '100%',
                padding: '8px 10px 8px 34px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            aria-label={t('schema.registerAria')}
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
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            <PlusCircle size={16} />
            {t('schema.register')}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            title={t('schema.refresh')}
            aria-label={t('schema.refreshAria')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
            }}
          >
            <RefreshCw
              size={16}
              style={{ animation: loading ? 'km-spin 0.9s linear infinite' : undefined }}
            />
            {t('schema.refresh')}
          </button>
        </div>
      </header>

      {error ? (
        <div
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--color-error)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          background: 'var(--color-surface)',
        }}
      >
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          aria-label={t('schema.title')}
        >
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', textAlign: 'left' }}>
              {[
                { key: 'subj', label: t('schema.subject') },
                { key: 'type', label: t('common.type') },
                { key: 'ver', label: t('schema.versions') },
                { key: 'compat', label: t('schema.compatibility') },
                { key: 'upd', label: t('schema.lastUpdated') },
              ].map((h) => (
                <th
                  key={h.key}
                  scope="col"
                  style={{
                    padding: '10px 14px',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}
                >
                  <Loader2
                    size={28}
                    style={{ animation: 'km-spin 0.9s linear infinite', display: 'inline-block' }}
                    aria-label={t('common.loading')}
                  />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-muted)' }}
                >
                  {search.trim() ? t('schema.noMatch') : t('schema.noSubjects')}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.subject}
                  onClick={() => openDetail(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(row);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={t('schema.openSubjectAria', { subject: row.subject })}
                  style={{
                    borderTop: '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                  }}
                  className="km-schema-row"
                >
                  <td
                    style={{
                      padding: '10px 14px',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text)',
                      fontWeight: 500,
                    }}
                  >
                    {row.subject}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <TypeBadge schemaType={coerceSchemaType(String(row.schemaType))} />
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text)' }}>
                    {row.versionCount != null ? row.versionCount : '—'}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      color: 'var(--color-text-muted)',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                    }}
                  >
                    {row.compatibilityLevel}
                  </td>
                  <td
                    style={{ padding: '10px 14px', color: 'var(--color-text-faint)', fontSize: 12 }}
                  >
                    {row.lastUpdated ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <style>{`
        .km-schema-row:hover { background: var(--color-surface-2); }
        .km-schema-row:focus { outline: 2px solid var(--color-primary); outline-offset: -2px; }
      `}</style>

      <RegisterSchemaDialog
        open={dialogOpen}
        clusterId={clusterId}
        onClose={() => setDialogOpen(false)}
        onRegistered={() => void refresh()}
      />
    </div>
  );
}
