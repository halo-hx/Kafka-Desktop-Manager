/**
 * 创建 Kafka Connect Connector
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useT } from '../../i18n';

export interface CreateConnectorDialogProps {
  open: boolean;
  clusterId: string;
  onClose: () => void;
  onCreated?: () => void;
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  outline: 'none',
};

function newConfigRow(): { id: string; key: string; value: string } {
  return { id: `${Date.now()}-${Math.random()}`, key: '', value: '' };
}

export function CreateConnectorDialog({ open, clusterId, onClose, onCreated }: CreateConnectorDialogProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [connectorClass, setConnectorClass] = useState('');
  const [rows, setRows] = useState(() => [newConfigRow()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [validateResult, setValidateResult] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setConnectorClass('');
      setRows([newConfigRow()]);
      setPasteOpen(false);
      setPasteText('');
      setErrors({});
      setValidateResult(null);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const configObject = (): Record<string, string> => {
    const cfg: Record<string, string> = {};
    const cc = connectorClass.trim();
    if (cc) cfg['connector.class'] = cc;
    for (const row of rows) {
      const k = row.key.trim();
      if (!k) continue;
      cfg[k] = row.value;
    }
    return cfg;
  };

  const applyJsonToTable = (text: string) => {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        setErrors({ paste: t('createConnector.errJsonMustBeObject') });
        return;
      }
      const nextRows: { id: string; key: string; value: string }[] = [];
      let cls = connectorClass;
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'connector.class') {
          cls = String(v ?? '');
          continue;
        }
        nextRows.push({
          id: `${Date.now()}-${k}-${Math.random()}`,
          key: k,
          value: v === null || v === undefined ? '' : String(v),
        });
      }
      if (cls.trim()) setConnectorClass(cls);
      setRows(nextRows.length > 0 ? nextRows : [newConfigRow()]);
      setPasteOpen(false);
      setPasteText('');
      setErrors({});
    } catch {
      setErrors({ paste: t('createConnector.errJsonParseFailed') });
    }
  };

  const handleValidate = async () => {
    setValidateResult(null);
    setErrors({});
    const cls = connectorClass.trim();
    if (!cls) {
      setErrors({ connectorClass: t('createConnector.errNeedClassToValidate') });
      return;
    }
    setSubmitting(true);
    try {
      const raw = await invoke<unknown>('validate_connector_config', {
        clusterId,
        connectorClass: cls,
        config: configObject(),
      });
      setValidateResult(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
    } catch (e) {
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
      setErrors({ validate: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setErrors({});
    const n = name.trim();
    const cls = connectorClass.trim();
    const e: Record<string, string> = {};
    if (!n) e.name = t('createConnector.errNameEmptyShort');
    if (!cls) e.connectorClass = t('createConnector.errClassEmptyShort');
    for (const row of rows) {
      const k = row.key.trim();
      if (k === '' && row.value.trim()) e.config = t('createConnector.errUnnamedConfigKey');
    }
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    setSubmitting(true);
    try {
      await invoke('create_connector', {
        clusterId,
        name: n,
        config: configObject(),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setErrors({
        submit:
          typeof err === 'string' ? err : err instanceof Error ? err.message : t('createConnector.errCreateFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('createConnector.ariaDialog')}
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
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 560,
          maxWidth: '94vw',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600 }}>
            {t('createConnector.title')}
          </h2>
          <button
            type="button"
            aria-label={t('createConnector.ariaClose')}
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-faint)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-5)', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              {t('createConnector.name')}
            </label>
            <input
              ref={firstRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createConnector.namePlaceholder')}
              style={{ ...inputStyle, fontFamily: 'var(--font-heading)' }}
            />
            {errors.name && (
              <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.name}</p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              {t('createConnector.className')}
            </label>
            <input
              value={connectorClass}
              onChange={(e) => setConnectorClass(e.target.value)}
              placeholder={t('createConnector.classPlaceholder')}
              style={{ ...inputStyle, fontFamily: 'var(--font-heading)', fontSize: 12 }}
            />
            {errors.connectorClass && (
              <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.connectorClass}</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              style={{
                padding: '6px 12px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              {t('createConnector.pasteFromJson')}
            </button>
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={submitting}
              style={{
                padding: '6px 12px',
                background: 'var(--color-primary-muted)',
                border: '1px solid var(--color-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: 'var(--color-primary)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {t('createConnector.validateConfig')}
            </button>
          </div>
          {errors.validate && (
            <p style={{ color: 'var(--color-error)', fontSize: 11, marginBottom: 8 }}>{errors.validate}</p>
          )}
          {validateResult && (
            <pre
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-heading)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-subtle)',
                padding: 10,
                borderRadius: 'var(--radius-sm)',
                maxHeight: 160,
                overflow: 'auto',
                marginBottom: 12,
                color: 'var(--color-text-muted)',
              }}
            >
              {validateResult}
            </pre>
          )}

          {pasteOpen && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
                {t('createConnector.pasteConfigLabel')}
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={t('createConnector.pasteConfigPlaceholder')}
                style={{
                  ...inputStyle,
                  fontFamily: 'var(--font-heading)',
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />
              {errors.paste && (
                <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.paste}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => applyJsonToTable(pasteText)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--color-primary-text)',
                  }}
                >
                  {t('createConnector.importToTable')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasteOpen(false);
                    setPasteText('');
                    setErrors({});
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>{t('createConnector.config')}</p>
          <div
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface)' }}>
                  {[t('common.key'), t('common.value'), ''].map((h) => (
                    <th
                      key={h || 'x'}
                      style={{
                        padding: '6px 10px',
                        textAlign: 'left',
                        color: 'var(--color-text-faint)',
                        fontSize: 10,
                        fontWeight: 600,
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <td style={{ padding: 6 }}>
                      <input
                        value={row.key}
                        onChange={(e) =>
                          setRows((r) => r.map((x) => (x.id === row.id ? { ...x, key: e.target.value } : x)))
                        }
                        placeholder={t('createConnector.configKeyPlaceholder')}
                        style={{ ...inputStyle, fontSize: 12, fontFamily: 'var(--font-heading)' }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={row.value}
                        onChange={(e) =>
                          setRows((r) => r.map((x) => (x.id === row.id ? { ...x, value: e.target.value } : x)))
                        }
                        placeholder={t('createConnector.valuePlaceholder')}
                        style={{ ...inputStyle, fontSize: 12, fontFamily: 'var(--font-heading)' }}
                      />
                    </td>
                    <td style={{ padding: 6, width: 40, textAlign: 'center' }}>
                      <button
                        type="button"
                        aria-label={t('createTopic.removeRowAria')}
                        onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-faint)',
                          padding: 4,
                        }}
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setRows((r) => [...r, newConfigRow()])}
            style={{
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--color-surface-2)',
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            {t('createConnector.addKeyValue')}
          </button>
          {errors.config && (
            <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 8 }}>{errors.config}</p>
          )}
          {errors.submit && (
            <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 8 }}>{errors.submit}</p>
          )}
        </div>

        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '7px 14px',
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{
              padding: '7px 18px',
              background: submitting ? 'var(--color-primary-muted)' : 'var(--color-primary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: submitting ? 'var(--color-primary)' : 'var(--color-primary-text)',
              fontWeight: 600,
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {submitting && (
              <Loader2 size={16} strokeWidth={2} style={{ animation: 'km-spin 1s linear infinite' }} />
            )}
            {submitting ? t('createConnector.creating') : t('createConnector.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
