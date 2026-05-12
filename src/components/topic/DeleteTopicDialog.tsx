/**
 * 删除 Topic 确认对话框
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, X } from 'lucide-react';
import { useT } from '../../i18n';

export interface DeleteTopicDialogProps {
  open: boolean;
  clusterId: string;
  topicName: string;
  onClose: () => void;
  onDeleted?: () => void;
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

export function DeleteTopicDialog({ open, clusterId, topicName, onClose, onDeleted }: DeleteTopicDialogProps) {
  const t = useT();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConfirmText('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const match = confirmText === topicName;

  const handleDelete = async () => {
    if (!match) return;
    setSubmitting(true);
    setError(null);
    try {
      await invoke('delete_topic', {
        clusterId,
        topicName,
      });
      onDeleted?.();
      onClose();
    } catch (e) {
      console.warn('[DeleteTopicDialog]', e);
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : t('deleteTopic.deleteFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('deleteTopic.title')}
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
      <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 440,
          maxWidth: '92vw',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--color-error)' }}>
            {t('deleteTopic.title')}
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

        <div style={{ padding: 'var(--space-5)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
            {t('deleteTopic.confirm', { name: topicName })}
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
            {t('deleteTopic.warning')}
          </p>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
            {t('deleteTopic.typeToConfirm')}
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={topicName}
            autoComplete="off"
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-error)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          />
          {error && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 8 }}>{error}</p>}
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
            onClick={() => void handleDelete()}
            disabled={!match || submitting}
            style={{
              padding: '7px 18px',
              background: !match || submitting ? 'var(--color-surface-2)' : 'var(--color-error)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: !match || submitting ? 'var(--color-text-faint)' : '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: !match || submitting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'opacity var(--transition-fast), background var(--transition-fast)',
            }}
          >
            {submitting && <Loader2 size={16} strokeWidth={2} style={{ animation: 'km-spin 1s linear infinite' }} />}
            {submitting ? t('deleteTopic.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
