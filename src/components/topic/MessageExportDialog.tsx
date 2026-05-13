/**
 * 导出选中消息 — JSON Lines / CSV，写入本地文件（Tauri dialog + fs）
 */
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { KafkaMessage } from '../../types';
import { useT } from '../../i18n';

function csvEscape(s: string): string {
  const needs = /[,"\n\r]/.test(s);
  if (!needs) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function MessageExportDialog({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: KafkaMessage[];
}) {
  const t = useT();
  const [format, setFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [includeKey, setIncludeKey] = useState(true);
  const [includeValue, setIncludeValue] = useState(true);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const lineCount = rows.length;

  const buildPayload = useMemo(() => {
    return (): string => {
      if (format === 'jsonl') {
        const lines: string[] = [];
        for (const m of rows) {
          const o: Record<string, unknown> = {
            partition: m.partition,
            offset: m.offset,
            timestamp: m.timestamp,
          };
          if (includeKey) o.key = m.key;
          if (includeValue) o.value = m.value;
          if (includeHeaders) o.headers = m.headers;
          lines.push(JSON.stringify(o));
        }
        return `${lines.join('\n')}\n`;
      }

      const cols: string[] = ['partition', 'offset', 'timestamp'];
      if (includeKey) cols.push('key');
      if (includeValue) cols.push('value');
      if (includeHeaders) cols.push('headers');
      const head = cols.join(',');
      const body = rows.map((m) =>
        cols
          .map((c) => {
            if (c === 'headers') return csvEscape(JSON.stringify(m.headers));
            const v = c === 'key' ? m.key : c === 'value' ? m.value : String((m as never)[c] ?? '');
            return csvEscape(v);
          })
          .join(','),
      );
      return `${head}\n${body.join('\n')}\n`;
    };
  }, [rows, format, includeKey, includeValue, includeHeaders]);

  const onExport = async () => {
    setErr(null);
    setProgress(0);
    setBusy(true);
    try {
      const payload = buildPayload();
      const ext = format === 'jsonl' ? 'jsonl' : 'csv';
      const path = await save({
        defaultPath: `kafka-messages.${ext}`,
        filters: [
          format === 'jsonl'
            ? { name: 'JSON Lines', extensions: ['jsonl', 'txt', 'json'] }
            : { name: 'CSV', extensions: ['csv'] },
        ],
      });
      if (!path) {
        setBusy(false);
        return;
      }
      await new Promise<void>((resolve) => {
        let i = 0;
        const step = Math.max(1, Math.ceil(payload.length / 40));
        const tick = () => {
          i += step;
          setProgress(Math.min(100, Math.round((i / payload.length) * 100)));
          if (i < payload.length) {
            window.requestAnimationFrame(tick);
          } else {
            setProgress(100);
            resolve();
          }
        };
        window.requestAnimationFrame(tick);
      });
      await writeTextFile(path, payload);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        style={{
          width: 'min(480px, 92vw)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-body)',
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
          <Download size={18} color="var(--color-primary)" />
          <strong style={{ flex: 1 }}>{t('msgExport.title')}</strong>
          <button
            type="button"
            aria-label={t('common.close')}
            disabled={busy}
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-faint)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div
          style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {t('msgExport.selectedCount', { count: lineCount })}
          </p>

          <label style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
            {t('msgExport.format')}
            <select
              value={format}
              disabled={busy}
              onChange={(e) => setFormat(e.target.value as 'jsonl' | 'csv')}
              style={{
                display: 'block',
                marginTop: 6,
                width: '100%',
                padding: '8px 10px',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <option value="jsonl">JSON Lines</option>
              <option value="csv">CSV</option>
            </select>
          </label>

          <fieldset
            style={{
              border: `1px solid var(--color-border)`,
              borderRadius: 'var(--radius-sm)',
              padding: 12,
            }}
          >
            <legend style={{ fontSize: 12, padding: '0 6px', color: 'var(--color-text-muted)' }}>
              {t('msgExport.contentFields')}
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 12,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  color: 'var(--color-text)',
                }}
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={includeKey}
                  onChange={(e) => setIncludeKey(e.target.checked)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {t('sendMsg.key')}
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 12,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  color: 'var(--color-text)',
                }}
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={includeValue}
                  onChange={(e) => setIncludeValue(e.target.checked)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {t('sendMsg.value')}
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 12,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  color: 'var(--color-text)',
                }}
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={includeHeaders}
                  onChange={(e) => setIncludeHeaders(e.target.checked)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {t('sendMsg.headers')}
              </label>
            </div>
          </fieldset>

          {busy && (
            <div>
              <div
                style={{
                  height: 6,
                  background: 'var(--color-bg)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: 'var(--color-primary)',
                    transition: 'width var(--transition-fast)',
                  }}
                />
              </div>
              <p style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-faint)' }}>
                {t('msgExport.writingFile', { progress })}
              </p>
            </div>
          )}

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
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: busy ? 'not-allowed' : 'pointer',
                color: 'var(--color-text-muted)',
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || lineCount === 0}
              onClick={() => void onExport()}
              style={{
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
                padding: '8px 16px',
                background: 'var(--color-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                color: '#0b172a',
                cursor: busy || lineCount === 0 ? 'not-allowed' : 'pointer',
                opacity: lineCount === 0 ? 0.5 : 1,
              }}
            >
              <Download size={16} /> {busy ? t('msgExport.exporting') : t('msgExport.export')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
