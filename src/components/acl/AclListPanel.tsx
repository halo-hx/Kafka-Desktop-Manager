/**
 * Kafka ACL 列表与管理
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, RefreshCw, Search, Shield } from 'lucide-react';
import type { AclEntry } from '../../types';
import { snakeToCamel } from '../../lib/tauri';
import { AddAclDialog } from './AddAclDialog';
import { useT } from '../../i18n';

function PermBadge({ permissionType }: { permissionType: AclEntry['permissionType'] }) {
  const allow = permissionType === 'ALLOW';
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
        background: allow ? 'var(--color-primary-muted)' : 'rgba(239,68,68,0.12)',
        color: allow ? 'var(--color-success)' : 'var(--color-error)',
        border: allow ? '1px solid var(--color-primary)' : '1px solid rgba(239,68,68,0.35)',
      }}
    >
      {permissionType}
    </span>
  );
}

function normalizeAcl(row: unknown): AclEntry | null {
  const x = snakeToCamel(row) as Partial<AclEntry>;
  if (!x.principal || !x.resourceType) return null;
  const rt = String(x.resourceType).toUpperCase();
  const pt = String(x.patternType ?? 'LITERAL').toUpperCase();
  const perm = String(x.permissionType ?? 'ALLOW').toUpperCase();
  if (!['TOPIC', 'GROUP', 'CLUSTER', 'TRANSACTIONAL_ID'].includes(rt)) return null;
  if (!['LITERAL', 'PREFIXED'].includes(pt)) return null;
  if (!['ALLOW', 'DENY'].includes(perm)) return null;
  return {
    principal: x.principal,
    resourceType: rt as AclEntry['resourceType'],
    resourceName: x.resourceName ?? '',
    patternType: pt as AclEntry['patternType'],
    operation: x.operation ?? '',
    permissionType: perm as AclEntry['permissionType'],
    host: x.host ?? '*',
  };
}

type GroupMode = 'principal' | 'resource';

export function AclListPanel({ clusterId }: { clusterId: string }) {
  const t = useT();
  const [rows, setRows] = useState<AclEntry[]>([]);
  const [search, setSearch] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('principal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; row: AclEntry } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AclEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<unknown[]>('list_acls', { clusterId });
      const list = Array.isArray(raw) ? (raw.map(normalizeAcl).filter(Boolean) as AclEntry[]) : [];
      setRows(list);
    } catch (e) {
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.principal.toLowerCase().includes(q) ||
        r.resourceName.toLowerCase().includes(q) ||
        String(r.operation).toLowerCase().includes(q),
    );
  }, [rows, search]);

  type GroupBucket = { key: string; label: string; items: AclEntry[] };

  const grouped = useMemo((): GroupBucket[] => {
    const map = new Map<string, GroupBucket>();
    for (const r of filtered) {
      const key =
        groupMode === 'principal'
          ? `p:${r.principal}`
          : `r:${r.resourceType}|${r.patternType}|${r.resourceName}`;
      const label =
        groupMode === 'principal'
          ? r.principal
          : `${r.resourceType} · ${r.patternType} · ${r.resourceName || '—'}`;
      if (!map.has(key)) {
        map.set(key, { key, label, items: [] });
      }
      map.get(key)!.items.push(r);
    }
    const out = Array.from(map.values());
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [filtered, groupMode]);

  const handleDelete = async (row: AclEntry) => {
    setBusy(true);
    setError(null);
    try {
      await invoke('delete_acl', {
        clusterId,
        acl: {
          principal: row.principal,
          resource_type: row.resourceType,
          resource_name: row.resourceName,
          pattern_type: row.patternType,
          operation: row.operation,
          permission_type: row.permissionType,
          host: row.host,
        },
      });
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
            {t('acl.title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{t('acl.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'var(--color-primary-muted)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-primary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('acl.addAcl')}
        </button>
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
            placeholder={t('acl.searchPrincipalResource')}
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
        <div
          style={{
            display: 'inline-flex',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setGroupMode('principal')}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background:
                groupMode === 'principal' ? 'var(--color-surface-2)' : 'var(--color-surface)',
              color: groupMode === 'principal' ? 'var(--color-text)' : 'var(--color-text-muted)',
            }}
          >
            {t('acl.groupByPrincipal')}
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('resource')}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderLeft: '1px solid var(--color-border)',
              cursor: 'pointer',
              background:
                groupMode === 'resource' ? 'var(--color-surface-2)' : 'var(--color-surface)',
              color: groupMode === 'resource' ? 'var(--color-text)' : 'var(--color-text-muted)',
            }}
          >
            {t('acl.groupByResource')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
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
            fontSize: 13,
          }}
        >
          <RefreshCw
            size={16}
            style={{ animation: loading ? 'km-spin 0.9s linear infinite' : undefined }}
          />
          {t('acl.refresh')}
        </button>
      </header>

      {error ? (
        <div
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border:
              error === 'ERR_ACL_NOT_SUPPORTED'
                ? '1px solid var(--color-border)'
                : '1px solid rgba(239, 68, 68, 0.45)',
            background:
              error === 'ERR_ACL_NOT_SUPPORTED'
                ? 'var(--color-surface-2)'
                : 'rgba(239, 68, 68, 0.1)',
            color:
              error === 'ERR_ACL_NOT_SUPPORTED' ? 'var(--color-text-muted)' : 'var(--color-error)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error === 'ERR_ACL_NOT_SUPPORTED' ? t('acl.notSupported') : error}
        </div>
      ) : null}

      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          overflow: 'auto',
          background: 'var(--color-surface)',
        }}
      >
        {loading && rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Loader2
              size={28}
              style={{ animation: 'km-spin 0.9s linear infinite', display: 'inline-block' }}
            />
          </div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-faint)' }}>
            <Shield size={36} strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.5 }} />
            <p>{rows.length === 0 ? t('acl.noData') : t('acl.noMatch')}</p>
          </div>
        ) : (
          grouped.map((g) => (
            <section key={g.key}>
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--color-bg)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-heading)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                {g.label}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    {[
                      t('acl.principal'),
                      t('acl.resourceType'),
                      t('acl.resourceName'),
                      t('acl.patternType'),
                      t('acl.operation'),
                      t('acl.permission'),
                      t('acl.host'),
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--color-text-faint)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r, idx) => (
                    <tr
                      key={`${r.principal}-${r.resourceType}-${r.resourceName}-${r.operation}-${idx}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtx({ x: e.clientX, y: e.clientY, row: r });
                      }}
                      style={{
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        cursor: 'default',
                      }}
                      className="km-acl-row"
                    >
                      <td
                        style={{
                          padding: '9px 12px',
                          fontFamily: 'var(--font-heading)',
                          fontSize: 12,
                        }}
                      >
                        {r.principal}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--color-text-muted)' }}>
                        {r.resourceType}
                      </td>
                      <td
                        style={{
                          padding: '9px 12px',
                          fontFamily: 'var(--font-heading)',
                          fontSize: 12,
                          color: 'var(--color-text)',
                        }}
                      >
                        {r.resourceName}
                      </td>
                      <td style={{ padding: '9px 12px' }}>{r.patternType}</td>
                      <td
                        style={{
                          padding: '9px 12px',
                          fontFamily: 'var(--font-heading)',
                          fontSize: 12,
                        }}
                      >
                        {r.operation}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <PermBadge permissionType={r.permissionType} />
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12 }}>{r.host}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>

      <style>{`
        .km-acl-row:hover { background: var(--color-surface-2) !important; }
      `}</style>

      <AddAclDialog
        open={addOpen}
        clusterId={clusterId}
        onClose={() => setAddOpen(false)}
        onCreated={() => void refresh()}
      />

      {ctx ? (
        <div
          style={{
            position: 'fixed',
            left: ctx.x,
            top: ctx.y,
            zIndex: 1100,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            minWidth: 120,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(ctx.row);
              setCtx(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 14px',
              border: 'none',
              background: 'none',
              color: 'var(--color-error)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => e.target === e.currentTarget && !busy && setConfirmDelete(null)}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              maxWidth: 440,
              width: '92vw',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 12 }}>{t('acl.confirmDeleteTitle')}</p>
            <pre
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-heading)',
                whiteSpace: 'pre-wrap',
                color: 'var(--color-text-muted)',
                marginBottom: 16,
              }}
            >
              {JSON.stringify(confirmDelete, null, 2)}
            </pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete(confirmDelete)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--color-error)',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
