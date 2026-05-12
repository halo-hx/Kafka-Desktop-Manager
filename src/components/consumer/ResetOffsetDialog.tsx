/**
 * Reset consumer group offsets (with live preview)
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';

export type ResetStrategy =
  | 'earliest'
  | 'latest'
  | 'datetime'
  | 'specific'
  | 'shift';

export interface ResetOffsetDialogProps {
  open: boolean;
  clusterId: string;
  groupId: string;
  topics: string[];
  onClose: () => void;
  onConfirm?: (payload: {
    clusterId: string;
    groupId: string;
    topicPattern: string;
    strategy: ResetStrategy;
    datetime?: string;
    shift?: number;
  }) => Promise<void>;
}

interface PreviewRow {
  topic: string;
  partition: number;
  current_offset: number;
  target_offset: number;
  end_offset: number;
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

function toBackendParams(strategy: ResetStrategy, datetime: string, partitionOffsets: string, shiftN: string) {
  const backendStrategy =
    strategy === 'datetime' ? 'timestamp' :
    strategy === 'specific' ? 'offset' :
    strategy === 'shift' ? 'offset' :
    strategy;
  let value: number | null = null;
  if (strategy === 'datetime' && datetime) {
    value = new Date(datetime).getTime();
  } else if (strategy === 'specific') {
    const first = partitionOffsets.split(',')[0]?.split(':')[1];
    value = first != null ? Number(first) : null;
  } else if (strategy === 'shift') {
    value = Number(shiftN) || 0;
  }
  return { backendStrategy, value };
}

const STRATEGY_OPTIONS: { id: ResetStrategy; labelKey: TranslationKey }[] = [
  { id: 'earliest', labelKey: 'resetOffset.toEarliest' },
  { id: 'latest', labelKey: 'resetOffset.toLatest' },
  { id: 'datetime', labelKey: 'resetOffset.toTimestamp' },
  { id: 'specific', labelKey: 'resetOffset.toSpecific' },
  { id: 'shift', labelKey: 'resetOffset.shiftBy' },
];

const PREVIEW_HEADERS: { key: TranslationKey; align: 'left' | 'right' }[] = [
  { key: 'resetOffset.topic', align: 'left' },
  { key: 'resetOffset.partition', align: 'right' },
  { key: 'resetOffset.currentOffset', align: 'right' },
  { key: 'resetOffset.targetOffset', align: 'right' },
  { key: 'resetOffset.endOffset', align: 'right' },
];

export function ResetOffsetDialog({
  open,
  clusterId,
  groupId,
  topics,
  onClose,
  onConfirm,
}: ResetOffsetDialogProps) {
  const t = useT();
  const [targetTopic, setTargetTopic] = useState('');
  const [strategy, setStrategy] = useState<ResetStrategy>('latest');
  const [datetime, setDatetime] = useState('');
  const [partitionOffsets, setPartitionOffsets] = useState('0:100,1:101');
  const [shiftN, setShiftN] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetTopic(topics[0] ?? '');
      setStrategy('latest');
      setDatetime('');
      setPartitionOffsets('0:100,1:101');
      setShiftN('100');
      setSubmitErr(null);
      setPreviewRows([]);
      setPreviewLoaded(false);
    }
  }, [open, topics]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-load preview when inputs change
  useEffect(() => {
    setPreviewLoaded(false);
    setPreviewRows([]);

    if (!open || !targetTopic) return;
    if (strategy === 'datetime' && !datetime) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { backendStrategy, value } = toBackendParams(strategy, datetime, partitionOffsets, shiftN);
      setPreviewing(true);
      setSubmitErr(null);
      invoke<PreviewRow[]>('preview_reset_offsets', {
        clusterId,
        groupId,
        topic: targetTopic,
        strategy: backendStrategy,
        value,
      })
        .then((rows) => {
          setPreviewRows(rows);
          setPreviewLoaded(true);
        })
        .catch((e) => {
          setSubmitErr(typeof e === 'string' ? e : e instanceof Error ? e.message : t('resetOffset.previewFailed'));
        })
        .finally(() => {
          setPreviewing(false);
        });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [open, targetTopic, strategy, datetime, partitionOffsets, shiftN, clusterId, groupId, t]);

  if (!open) return null;

  const topicOptions = topics.length > 0
    ? topics.map((topic) => ({ label: topic, value: topic }))
    : [{ label: t('resetOffset.noTopicsAvailable'), value: '' }];

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      if (onConfirm) {
        await onConfirm({
          clusterId,
          groupId,
          topicPattern: targetTopic || '*',
          strategy,
          datetime: strategy === 'datetime' ? datetime : undefined,
          shift: strategy === 'shift' ? Number(shiftN) || 0 : undefined,
        });
      } else {
        if (!targetTopic) {
          throw new Error(t('resetOffset.selectTopicError'));
        }
        const { backendStrategy, value } = toBackendParams(strategy, datetime, partitionOffsets, shiftN);
        await invoke('reset_consumer_group_offsets', {
          clusterId,
          groupId,
          topic: targetTopic,
          strategy: backendStrategy,
          value,
        });
      }
      onClose();
    } catch (e) {
      console.warn('[ResetOffsetDialog]', e);
      setSubmitErr(typeof e === 'string' ? e : e instanceof Error ? e.message : t('resetOffset.resetFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('resetOffset.title')}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 620,
          maxWidth: '94vw',
          height: 640,
          maxHeight: '92vh',
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
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              {t('resetOffset.title')}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {t('resetOffset.groupLabel')}:{' '}
              <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}>{groupId}</span>
            </p>
          </div>
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
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-faint)'; }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-5)', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 8 }}>
              {t('resetOffset.topic')}
            </label>
            <select
              value={targetTopic}
              onChange={(e) => setTargetTopic(e.target.value)}
              aria-label={t('resetOffset.selectTopic')}
              style={{ ...inputStyle, cursor: 'pointer', transition: 'border-color var(--transition-fast)' }}
            >
              {topicOptions.map((o) => (
                <option key={o.value || o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
            {t('resetOffset.strategy')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STRATEGY_OPTIONS.map(({ id, labelKey }) => (
              <label
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="reset-strategy"
                  checked={strategy === id}
                  onChange={() => setStrategy(id)}
                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                {t(labelKey)}
              </label>
            ))}
          </div>

          {strategy === 'datetime' && (
            <div style={{ marginTop: 14, marginLeft: 28 }}>
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                aria-label={t('resetOffset.targetTimestamp')}
                style={inputStyle}
              />
            </div>
          )}

          {strategy === 'specific' && (
            <div style={{ marginTop: 14, marginLeft: 28 }}>
              <textarea
                value={partitionOffsets}
                onChange={(e) => setPartitionOffsets(e.target.value)}
                rows={3}
                placeholder={t('resetOffset.specificPlaceholder')}
                aria-label={t('resetOffset.toSpecific')}
                style={{
                  ...inputStyle,
                  fontFamily: 'var(--font-heading)',
                  fontSize: 12,
                  resize: 'vertical',
                  width: '100%',
                }}
              />
            </div>
          )}

          {strategy === 'shift' && (
            <div style={{ marginTop: 14, marginLeft: 28 }}>
              <input
                type="number"
                value={shiftN}
                onChange={(e) => setShiftN(e.target.value)}
                placeholder={t('resetOffset.shiftPlaceholder')}
                aria-label={t('resetOffset.shiftBy')}
                style={{ ...inputStyle, fontFamily: 'var(--font-heading)' }}
              />
            </div>
          )}

          <div
            style={{
              marginTop: 'var(--space-5)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: 'var(--space-3)',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-warning)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={18} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
            <span>{t('resetOffset.warning')}</span>
          </div>

          {/* Preview table - header always visible, data auto-loaded */}
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 'var(--space-4)', marginBottom: 8 }}>
            {t('resetOffset.preview')}
          </p>
          <div
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} aria-label={t('resetOffset.preview')}>
              <thead>
                <tr style={{ background: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {PREVIEW_HEADERS.map(({ key, align }) => (
                    <th
                      key={key}
                      style={{
                        padding: '6px 10px',
                        textAlign: align,
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--color-text-faint)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewing ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 12 }}>
                        <Loader2 size={14} strokeWidth={2} style={{ animation: 'km-spin 1s linear infinite' }} />
                        {t('resetOffset.previewLoading')}
                      </span>
                    </td>
                  </tr>
                ) : previewLoaded && previewRows.length > 0 ? (
                  previewRows.map((row, i) => (
                    <tr
                      key={`${row.topic}-${row.partition}`}
                      style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                    >
                      <td style={{ padding: '7px 10px', fontFamily: 'var(--font-heading)' }}>{row.topic}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-heading)', color: 'var(--color-text-muted)' }}>
                        {row.partition}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-heading)', color: 'var(--color-text-muted)' }}>
                        {row.current_offset >= 0 ? row.current_offset.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {row.target_offset.toLocaleString()}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-heading)', color: 'var(--color-text-faint)' }}>
                        {row.end_offset.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : previewLoaded ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-faint)', fontSize: 12 }}>
                      {t('resetOffset.noPartitionData')}
                    </td>
                  </tr>
                ) : !targetTopic ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-faint)', fontSize: 12 }}>
                      {t('resetOffset.selectTopicFirst')}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-faint)', fontSize: 12 }}>
                      {t('resetOffset.previewAutoHint')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {submitErr && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 12 }}>{submitErr}</p>
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
            aria-label={t('common.cancel')}
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
            onClick={() => void handleConfirm()}
            disabled={submitting || !previewLoaded}
            title={!previewLoaded ? t('resetOffset.previewRequiredTitle') : ''}
            aria-label={t('resetOffset.confirmReset')}
            style={{
              padding: '7px 18px',
              background: previewLoaded ? 'var(--color-warning)' : 'var(--color-surface-2)',
              opacity: submitting ? 0.7 : 1,
              border: previewLoaded ? 'none' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: previewLoaded ? '#0f172a' : 'var(--color-text-faint)',
              fontWeight: 700,
              fontSize: 13,
              cursor: submitting || !previewLoaded ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {submitting && <Loader2 size={16} strokeWidth={2} style={{ animation: 'km-spin 1s linear infinite' }} />}
            {t('resetOffset.confirmReset')}
          </button>
        </div>
      </div>
    </div>
  );
}
