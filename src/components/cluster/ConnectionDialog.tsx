/**
 * ConnectionDialog — 新建/编辑集群连接对话框（640×520px）
 * Design: ui-ux-pro-max · Palette: Code Dark + Run Green
 */
import React, { useState, useEffect, useRef } from 'react';
import { useT } from '../../i18n';

type SecurityProtocol = 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SSL' | 'SASL_SSL';
type SaslMechanism = 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512' | 'GSSAPI' | 'AWS_MSK_IAM';
type Tab = 'basic' | 'security' | 'advanced';

interface TestResult {
  success: boolean;
  brokerCount?: number;
  topicCount?: number;
  kafkaVersion?: string;
  errorMessage?: string;
  latencyMs?: number;
}

export interface ConnectionFormData {
  name: string;
  bootstrapServers: string;
  kafkaVersion: string;
  zookeeperHost: string;
  zookeeperPort: number;
  zkChrootPath: string;
  securityProtocol: SecurityProtocol;
  saslMechanism: SaslMechanism | '';
  jaasConfig: string;
  awsRegion: string;
  sslCaCertPath: string;
  sslClientCertPath: string;
  sslClientKeyPath: string;
  sslClientKeyPassword: string;
  sslVerifyHostname: boolean;
  schemaRegistryUrl: string;
  schemaRegistryUsername: string;
  schemaRegistryPassword: string;
  connectWorkerUrls: string;
  notes: string;
}

const KAFKA_VERSIONS = [
  '3.7',
  '3.6',
  '3.5',
  '3.4',
  '3.3',
  '3.2',
  '3.1',
  '3.0',
  '2.8',
  '2.7',
  '2.6',
  'custom',
];
const CLOUD_TEMPLATES: Record<string, Partial<ConnectionFormData>> = {
  'Azure Event Hubs': {
    securityProtocol: 'SASL_SSL',
    saslMechanism: 'PLAIN',
    jaasConfig:
      'org.apache.kafka.common.security.plain.PlainLoginModule required\n  username="$ConnectionString"\n  password="<YOUR_CONNECTION_STRING>";',
  },
  'Amazon MSK (SCRAM)': {
    securityProtocol: 'SASL_SSL',
    saslMechanism: 'SCRAM-SHA-512',
    jaasConfig:
      'org.apache.kafka.common.security.scram.ScramLoginModule required\n  username="<USERNAME>"\n  password="<PASSWORD>";',
  },
  'Amazon MSK (IAM)': {
    securityProtocol: 'SASL_SSL',
    saslMechanism: 'AWS_MSK_IAM',
    jaasConfig: 'software.amazon.msk.auth.iam.IAMLoginModule required;',
  },
  'Confluent Cloud': {
    securityProtocol: 'SASL_SSL',
    saslMechanism: 'PLAIN',
    jaasConfig:
      'org.apache.kafka.common.security.plain.PlainLoginModule required\n  username="<API_KEY>"\n  password="<API_SECRET>";',
  },
};

const DEFAULT_FORM: ConnectionFormData = {
  name: '',
  bootstrapServers: '',
  kafkaVersion: '3.7',
  zookeeperHost: '',
  zookeeperPort: 2181,
  zkChrootPath: '/',
  securityProtocol: 'PLAINTEXT',
  saslMechanism: '',
  jaasConfig: '',
  awsRegion: '',
  sslCaCertPath: '',
  sslClientCertPath: '',
  sslClientKeyPath: '',
  sslClientKeyPassword: '',
  sslVerifyHostname: true,
  schemaRegistryUrl: '',
  schemaRegistryUsername: '',
  schemaRegistryPassword: '',
  connectWorkerUrls: '',
  notes: '',
};

const inputStyle: React.CSSProperties = {
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  marginBottom: 4,
  fontFamily: 'var(--font-body)',
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: 'var(--color-error)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  fontFamily?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ value, onChange, placeholder, type = 'text', fontFamily, ...rest }, ref) => {
    const mergedStyle: React.CSSProperties = fontFamily
      ? { ...inputStyle, fontFamily }
      : inputStyle;
    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={mergedStyle}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        {...rest}
      />
    );
  },
);

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, cursor: 'pointer' }}
      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
    >
      {children}
    </select>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 36 }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
      />
      <button
        type="button"
        aria-label={show ? t('conn.hidePassword') : t('conn.showPassword')}
        onClick={() => setShow((v) => !v)}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-faint)',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {show ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function FilePickerInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const t = useT();
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('conn.filePickerPlaceholder')}
        style={{ ...inputStyle, flex: 1 }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
      />
      <button
        type="button"
        aria-label={t('conn.browseFor', { label })}
        style={{
          padding: '7px 10px',
          background: 'var(--color-surface-2)',
          color: 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          fontSize: 12,
          whiteSpace: 'nowrap',
          transition: 'background var(--transition-fast)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-border)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
      >
        {t('common.browse')}
      </button>
    </div>
  );
}

interface Props {
  open: boolean;
  initialData?: Partial<ConnectionFormData>;
  onClose: () => void;
  onSave: (data: ConnectionFormData) => Promise<void>;
  onTestConnection: (data: ConnectionFormData) => Promise<TestResult>;
}

export function ConnectionDialog({ open, initialData, onClose, onSave, onTestConnection }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('basic');
  const [form, setForm] = useState<ConnectionFormData>({ ...DEFAULT_FORM, ...initialData });
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ConnectionFormData, string>>>({});
  const [showTemplateConfirm, setShowTemplateConfirm] = useState<string | null>(null);

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, ...initialData });
      setTab('basic');
      setTestResult(null);
      setErrors({});
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [open, initialData]);

  const set = <K extends keyof ConnectionFormData>(key: K, value: ConnectionFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const hasSasl = form.securityProtocol.includes('SASL');
  const hasSsl = form.securityProtocol.includes('SSL');

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = t('conn.nameRequired');
    if (!form.bootstrapServers.trim()) e.bootstrapServers = t('conn.bootstrapRequired');
    else if (!/^[\w.-]+:\d+(,[\w.-]+:\d+)*$/.test(form.bootstrapServers.trim()))
      e.bootstrapServers = t('conn.bootstrapFormatError');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleTest = async () => {
    if (!validate()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTestConnection(form);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (name: string) => {
    const tpl = CLOUD_TEMPLATES[name];
    setForm((f) => ({ ...f, ...tpl }));
    setTab('security');
    setShowTemplateConfirm(null);
  };

  if (!open) return null;

  const TAB_LABELS: Record<Tab, string> = {
    basic: t('conn.tab.basic'),
    security: t('conn.tab.security'),
    advanced: t('conn.tab.advanced'),
  };
  const dialogAriaLabel = initialData ? t('conn.editConnection') : t('conn.newConnection');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dialogAriaLabel}
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
      <div
        style={{
          width: 640,
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            {initialData ? t('conn.editConnection') : t('conn.newConnection')}
          </h2>
          <button
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
              alignItems: 'center',
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-faint)')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: '0 20px',
          }}
        >
          {(['basic', 'security', 'advanced'] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              role="tab"
              aria-selected={tab === tabKey}
              onClick={() => setTab(tabKey)}
              style={{
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                borderBottom:
                  tab === tabKey ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: tab === tabKey ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: tab === tabKey ? 600 : 400,
                cursor: 'pointer',
                transition: 'color var(--transition-fast)',
                marginBottom: -1,
              }}
              onMouseEnter={(e) => {
                if (tab !== tabKey) e.currentTarget.style.color = 'var(--color-text)';
              }}
              onMouseLeave={(e) => {
                if (tab !== tabKey) e.currentTarget.style.color = 'var(--color-text-muted)';
              }}
            >
              {TAB_LABELS[tabKey]}
            </button>
          ))}
        </div>

        {/* Body */}
        <div role="tabpanel" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* ── Tab: Basic ── */}
          {tab === 'basic' && (
            <div>
              <Field label={t('conn.nameLabel')} required>
                <Input
                  ref={firstInputRef}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder={t('conn.namePlaceholder')}
                  maxLength={64}
                />
                {errors.name && (
                  <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 3 }}>
                    {errors.name}
                  </p>
                )}
              </Field>

              <Field label={t('conn.bootstrapServers')} required>
                <Input
                  value={form.bootstrapServers}
                  onChange={(e) => set('bootstrapServers', e.target.value)}
                  placeholder="host1:9092,host2:9092"
                  fontFamily="var(--font-heading)"
                />
                {errors.bootstrapServers && (
                  <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 3 }}>
                    {errors.bootstrapServers}
                  </p>
                )}
              </Field>

              <Field label={t('conn.kafkaVersion')} required>
                <Select value={form.kafkaVersion} onChange={(v) => set('kafkaVersion', v)}>
                  {KAFKA_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <Field label={t('conn.zookeeperAddr')}>
                  <Input
                    value={form.zookeeperHost}
                    onChange={(e) => set('zookeeperHost', e.target.value)}
                    placeholder={t('conn.zookeeperPlaceholder')}
                  />
                </Field>
                <Field label={t('conn.port')}>
                  <Input
                    type="number"
                    value={form.zookeeperPort}
                    onChange={(e) => set('zookeeperPort', Number(e.target.value))}
                  />
                </Field>
              </div>

              <Field label={t('conn.chrootPath')}>
                <Input
                  value={form.zkChrootPath}
                  onChange={(e) => set('zkChrootPath', e.target.value)}
                  placeholder="/"
                  fontFamily="var(--font-heading)"
                />
              </Field>
            </div>
          )}

          {/* ── Tab: Security ── */}
          {tab === 'security' && (
            <div>
              <Field label={t('conn.securityProtocol')} required>
                <Select
                  value={form.securityProtocol}
                  onChange={(v) => set('securityProtocol', v as SecurityProtocol)}
                >
                  {(['PLAINTEXT', 'SASL_PLAINTEXT', 'SSL', 'SASL_SSL'] as SecurityProtocol[]).map(
                    (p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ),
                  )}
                </Select>
              </Field>

              {hasSasl && (
                <>
                  <Field label={t('conn.saslMechanism')} required>
                    <Select
                      value={form.saslMechanism}
                      onChange={(v) => set('saslMechanism', v as SaslMechanism)}
                    >
                      <option value="">{t('conn.saslPlaceholder')}</option>
                      {(
                        [
                          'PLAIN',
                          'SCRAM-SHA-256',
                          'SCRAM-SHA-512',
                          'GSSAPI',
                          'AWS_MSK_IAM',
                        ] as SaslMechanism[]
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={t('conn.jaasConfig')} required>
                    <textarea
                      value={form.jaasConfig}
                      onChange={(e) => set('jaasConfig', e.target.value)}
                      rows={4}
                      placeholder="org.apache.kafka.common.security.plain.PlainLoginModule required..."
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    />
                  </Field>

                  {form.saslMechanism === 'AWS_MSK_IAM' && (
                    <Field label={t('conn.awsRegion')}>
                      <Input
                        value={form.awsRegion}
                        onChange={(e) => set('awsRegion', e.target.value)}
                        placeholder="us-east-1"
                      />
                    </Field>
                  )}
                </>
              )}

              {hasSsl && (
                <>
                  <Field label={t('conn.caCertPath')} required>
                    <FilePickerInput
                      value={form.sslCaCertPath}
                      onChange={(v) => set('sslCaCertPath', v)}
                      label={t('conn.caCert')}
                    />
                  </Field>
                  <Field label={t('conn.clientCertPath')}>
                    <FilePickerInput
                      value={form.sslClientCertPath}
                      onChange={(v) => set('sslClientCertPath', v)}
                      label={t('conn.clientCert')}
                    />
                  </Field>
                  <Field label={t('conn.clientKeyPath')}>
                    <FilePickerInput
                      value={form.sslClientKeyPath}
                      onChange={(v) => set('sslClientKeyPath', v)}
                      label={t('conn.clientKey')}
                    />
                  </Field>
                  <Field label={t('conn.keyPassword')}>
                    <PasswordInput
                      value={form.sslClientKeyPassword}
                      onChange={(v) => set('sslClientKeyPassword', v)}
                    />
                  </Field>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <input
                      type="checkbox"
                      id="sslVerify"
                      checked={form.sslVerifyHostname}
                      onChange={(e) => set('sslVerifyHostname', e.target.checked)}
                      style={{
                        accentColor: 'var(--color-primary)',
                        width: 14,
                        height: 14,
                        cursor: 'pointer',
                      }}
                    />
                    <label
                      htmlFor="sslVerify"
                      style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}
                    >
                      {t('conn.sslVerifyHostname')}
                    </label>
                  </div>
                </>
              )}

              {form.securityProtocol === 'PLAINTEXT' && (
                <p
                  style={{
                    color: 'var(--color-text-faint)',
                    fontSize: 12,
                    textAlign: 'center',
                    padding: '20px 0',
                  }}
                >
                  {t('conn.plaintextNote')}
                </p>
              )}
            </div>
          )}

          {/* ── Tab: Advanced ── */}
          {tab === 'advanced' && (
            <div>
              <Field label={t('conn.schemaRegistryUrl')}>
                <Input
                  value={form.schemaRegistryUrl}
                  onChange={(e) => set('schemaRegistryUrl', e.target.value)}
                  placeholder="http://localhost:8081"
                  fontFamily="var(--font-heading)"
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label={t('conn.schemaRegistryUsername')}>
                  <Input
                    value={form.schemaRegistryUsername}
                    onChange={(e) => set('schemaRegistryUsername', e.target.value)}
                  />
                </Field>
                <Field label={t('conn.schemaRegistryPassword')}>
                  <PasswordInput
                    value={form.schemaRegistryPassword}
                    onChange={(v) => set('schemaRegistryPassword', v)}
                  />
                </Field>
              </div>
              <Field label={t('conn.connectWorkerUrls')}>
                <textarea
                  value={form.connectWorkerUrls}
                  onChange={(e) => set('connectWorkerUrls', e.target.value)}
                  rows={3}
                  placeholder="http://localhost:8083&#10;http://localhost:8084"
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontFamily: 'var(--font-heading)',
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                />
              </Field>
              <Field label={t('conn.notes')}>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={t('conn.notesPlaceholder')}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                />
                <p
                  style={{
                    textAlign: 'right',
                    fontSize: 11,
                    color: 'var(--color-text-faint)',
                    marginTop: 3,
                  }}
                >
                  {form.notes.length}/500
                </p>
              </Field>
            </div>
          )}
        </div>

        {/* Test Connection Result */}
        {testResult && (
          <div
            style={{
              margin: '0 20px 0',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: testResult.success ? 'var(--color-primary-muted)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${testResult.success ? 'var(--color-primary)' : 'rgba(239,68,68,0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontFamily: 'var(--font-heading)',
            }}
          >
            {testResult.success ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22C55E"
                strokeWidth="2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {testResult.success ? (
              <span style={{ color: 'var(--color-success)' }}>
                {t('conn.connectionSuccess')} ·{' '}
                {t('conn.brokerCount', { count: testResult.brokerCount ?? 0 })} ·{' '}
                {t('conn.topicCount', { count: testResult.topicCount ?? 0 })} ·{' '}
                {testResult.kafkaVersion} · {testResult.latencyMs}ms
              </span>
            ) : (
              <span style={{ color: 'var(--color-error)' }}>{testResult.errorMessage}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Template dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={{
                padding: '7px 12px',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'background var(--transition-fast)',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-border)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
              onClick={() => setShowTemplateConfirm(showTemplateConfirm ? null : 'menu')}
            >
              {t('conn.fromTemplate')}
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showTemplateConfirm === 'menu' && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: 4,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  minWidth: 200,
                  zIndex: 100,
                }}
              >
                {Object.keys(CLOUD_TEMPLATES).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setShowTemplateConfirm(name)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'var(--color-surface-2)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {showTemplateConfirm && showTemplateConfirm !== 'menu' && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: 4,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  padding: 14,
                  width: 280,
                  zIndex: 100,
                }}
              >
                <p style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 12 }}>
                  {t('conn.templateConfirm', { name: showTemplateConfirm })}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowTemplateConfirm(null)}
                    style={{
                      padding: '5px 12px',
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-muted)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(showTemplateConfirm)}
                    style={{
                      padding: '5px 12px',
                      background: 'var(--color-primary)',
                      color: 'var(--color-primary-text)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {t('conn.confirmOverride')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Test */}
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            style={{
              padding: '7px 14px',
              background: 'var(--color-surface-2)',
              color: testing ? 'var(--color-text-faint)' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: testing ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background var(--transition-fast)',
              whiteSpace: 'nowrap',
            }}
          >
            {testing && (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {t('conn.testConnection')}
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              background: 'none',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              transition: 'background var(--transition-fast)',
            }}
          >
            {t('common.cancel')}
          </button>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || testing}
            style={{
              padding: '7px 18px',
              background: saving ? 'var(--color-primary-muted)' : 'var(--color-primary)',
              color: saving ? 'var(--color-primary)' : 'var(--color-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              transition: 'background var(--transition-fast)',
            }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
