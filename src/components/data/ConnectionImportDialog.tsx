/**
 * 从 JSON 导入连接配置（名称冲突：跳过 / 覆盖 / 重命名）
 */
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { FileJson, Upload, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { ClusterConnection } from '../../types';
import { snakeToCamel } from '../../lib/tauri';
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

type ConflictPolicy = 'skip' | 'override' | 'rename';

function normalizeImported(row: unknown): Partial<ClusterConnection> | null {
  if (!row || typeof row !== 'object') return null;
  const r = snakeToCamel(row) as Partial<ClusterConnection>;
  if (!r.name || typeof r.name !== 'string') return null;
  return {
    name: r.name,
    bootstrapServers: r.bootstrapServers ?? '',
    kafkaVersion: r.kafkaVersion ?? '3.7',
    zookeeperHost: r.zookeeperHost,
    zookeeperPort: r.zookeeperPort,
    zkChrootPath: r.zkChrootPath,
    clusterMode: r.clusterMode ?? 'AUTO_DETECT',
    securityProtocol: r.securityProtocol ?? 'PLAINTEXT',
    saslMechanism: r.saslMechanism,
    saslJaasConfig: r.saslJaasConfig === '<REDACTED>' ? undefined : r.saslJaasConfig,
    sslCaCertPath: r.sslCaCertPath,
    sslClientCertPath: r.sslClientCertPath,
    sslClientKeyPath: r.sslClientKeyPath,
    sslClientKeyPassword:
      r.sslClientKeyPassword === '<REDACTED>' ? undefined : r.sslClientKeyPassword,
    sslVerifyHostname: r.sslVerifyHostname ?? true,
    schemaRegistryUrl: r.schemaRegistryUrl,
    schemaRegistryUsername: r.schemaRegistryUsername,
    schemaRegistryPassword:
      r.schemaRegistryPassword === '<REDACTED>' ? undefined : r.schemaRegistryPassword,
    connectUrls: r.connectUrls,
    notes: r.notes,
    groupId: r.groupId,
    isFavorite: r.isFavorite ?? false,
    colorTag: r.colorTag,
  };
}

export function ConnectionImportDialog({ open: openDlg, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const connections = useConnectionStore((s) => s.connections);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Partial<ClusterConnection>[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ConflictPolicy>('rename');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (openDlg) {
      setFilePath(null);
      setParsed([]);
      setParseErr(null);
      setPolicy('rename');
      setBusy(false);
    }
  }, [openDlg]);

  const nameToExisting = useMemo(() => {
    const m = new Map<string, ClusterConnection>();
    for (const c of connections) m.set(c.name, c);
    return m;
  }, [connections]);

  const pickFile = async () => {
    const p = await open({
      title: t('connImport.pickFileTitle'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    });
    if (typeof p !== 'string') return;
    setFilePath(p);
    try {
      const raw = JSON.parse(await readTextFile(p)) as unknown;
      const list = Array.isArray(raw) ? raw : (raw as { connections?: unknown[] }).connections;
      if (!Array.isArray(list)) {
        setParseErr(t('connImport.errInvalidArray'));
        setParsed([]);
        return;
      }
      const rows: Partial<ClusterConnection>[] = [];
      for (const item of list) {
        const n = normalizeImported(item);
        if (n) rows.push(n);
      }
      if (!rows.length) {
        setParseErr(t('connImport.errNoValid'));
        setParsed([]);
        return;
      }
      setParseErr(null);
      setParsed(rows);
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : String(e));
      setParsed([]);
    }
  };

  const conflictLines = useMemo(() => {
    return parsed.map((row) => {
      const nm = row.name ?? '';
      return { row, exists: !!nameToExisting.get(nm) };
    });
  }, [parsed, nameToExisting]);

  const onImport = async () => {
    if (!parsed.length) return;
    setBusy(true);
    try {
      const load = useConnectionStore.getState().loadConnections;
      const save = useConnectionStore.getState().saveConnection;

      const taken = () => new Set(useConnectionStore.getState().connections.map((c) => c.name));

      for (const { row, exists } of conflictLines) {
        const name = row.name ?? '';
        if (!name) continue;
        const names = taken();

        if (exists && policy === 'skip') continue;

        let payload: Partial<ClusterConnection> = { ...row };

        if (exists && policy === 'override') {
          const prev = useConnectionStore.getState().connections.find((c) => c.name === name);
          if (prev) payload = { ...row, id: prev.id };
        } else if (exists && policy === 'rename') {
          let next = `${name}-imported`;
          let k = 0;
          while (names.has(next)) {
            k++;
            next = `${name}-imported-${k}`;
          }
          payload = { ...row, id: undefined, name: next };
        } else if (!exists) {
          payload = { ...row, id: undefined };
        }

        await save({ ...payload, status: 'disconnected' });
        await load();
      }
      onClose();
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!openDlg) return null;

  return (
    <div role="dialog" aria-modal="true" style={backdrop} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        style={{
          width: 'min(520px, 92vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-body)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Upload size={20} color="var(--color-primary)" />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>{t('connImport.title')}</h2>
          <button type="button" disabled={busy} onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-faint)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={filePath ?? ''} placeholder={t('connImport.filePlaceholder')} style={{ ...inp, flex: 1 }} />
            <button type="button" onClick={() => void pickFile()} disabled={busy} style={btnSecondary}>
              {t('connImport.browseEllipsis')}
            </button>
          </div>

          <label style={lab}>
            {t('connImport.conflictWhen')}
            <select value={policy} onChange={(e) => setPolicy(e.target.value as ConflictPolicy)} style={inp} disabled={busy}>
              <option value="skip">{t('connImport.policySkipLabel')}</option>
              <option value="override">{t('connImport.policyOverrideLabel')}</option>
              <option value="rename">{t('connImport.policyRenameLabel')}</option>
            </select>
          </label>

          {parseErr && (
            <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.12)', color: 'var(--color-error)', fontSize: 12 }}>
              {parseErr}
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('connImport.preview')}</div>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)' }}>
                  <th style={th}>{t('connImport.colName')}</th>
                  <th style={th}>{t('connImport.colBootstrap')}</th>
                  <th style={th}>{t('connImport.colConflict')}</th>
                </tr>
              </thead>
              <tbody>
                {conflictLines.map(({ row, exists }, idx) => (
                  <tr key={idx}>
                    <td style={td}>{row.name}</td>
                    <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.bootstrapServers}</td>
                    <td style={{ ...td, color: exists ? 'var(--color-warning)' : 'var(--color-text-faint)' }}>{exists ? t('connImport.conflictYes') : t('connImport.conflictNo')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" disabled={busy} onClick={onClose} style={btnSecondary}>
              {t('connImport.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || parsed.length === 0}
              onClick={() => void onImport()}
              style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FileJson size={16} />
              {t('connImport.import')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};
const lab: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-faint)', display: 'flex', flexDirection: 'column', gap: 6 };
const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', color: 'var(--color-text-faint)', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 10px', borderTop: '1px solid var(--color-border-subtle)' };
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
