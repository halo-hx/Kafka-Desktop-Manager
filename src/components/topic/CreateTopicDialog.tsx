/**
 * 创建 Topic 对话框
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useT } from '../../i18n';

export interface CreateTopicDialogProps {
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
  transition: 'border-color var(--transition-fast)',
};

function newConfigRow(): { id: string; key: string; value: string } {
  return { id: `${Date.now()}-${Math.random()}`, key: '', value: '' };
}

export function CreateTopicDialog({ open, clusterId, onClose, onCreated }: CreateTopicDialogProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [partitions, setPartitions] = useState('3');
  const [replicationFactor, setReplicationFactor] = useState('2');
  const [extra, setExtra] = useState(() => [newConfigRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setPartitions('3');
      setReplicationFactor('2');
      setExtra([newConfigRow()]);
      setErrors({});
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const validate = () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (!n) e.name = t('createTopic.topicNameRequired');
    else if (n.length < 1 || n.length > 249) e.name = t('createTopic.nameLengthError');
    else if (!/^[a-zA-Z0-9._-]+$/.test(n)) e.name = t('createTopic.nameCharsetError');

    const p = Number(partitions);
    if (!Number.isInteger(p) || p < 1 || p > 10000) e.partitions = t('createTopic.partitionsRangeError');

    const r = Number(replicationFactor);
    if (!Number.isInteger(r) || r < 1) e.replicationFactor = t('createTopic.replicationFactorPositiveError');

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const configs: Record<string, string> = {};
    for (const row of extra) {
      const k = row.key.trim();
      if (!k && !row.value.trim()) continue;
      if (!k) {
        setErrors({ config: t('createTopic.configKeyRequiredError') });
        return;
      }
      configs[k] = row.value;
    }
    setSubmitting(true);
    try {
      await invoke('create_topic', {
        clusterId,
        name: name.trim(),
        partitions: Number(partitions),
        replicationFactor: Number(replicationFactor),
        configs,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      console.warn('[CreateTopicDialog]', err);
      setErrors({
        submit: typeof err === 'string' ? err : err instanceof Error ? err.message : t('createTopic.createFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('createTopic.title')}
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
          width: 520,
          maxWidth: '92vw',
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600 }}>{t('createTopic.title')}</h2>
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
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-faint)';
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-5)', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              {t('createTopic.topicName')}
            </label>
            <input
              ref={firstRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createTopic.topicNamePlaceholder')}
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
            {errors.name && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.name}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
                {t('createTopic.partitions')}
              </label>
              <input
                type="number"
                min={1}
                max={10000}
                value={partitions}
                onChange={(e) => setPartitions(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-heading)' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
              {errors.partitions && (
                <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.partitions}</p>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
                {t('createTopic.replicationFactor')}
              </label>
              <input
                type="number"
                min={1}
                value={replicationFactor}
                onChange={(e) => setReplicationFactor(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-heading)' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
              {errors.replicationFactor && (
                <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.replicationFactor}</p>
              )}
            </div>
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>{t('createTopic.advancedConfigOptional')}</p>
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
                  {[t('createTopic.configKey'), t('createTopic.configValue'), ''].map((h) => (
                    <th
                      key={h || 'a'}
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
                {extra.map((row, idx) => (
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
                          setExtra((rows) => rows.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))
                        }
                        placeholder="retention.ms"
                        style={{ ...inputStyle, fontSize: 12, fontFamily: 'var(--font-heading)' }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                        }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={row.value}
                        onChange={(e) =>
                          setExtra((rows) => rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))
                        }
                        placeholder="604800000"
                        style={{ ...inputStyle, fontSize: 12, fontFamily: 'var(--font-heading)' }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                        }}
                      />
                    </td>
                    <td style={{ padding: 6, width: 40, textAlign: 'center' }}>
                      <button
                        type="button"
                        aria-label={t('createTopic.removeRowAria')}
                        onClick={() => setExtra((rows) => rows.filter((r) => r.id !== row.id))}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-faint)',
                          padding: 4,
                          borderRadius: 'var(--radius-sm)',
                          transition: 'color var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-error)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-text-faint)';
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
            onClick={() => setExtra((rows) => [...rows, newConfigRow()])}
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
              transition: 'background var(--transition-fast), border-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-2)';
            }}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            {t('createTopic.addConfig')}
          </button>
          {errors.config && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 8 }}>{errors.config}</p>}
          {errors.submit && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 8 }}>{errors.submit}</p>}
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
              transition: 'background var(--transition-fast)',
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
              color: submitting ? 'var(--color-primary)' : '#000',
              fontWeight: 600,
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'opacity var(--transition-fast)',
            }}
          >
            {submitting && <Loader2 size={16} strokeWidth={2} style={{ animation: 'km-spin 1s linear infinite' }} />}
            {submitting ? t('createTopic.creating') : t('createTopic.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
