/**
 * 注册 Schema 对话框
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { FileUp, Loader2, Wand2, X } from 'lucide-react';
import { useT } from '../../i18n';

export interface RegisterSchemaDialogProps {
  open: boolean;
  clusterId: string;
  onClose: () => void;
  onRegistered?: () => void;
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

const btnSecondary: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  cursor: 'pointer',
};

const btnPrimary: CSSProperties = {
  ...btnSecondary,
  background: 'var(--color-primary-muted)',
  borderColor: 'var(--color-primary)',
  color: 'var(--color-primary)',
  fontWeight: 600,
};

export function RegisterSchemaDialog({
  open: isOpen,
  clusterId,
  onClose,
  onRegistered,
}: RegisterSchemaDialogProps) {
  const t = useT();
  const [subject, setSubject] = useState('');
  const [schemaType, setSchemaType] = useState<'AVRO' | 'PROTOBUF' | 'JSON'>('AVRO');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setSchemaType('AVRO');
      setContent('');
      setErrors({});
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFormat = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      setContent(formatted);
      setErrors((e) => {
        const { format: _f, ...rest } = e;
        return rest;
      });
    } catch {
      setErrors((e) => ({ ...e, format: t('registerSchema.formatError') }));
    }
  };

  const handleValidate = () => {
    try {
      JSON.parse(content);
      setErrors((e) => {
        const { validate: _v, ...rest } = e;
        return rest;
      });
    } catch (err) {
      setErrors((e) => ({
        ...e,
        validate: err instanceof Error ? err.message : t('registerSchema.invalidJson'),
      }));
    }
  };

  const handleLoadFile = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [
          {
            name: t('registerSchema.fileFilterSchema'),
            extensions: ['json', 'avsc', 'proto', 'txt'],
          },
          { name: t('registerSchema.fileFilterAll'), extensions: ['*'] },
        ],
      });
      if (path === null || Array.isArray(path)) return;
      const text = await readTextFile(path);
      setContent(text);
    } catch (err) {
      console.warn('[RegisterSchemaDialog] load file', err);
      setErrors((e) => ({
        ...e,
        file:
          typeof err === 'string'
            ? err
            : err instanceof Error
              ? err.message
              : t('registerSchema.fileReadFailed'),
      }));
    }
  };

  const handleSubmit = async () => {
    const sub = subject.trim();
    const sch = content.trim();
    const nextErr: Record<string, string> = {};
    if (!sub) nextErr.subject = t('registerSchema.subjectRequired');
    if (!sch) nextErr.content = t('registerSchema.schemaRequired');
    setErrors(nextErr);
    if (Object.keys(nextErr).length > 0) return;

    setSubmitting(true);
    try {
      await invoke('register_schema', {
        clusterId,
        subject: sub,
        schemaType,
        schema: sch,
      });
      onRegistered?.();
      onClose();
    } catch (err) {
      console.warn('[RegisterSchemaDialog]', err);
      setErrors({
        submit:
          typeof err === 'string'
            ? err
            : err instanceof Error
              ? err.message
              : t('registerSchema.registerFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('registerSchema.title')}
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
      <div
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
          fontFamily: 'var(--font-body)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            {t('registerSchema.title')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>{t('registerSchema.subject')}</span>
            <input
              ref={firstRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              placeholder={t('registerSchema.examplePlaceholder')}
            />
            {errors.subject ? (
              <span style={{ color: 'var(--color-error)', fontSize: 11 }}>{errors.subject}</span>
            ) : null}
          </label>

          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>{t('registerSchema.type')}</span>
            <select
              value={schemaType}
              onChange={(e) => setSchemaType(e.target.value as typeof schemaType)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="AVRO">AVRO</option>
              <option value="PROTOBUF">PROTOBUF</option>
              <option value="JSON">JSON</option>
            </select>
          </label>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>{t('registerSchema.schema')}</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              style={{
                ...inputStyle,
                minHeight: 220,
                resize: 'vertical',
                fontFamily: 'var(--font-heading)',
                fontSize: 12,
                lineHeight: 1.45,
              }}
              placeholder={t('registerSchema.schemaPlaceholder')}
            />
            {(errors.content ||
              errors.format ||
              errors.validate ||
              errors.file ||
              errors.submit) && (
              <span style={{ color: 'var(--color-error)', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                {[errors.content, errors.format, errors.validate, errors.file, errors.submit]
                  .filter(Boolean)
                  .join('\n')}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <button type="button" style={btnSecondary} onClick={() => void handleLoadFile()}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileUp size={14} /> {t('registerSchema.loadFromFile')}
              </span>
            </button>
            <button type="button" style={btnSecondary} onClick={handleFormat}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Wand2 size={14} /> {t('registerSchema.formatJson')}
              </span>
            </button>
            <button type="button" style={btnSecondary} onClick={handleValidate}>
              {t('registerSchema.validateSyntax')}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            <button type="button" style={btnSecondary} onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              style={btnPrimary}
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={16} className="km-spin-reg" /> {t('registerSchema.registering')}
                </span>
              ) : (
                t('common.register')
              )}
            </button>
          </div>
        </div>
        <style>{`@keyframes km-spin-reg { to { transform: rotate(360deg); } }
          .km-spin-reg { animation: km-spin-reg 0.9s linear infinite; }`}</style>
      </div>
    </div>
  );
}
