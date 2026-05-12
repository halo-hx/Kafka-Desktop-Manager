/**
 * 发送消息对话框 — 单条 / 批量、分区、Key/Value 格式、Headers
 */
import { invoke } from '@tauri-apps/api/core';
import { X, Plus, Send } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useT } from '../../i18n';

export type PayloadFormat = 'String' | 'JSON' | 'Hex';

const TEMPLATE_STORAGE = 'kafka-desktop-manager-message-templates-v1';

function decodeHex(s: string, hexLenError: string): string {
  const clean = s.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) throw new Error(hexLenError);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function encodePayload(raw: string, fmt: PayloadFormat, hexLenError: string): string {
  if (fmt === 'Hex') return decodeHex(raw, hexLenError);
  if (fmt === 'JSON') {
    const o = JSON.parse(raw);
    return typeof o === 'string' ? o : JSON.stringify(o);
  }
  return raw;
}

export function SendMessageDialog({
  open,
  onClose,
  clusterId,
  topicName,
  initialKey,
  initialValue,
  initialHeaders,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  topicName: string;
  initialKey?: string;
  initialValue?: string;
  initialHeaders?: Record<string, string>;
}) {
  const t = useT();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [partitionMode, setPartitionMode] = useState<'auto' | 'manual'>('auto');
  const [partition, setPartition] = useState('');
  const [keyFmt, setKeyFmt] = useState<PayloadFormat>('String');
  const [valFmt, setValFmt] = useState<PayloadFormat>('JSON');
  const [keyBody, setKeyBody] = useState(initialKey ?? '');
  const [valueBody, setValueBody] = useState(initialValue ?? '');
  const [headers, setHeaders] = useState<{ id: string; k: string; v: string }[]>(() => {
    if (initialHeaders && Object.keys(initialHeaders).length > 0) {
      return Object.entries(initialHeaders).map(([k, v]) => ({
        id: `${k}-${Math.random()}`,
        k,
        v,
      }));
    }
    return [{ id: 'hdr-empty', k: '', v: '' }];
  });
  const [saveTpl, setSaveTpl] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [batchText, setBatchText] = useState('');
  const [batchSep, setBatchSep] = useState('|');

  React.useEffect(() => {
    if (!open) return;
    setKeyBody(initialKey ?? '');
    setValueBody(initialValue ?? '');
    if (initialHeaders && Object.keys(initialHeaders).length > 0) {
      setHeaders(
        Object.entries(initialHeaders).map(([k, v]) => ({
          id: `${k}-${Math.random()}`,
          k,
          v,
        })),
      );
    } else {
      setHeaders([{ id: 'hdr-empty', k: '', v: '' }]);
    }
  }, [open, initialKey, initialValue, initialHeaders]);

  const headerMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const h of headers) {
      if (h.k.trim()) m[h.k.trim()] = h.v;
    }
    return m;
  }, [headers]);

  const previewCount = useMemo(() => {
    if (!batchText.trim()) return 0;
    return batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean).length;
  }, [batchText]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const validateJson = useCallback((raw: string) => {
    if (!raw.trim()) return;
    JSON.parse(raw);
  }, []);

  const onSendSingle = async () => {
    setErr(null);
    try {
      if (valFmt === 'JSON' && valueBody.trim()) validateJson(valueBody);
      if (keyFmt === 'JSON' && keyBody.trim()) validateJson(keyBody);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('sendMsg.jsonValidateFailed'));
      return;
    }

    let keyOut: string;
    let valOut: string;
    try {
      keyOut = encodePayload(keyBody, keyFmt, t('sendMsg.hexLengthError'));
      valOut = encodePayload(valueBody, valFmt, t('sendMsg.hexLengthError'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('sendMsg.encodeFailed'));
      return;
    }

    const part =
      partitionMode === 'manual' && partition !== '' ? Number(partition) : null;
    if (partitionMode === 'manual' && (Number.isNaN(part) || part! < 0)) {
      setErr(t('sendMsg.partitionInvalid'));
      return;
    }

    setSending(true);
    try {
      await invoke('send_message', {
        clusterId,
        topic: topicName,
        partition: part,
        key: keyOut || null,
        value: valOut || null,
        headers: Object.keys(headerMap).length ? headerMap : null,
      });
      if (saveTpl) {
        try {
          const prev = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE) ?? '[]') as unknown[];
          const arr = Array.isArray(prev) ? prev : [];
          arr.push({
            topic: topicName,
            keyFmt,
            valFmt,
            key: keyBody,
            value: valueBody,
            headers: headerMap,
            ts: Date.now(),
          });
          localStorage.setItem(TEMPLATE_STORAGE, JSON.stringify(arr.slice(-50)));
        } catch {
          /* ignore storage */
        }
      }
      showToast(t('sendMsg.sendSuccess'));
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const onSendBatch = async () => {
    setErr(null);
    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      setErr(t('sendMsg.batchEmpty'));
      return;
    }
    const sep = batchSep || '|';
    const part =
      partitionMode === 'manual' && partition !== '' ? Number(partition) : null;
    if (partitionMode === 'manual' && (Number.isNaN(part!) || part! < 0)) {
      setErr(t('sendMsg.partitionInvalid'));
      return;
    }

    setSending(true);
    let ok = 0;
    try {
      for (const line of lines) {
        const idx = line.indexOf(sep);
        const k = idx >= 0 ? line.slice(0, idx).trim() : '';
        const v = idx >= 0 ? line.slice(idx + sep.length).trim() : line;
        await invoke('send_message', {
          clusterId,
          topic: topicName,
          partition: part,
          key: k || null,
          value: v || null,
          headers: Object.keys(headerMap).length ? headerMap : null,
        });
        ok += 1;
      }
      showToast(t('sendMsg.batchSentCount', { count: ok }));
      onClose();
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : String(e)}${t('sendMsg.batchPartialError', { ok })}`);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-msg-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        transition: 'opacity var(--transition-normal)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(640px, 92vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
          fontFamily: 'var(--font-body)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <Send size={18} color="var(--color-primary)" />
          <h2 id="send-msg-title" style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>
            {t('sendMsg.titleWithTopic', { topic: topicName })}
          </h2>
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
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['single', 'batch'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${mode === m ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: mode === m ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                  color: mode === m ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {m === 'single' ? t('sendMsg.modeSingle') : t('sendMsg.modeBatch')}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--color-text-faint)' }}>{t('sendMsg.targetPartition')}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={partitionMode}
                onChange={(e) => setPartitionMode(e.target.value as 'auto' | 'manual')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <option value="auto">{t('sendMsg.partitionAutoByKey')}</option>
                <option value="manual">{t('sendMsg.partitionSpecify')}</option>
              </select>
              {partitionMode === 'manual' && (
                <input
                  type="number"
                  min={0}
                  value={partition}
                  onChange={(e) => setPartition(e.target.value)}
                  placeholder={t('sendMsg.partitionNumberPh')}
                  style={{
                    width: 120,
                    padding: '6px 8px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-heading)',
                  }}
                />
              )}
            </div>
          </label>

          {mode === 'single' ? (
            <>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('sendMsg.key')}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{t('sendMsg.formatLabel')}:</span>
                  <select
                    value={keyFmt}
                    onChange={(e) => setKeyFmt(e.target.value as PayloadFormat)}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                    }}
                  >
                    <option value="String">String</option>
                    <option value="JSON">JSON</option>
                    <option value="Hex">Hex</option>
                  </select>
                </div>
                <textarea
                  value={keyBody}
                  onChange={(e) => setKeyBody(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={t('sendMsg.keyPlaceholder')}
                  style={{
                    width: '100%',
                    padding: 10,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-heading)',
                    fontSize: 12,
                    resize: 'vertical',
                    transition: 'border-color var(--transition-fast)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--color-primary)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--color-border)';
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('sendMsg.value')}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{t('sendMsg.formatLabel')}:</span>
                  <select
                    value={valFmt}
                    onChange={(e) => setValFmt(e.target.value as PayloadFormat)}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                    }}
                  >
                    <option value="JSON">JSON</option>
                    <option value="String">String</option>
                    <option value="Hex">Hex</option>
                  </select>
                </div>
                <textarea
                  value={valueBody}
                  onChange={(e) => setValueBody(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder={t('sendMsg.valuePlaceholder')}
                  style={{
                    width: '100%',
                    padding: 10,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-heading)',
                    fontSize: 12,
                    resize: 'vertical',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--color-primary)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--color-border)';
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {t('sendMsg.batchSeparatorLabel')}
                <input
                  value={batchSep}
                  onChange={(e) => setBatchSep(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    width: 80,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-heading)',
                  }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {t('sendMsg.batchLinesHint', { sep: batchSep })}
                <textarea
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: 10,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-heading)',
                    fontSize: 12,
                  }}
                />
              </label>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {t('sendMsg.previewRows')} <strong>{previewCount}</strong>
              </span>
            </>
          )}

          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t('sendMsg.headers')}</div>
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)' }}>
                    <th style={{ textAlign: 'left', padding: 8, color: 'var(--color-text-faint)' }}>{t('sendMsg.headerKey')}</th>
                    <th style={{ textAlign: 'left', padding: 8, color: 'var(--color-text-faint)' }}>{t('sendMsg.headerValue')}</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h.id} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: 4 }}>
                        <input
                          value={h.k}
                          onChange={(e) =>
                            setHeaders((rows) =>
                              rows.map((r) => (r.id === h.id ? { ...r, k: e.target.value } : r)),
                            )
                          }
                          style={{
                            width: '100%',
                            padding: 6,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text)',
                            fontFamily: 'var(--font-heading)',
                          }}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          value={h.v}
                          onChange={(e) =>
                            setHeaders((rows) =>
                              rows.map((r) => (r.id === h.id ? { ...r, v: e.target.value } : r)),
                            )
                          }
                          style={{
                            width: '100%',
                            padding: 6,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text)',
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          aria-label={t('common.delete')}
                          onClick={() => setHeaders((rows) => rows.filter((r) => r.id !== h.id))}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-faint)',
                          }}
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                setHeaders((rows) => [...rows, { id: String(Date.now()), k: '', v: '' }])
              }
              style={{
                marginTop: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                background: 'none',
                border: '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                transition: 'border-color var(--transition-fast), color var(--transition-fast)',
              }}
            >
              <Plus size={14} /> {t('sendMsg.addHeader')}
            </button>
          </div>

          {mode === 'single' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={saveTpl}
                onChange={(e) => setSaveTpl(e.target.checked)}
                style={{ accentColor: 'var(--color-primary)' }}
              />
              {t('sendMsg.saveAsTemplate')}
            </label>
          )}

          {err && (
            <div
              role="alert"
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              style={{
                padding: '8px 16px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-muted)',
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void (mode === 'single' ? onSendSingle() : onSendBatch())}
              disabled={sending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                background: 'var(--color-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: '#0b172a',
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.7 : 1,
              }}
            >
              <Send size={16} /> {sending ? t('sendMsg.sending') : t('sendMsg.send')}
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1100,
            fontSize: 13,
            transition: 'opacity var(--transition-normal)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
