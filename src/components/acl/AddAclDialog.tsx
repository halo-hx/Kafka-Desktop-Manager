/**
 * 添加 Kafka ACL 条目
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, X } from 'lucide-react';
import type { AclEntry } from '../../types';
import { useT } from '../../i18n';

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

const OPS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ALTER', 'DESCRIBE', 'ALL'] as const;

export interface AddAclDialogProps {
  open: boolean;
  clusterId: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddAclDialog({ open, clusterId, onClose, onCreated }: AddAclDialogProps) {
  const t = useT();
  const [principal, setPrincipal] = useState('');
  const [resourceType, setResourceType] = useState<AclEntry['resourceType']>('TOPIC');
  const [resourceName, setResourceName] = useState('');
  const [patternType, setPatternType] = useState<AclEntry['patternType']>('LITERAL');
  const [ops, setOps] = useState<Set<string>>(() => new Set());
  const [permissionType, setPermissionType] = useState<AclEntry['permissionType']>('ALLOW');
  const [host, setHost] = useState('*');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPrincipal('');
      setResourceType('TOPIC');
      setResourceName('');
      setPatternType('LITERAL');
      setOps(new Set());
      setPermissionType('ALLOW');
      setHost('*');
      setErrors({});
      setTimeout(() => ref.current?.focus(), 40);
    }
  }, [open]);

  if (!open) return null;

  const toggleOp = (o: string) => {
    setOps((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  };

  const submit = async () => {
    setErrors({});
    const p = principal.trim();
    const rn = resourceName.trim();
    const h = host.trim() || '*';
    const sel = Array.from(ops);
    const e: Record<string, string> = {};
    if (!p) e.principal = t('addAcl.principalRequired');
    if (!rn) e.resourceName = t('addAcl.errResourceNameRequired');
    if (sel.length === 0) e.ops = t('addAcl.errOpsRequired');

    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }

    setSubmitting(true);
    try {
      for (const op of sel) {
        await invoke('create_acl', {
          clusterId,
          acl: {
            principal: p,
            resource_type: resourceType,
            resource_name: rn,
            pattern_type: patternType,
            operation: op,
            permission_type: permissionType,
            host: h,
          },
        });
      }
      onCreated?.();
      onClose();
    } catch (err) {
      setErrors({
        submit:
          typeof err === 'string' ? err : err instanceof Error ? err.message : t('addAcl.errSubmitFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('addAcl.ariaDialog')}
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
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <style>{`@keyframes km-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 520,
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600 }}>{t('addAcl.title')}</h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => !submitting && onClose()}
            style={{
              background: 'none',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-faint)',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-5)', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('addAcl.principal')}
            </label>
            <input
              ref={ref}
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder={t('addAcl.principalExample')}
              style={{ ...inputStyle, fontFamily: 'var(--font-heading)', fontSize: 12 }}
            />
            <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 4 }}>{t('addAcl.principalFormatHint')}</p>
            {errors.principal && (
              <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.principal}</p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('addAcl.resourceType')}
            </label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as AclEntry['resourceType'])}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {(['TOPIC', 'GROUP', 'CLUSTER', 'TRANSACTIONAL_ID'] as const).map((resType) => (
                <option key={resType} value={resType}>
                  {resType}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('addAcl.resourceName')}
            </label>
            <input
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder={resourceType === 'CLUSTER' ? 'kafka-cluster' : t('addAcl.resourceNamePlaceholder')}
              style={{ ...inputStyle, fontFamily: 'var(--font-heading)', fontSize: 12 }}
            />
            {errors.resourceName && (
              <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{errors.resourceName}</p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('addAcl.patternType')}
            </label>
            <select
              value={patternType}
              onChange={(e) => setPatternType(e.target.value as AclEntry['patternType'])}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="LITERAL">{t('addAcl.literal')}</option>
              <option value="PREFIXED">{t('addAcl.prefixed')}</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {t('addAcl.operationsMulti')}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {OPS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggleOp(o)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${ops.has(o) ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: ops.has(o) ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                    color: ops.has(o) ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
            {errors.ops && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 6 }}>{errors.ops}</p>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('addAcl.permission')}
            </label>
            <select
              value={permissionType}
              onChange={(e) => setPermissionType(e.target.value as AclEntry['permissionType'])}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="ALLOW">{t('addAcl.allow')}</option>
              <option value="DENY">{t('addAcl.deny')}</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {t('addAcl.host')}
            </label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t('addAcl.hostPlaceholder')}
              style={{ ...inputStyle, fontFamily: 'var(--font-heading)', fontSize: 12 }}
            />
          </div>

          {errors.submit && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
              {errors.submit}
            </p>
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
            onClick={() => !submitting && onClose()}
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
            onClick={() => void submit()}
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
            }}
          >
            {submitting && <Loader2 size={16} style={{ animation: 'km-spin 0.9s linear infinite' }} />}
            {submitting ? t('addAcl.adding') : t('common.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
