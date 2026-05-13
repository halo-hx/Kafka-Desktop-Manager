/**
 * 导出连接配置 — 敏感字段替换为占位符。
 */
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, FileJson, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { ClusterConnection } from '../../types';
import { useConnectionStore } from '../../stores/connectionStore';
import { useT } from '../../i18n';

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  backdropFilter: 'blur(8px)',
};

function sanitizeConnection(c: ClusterConnection): Record<string, unknown> {
  const o: Record<string, unknown> = { ...c };
  delete o.status;
  if (o.saslJaasConfig != null && String(o.saslJaasConfig).length > 0) {
    o.saslJaasConfig = '<REDACTED>';
  }
  if (o.sslClientKeyPassword != null && String(o.sslClientKeyPassword).length > 0) {
    o.sslClientKeyPassword = '<REDACTED>';
  }
  if (o.schemaRegistryPassword != null && String(o.schemaRegistryPassword).length > 0) {
    o.schemaRegistryPassword = '<REDACTED>';
  }
  return o;
}

export function ConnectionExportDialog({
  open: openDlg,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const connections = useConnectionStore((s) => s.connections);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (openDlg) {
      const m: Record<string, boolean> = {};
      for (const c of connections) m[c.id] = true;
      setSelected(m);
      setErr(null);
    }
  }, [openDlg, connections]);

  const allIds = useMemo(() => connections.map((c) => c.id), [connections]);

  const toggleAll = (on: boolean) => {
    setSelected((prev) => {
      const n = { ...prev };
      for (const id of allIds) n[id] = on;
      return n;
    });
  };

  const defaultFileName = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `kafka-connections-${y}-${mo}-${day}.json`;
  }, [openDlg]);

  const onExport = async () => {
    setErr(null);
    const picked = connections.filter((c) => selected[c.id]);
    if (!picked.length) {
      setErr(t('connExport.errSelectAtLeastOne'));
      return;
    }
    setBusy(true);
    try {
      const path = await save({
        title: t('connExport.saveDialogTitle'),
        defaultPath: defaultFileName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) {
        setBusy(false);
        return;
      }
      const payload = picked.map((c) => sanitizeConnection(c));
      await writeTextFile(path, `${JSON.stringify(payload, null, 2)}\n`);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!openDlg) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={backdrop}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        style={{
          width: 'min(440px, 92vw)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-body)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Download size={20} color="var(--color-primary)" />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>{t('connExport.title')}</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-faint)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div
          style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <p
            style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55, margin: 0 }}
          >
            {t('connExport.description')}
          </p>
          <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
            <button type="button" onClick={() => toggleAll(true)} style={linkBtn}>
              {t('connExport.selectAll')}
            </button>
            <button type="button" onClick={() => toggleAll(false)} style={linkBtn}>
              {t('connExport.deselectAll')}
            </button>
          </div>
          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 8,
            }}
          >
            {connections.map((c) => (
              <label
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 4px',
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  color: 'var(--color-text)',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selected[c.id]}
                  disabled={busy}
                  onChange={(e) => setSelected((s) => ({ ...s, [c.id]: e.target.checked }))}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
                  {c.bootstrapServers}
                </span>
              </label>
            ))}
            {connections.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-faint)' }}>
                {t('connExport.noConnections')}
              </div>
            )}
          </div>
          {err && (
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239,68,68,0.12)',
                color: 'var(--color-error)',
                fontSize: 12,
              }}
            >
              {err}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" disabled={busy} onClick={onClose} style={btnSecondary}>
              {t('connExport.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || !connections.some((c) => selected[c.id])}
              onClick={() => void onExport()}
              style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FileJson size={16} />
              {t('connExport.export')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--color-primary)',
  cursor: 'pointer',
  padding: 0,
  fontSize: 12,
};
const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 18px',
  background: 'var(--color-primary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  color: '#0b172a',
  cursor: 'pointer',
};
