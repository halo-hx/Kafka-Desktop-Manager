/**
 * Schema 详情：内容、版本历史、兼容性
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Code, FileText, GitCompare, ListChecks, Loader2 } from 'lucide-react';
import type { CompatibilityResult, SchemaDetail } from '../../types';
import { useT } from '../../i18n';
import { HighlightedJson, formatSchemaForDisplay } from './schemaJsonHighlight';

const COMPAT_OPTIONS = [
  'NONE',
  'FULL',
  'FULL_TRANSITIVE',
  'FORWARD',
  'FORWARD_TRANSITIVE',
  'BACKWARD',
  'BACKWARD_TRANSITIVE',
] as const;

function TypeBadge({ schemaType }: { schemaType: string }) {
  const t =
    schemaType?.toUpperCase() === 'JSON'
      ? 'JSON'
      : schemaType?.toUpperCase() === 'PROTOBUF'
        ? 'PROTOBUF'
        : 'AVRO';
  const map: Record<string, { fg: string; bg: string; border: string }> = {
    AVRO: {
      fg: 'var(--color-info)',
      bg: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.4)',
    },
    PROTOBUF: {
      fg: '#C084FC',
      bg: 'rgba(168, 85, 247, 0.14)',
      border: 'rgba(168, 85, 247, 0.45)',
    },
    JSON: {
      fg: 'var(--color-success)',
      bg: 'rgba(34, 197, 94, 0.14)',
      border: 'rgba(34, 197, 94, 0.4)',
    },
  };
  const s = map[t] ?? map.AVRO;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--font-heading)',
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
      }}
    >
      {t}
    </span>
  );
}

type MainTab = 'schema' | 'history' | 'compat';

function compatLevelChoices(current: string, draft: string): string[] {
  const s = new Set<string>(COMPAT_OPTIONS as unknown as string[]);
  if (current) s.add(current);
  if (draft) s.add(draft);
  return Array.from(s);
}

export function SchemaDetailPanel({ clusterId, subject }: { clusterId: string; subject: string }) {
  const t = useT();
  const [mainTab, setMainTab] = useState<MainTab>('schema');
  const [versions, setVersions] = useState<number[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [detail, setDetail] = useState<SchemaDetail | null>(null);
  const [loadingVers, setLoadingVers] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [versionErr, setVersionErr] = useState<string | null>(null);

  const [historyDetail, setHistoryDetail] = useState<SchemaDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [diffOpen, setDiffOpen] = useState(false);
  const [compareRight, setCompareRight] = useState<number | null>(null);
  const [schemaLeft, setSchemaLeft] = useState('');
  const [schemaRight, setSchemaRight] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);

  const [compatLevel, setCompatLevel] = useState('');
  const [compatDraft, setCompatDraft] = useState('');
  const [compatSaving, setCompatSaving] = useState(false);

  const [checkText, setCheckText] = useState('');
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<CompatibilityResult | null>(null);

  const loadVersions = useCallback(async () => {
    setLoadingVers(true);
    setVersionErr(null);
    try {
      const nums = await invoke<number[]>('list_schema_versions', {
        clusterId,
        subject,
      });
      setVersions(nums);
      if (nums.length > 0) {
        setSelectedVersion((v) => (v !== null && nums.includes(v) ? v : nums[nums.length - 1]!));
      } else {
        setSelectedVersion(null);
      }
    } catch (e) {
      console.warn('[SchemaDetailPanel] versions', e);
      setVersionErr(
        typeof e === 'string'
          ? e
          : e instanceof Error
            ? e.message
            : t('schemaDetail.loadVersionsFailed'),
      );
      setVersions([]);
      setSelectedVersion(null);
    } finally {
      setLoadingVers(false);
    }
  }, [clusterId, subject, t]);

  const loadDetail = useCallback(
    async (ver: number) => {
      setLoadingDetail(true);
      try {
        const d = await invoke<SchemaDetail>('get_schema', {
          clusterId,
          subject,
          version: String(ver),
        });
        setDetail(d);
      } catch (e) {
        console.warn('[SchemaDetailPanel] detail', e);
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [clusterId, subject],
  );

  const loadHistoryDetail = useCallback(
    async (ver: number) => {
      setHistoryLoading(true);
      try {
        const d = await invoke<SchemaDetail>('get_schema', {
          clusterId,
          subject,
          version: String(ver),
        });
        setHistoryDetail(d);
      } catch {
        setHistoryDetail(null);
      } finally {
        setHistoryLoading(false);
      }
    },
    [clusterId, subject],
  );

  const loadCompat = useCallback(async () => {
    try {
      const level = await invoke<string>('get_subject_compatibility', {
        clusterId,
        subject,
      });
      setCompatLevel(level);
      setCompatDraft(level);
    } catch {
      setCompatLevel('UNKNOWN');
      setCompatDraft('UNKNOWN');
    }
  }, [clusterId, subject]);

  useEffect(() => {
    void loadVersions();
    void loadCompat();
  }, [loadVersions, loadCompat]);

  useEffect(() => {
    if (selectedVersion !== null) {
      void loadDetail(selectedVersion);
    } else {
      setDetail(null);
    }
  }, [selectedVersion, loadDetail]);

  useEffect(() => {
    if (mainTab === 'history' && selectedVersion !== null) {
      void loadHistoryDetail(selectedVersion);
    }
  }, [mainTab, selectedVersion, loadHistoryDetail]);

  useEffect(() => {
    if (!diffOpen || selectedVersion === null || compareRight === null) return;
    let cancelled = false;
    setDiffLoading(true);
    (async () => {
      try {
        const [a, b] = await Promise.all([
          invoke<SchemaDetail>('get_schema', {
            clusterId,
            subject,
            version: String(selectedVersion),
          }),
          invoke<SchemaDetail>('get_schema', {
            clusterId,
            subject,
            version: String(compareRight),
          }),
        ]);
        if (!cancelled) {
          setSchemaLeft(formatSchemaForDisplay(a.schema));
          setSchemaRight(formatSchemaForDisplay(b.schema));
        }
      } catch {
        if (!cancelled) {
          setSchemaLeft('');
          setSchemaRight('');
        }
      } finally {
        if (!cancelled) setDiffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diffOpen, selectedVersion, compareRight, clusterId, subject]);

  const defaultCompareRight = useMemo(() => {
    if (selectedVersion === null || versions.length < 2) return null;
    const others = versions.filter((v) => v !== selectedVersion).sort((a, b) => b - a);
    return others[0] ?? null;
  }, [versions, selectedVersion]);

  const openDiff = () => {
    if (selectedVersion === null || versions.length < 2) return;
    const right = compareRight ?? defaultCompareRight;
    if (right === null) return;
    setCompareRight(right);
    setDiffOpen(true);
  };

  const formattedSchema = useMemo(
    () => (detail ? formatSchemaForDisplay(detail.schema) : ''),
    [detail],
  );

  const compatSelectLevels = useMemo(
    () => compatLevelChoices(compatLevel, compatDraft),
    [compatLevel, compatDraft],
  );

  const tabBtn = (id: MainTab, label: string, Icon: typeof FileText) => (
    <button
      type="button"
      key={id}
      onClick={() => setMainTab(id)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 'var(--radius-md)',
        border: mainTab === id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
        background: mainTab === id ? 'var(--color-primary-muted)' : 'var(--color-surface)',
        color: mainTab === id ? 'var(--color-primary)' : 'var(--color-text-muted)',
        fontWeight: mainTab === id ? 600 : 500,
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
      }}
    >
      <Icon size={16} strokeWidth={2} />
      {label}
    </button>
  );

  const saveCompat = async () => {
    setCompatSaving(true);
    try {
      await invoke('set_compatibility', {
        clusterId,
        subject,
        level: compatDraft,
      });
      await loadCompat();
    } catch (e) {
      console.warn('[SchemaDetailPanel] set compat', e);
    } finally {
      setCompatSaving(false);
    }
  };

  const runCheck = async () => {
    setCheckBusy(true);
    setCheckResult(null);
    try {
      const r = await invoke<CompatibilityResult>('check_compatibility', {
        clusterId,
        subject,
        schema: checkText,
      });
      setCheckResult(r);
    } catch (e) {
      setCheckResult({
        isCompatible: false,
        messages: [
          typeof e === 'string'
            ? e
            : e instanceof Error
              ? e.message
              : t('schemaDetail.checkFailed'),
        ],
      });
    } finally {
      setCheckBusy(false);
    }
  };

  const preBox: CSSProperties = {
    margin: 0,
    padding: 'var(--space-4)',
    background: 'var(--color-bg)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    overflow: 'auto',
    maxHeight: 520,
    fontFamily: 'var(--font-heading)',
    fontSize: 12,
    lineHeight: 1.45,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <style>{`@keyframes km-spin-d { to { transform: rotate(360deg); } }`}</style>

      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text)',
          }}
        >
          {subject}
        </h1>
        <p style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
          {t('schemaDetail.pageSubtitle')}
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {tabBtn('schema', t('schemaDetail.schema'), FileText)}
        {tabBtn('history', t('schemaDetail.tabHistory'), Code)}
        {tabBtn('compat', t('schemaDetail.tabCompat'), ListChecks)}
      </div>

      {versionErr ? (
        <div
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: 'var(--color-error)',
            fontSize: 13,
          }}
        >
          {versionErr}
        </div>
      ) : null}

      {loadingVers && versions.length === 0 ? (
        <div
          style={{
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Loader2
            size={20}
            style={{ animation: 'km-spin-d 0.9s linear infinite' }}
            aria-label={t('common.loading')}
          />
          {t('common.loading')}
        </div>
      ) : null}

      {mainTab === 'schema' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{t('schemaDetail.version')}</span>
              <select
                value={selectedVersion ?? ''}
                onChange={(e) => setSelectedVersion(Number(e.target.value))}
                aria-label={t('schemaDetail.version')}
                style={{
                  padding: '7px 10px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                {versions.map((v) => (
                  <option key={v} value={v}>{`v${v}`}</option>
                ))}
              </select>
            </label>
            {detail ? (
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                {t('schemaDetail.schemaId')}:{' '}
                <strong style={{ color: 'var(--color-text)' }}>{detail.id}</strong>
              </span>
            ) : null}
            {detail ? <TypeBadge schemaType={detail.schemaType} /> : null}
            {loadingDetail ? (
              <Loader2
                size={18}
                style={{ animation: 'km-spin-d 0.85s linear infinite' }}
                aria-label={t('common.loading')}
              />
            ) : null}
          </div>

          {detail?.references?.length ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                borderLeft: '2px solid var(--color-primary)',
                paddingLeft: 'var(--space-3)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('schemaDetail.references')}</div>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {detail.references.map((ref) => (
                  <li key={`${ref.name}-${ref.subject}-${ref.version}`}>
                    <span style={{ fontFamily: 'var(--font-heading)' }}>
                      {ref.name} ← {ref.subject} @ v{ref.version}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 'var(--space-2)',
              color: 'var(--color-text-muted)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Code size={16} strokeWidth={2} aria-hidden />
            {t('schemaDetail.schemaContent')}
          </div>
          <pre style={preBox}>
            {formattedSchema.trim() ? (
              <HighlightedJson text={formattedSchema} />
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>
                {t('schemaDetail.noContent')}
              </span>
            )}
          </pre>
        </div>
      )}

      {mainTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => openDiff()}
              disabled={versions.length < 2}
              aria-label={t('schemaDetail.compareVersions')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: versions.length < 2 ? 'var(--color-surface-2)' : 'var(--color-surface)',
                color: 'var(--color-text)',
                cursor: versions.length < 2 ? 'not-allowed' : 'pointer',
                fontSize: 13,
              }}
            >
              <GitCompare size={16} />
              {t('schemaDetail.compareVersions')}
            </button>
            {diffOpen && (
              <>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                  {t('schemaDetail.compareTarget')}
                </span>
                <select
                  value={compareRight ?? ''}
                  onChange={(e) => setCompareRight(Number(e.target.value))}
                  aria-label={t('schemaDetail.compareTarget')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {versions
                    .filter((v) => v !== selectedVersion)
                    .map((v) => (
                      <option key={v} value={v}>{`v${v}`}</option>
                    ))}
                </select>
                <button
                  type="button"
                  style={{
                    fontSize: 12,
                    color: 'var(--color-primary)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={() => setDiffOpen(false)}
                  aria-label={t('schemaDetail.closeCompare')}
                >
                  {t('schemaDetail.closeCompare')}
                </button>
              </>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: diffOpen ? '1fr 1fr' : '220px 1fr',
              gap: 'var(--space-4)',
              minHeight: 360,
            }}
          >
            {!diffOpen && (
              <div
                style={{
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  overflow: 'auto',
                  maxHeight: 520,
                }}
              >
                {versions.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setSelectedVersion(v);
                      void loadHistoryDetail(v);
                    }}
                    aria-label={`${t('schemaDetail.version')} v${v}`}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      background: selectedVersion === v ? 'var(--color-surface-2)' : 'transparent',
                      color: selectedVersion === v ? 'var(--color-primary)' : 'var(--color-text)',
                      fontFamily: 'var(--font-heading)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >{`v${v}`}</button>
                ))}
              </div>
            )}
            {!diffOpen && (
              <div>
                {historyLoading ? (
                  <Loader2
                    size={22}
                    style={{ animation: 'km-spin-d 0.9s linear infinite' }}
                    aria-label={t('common.loading')}
                  />
                ) : (
                  <pre style={preBox}>
                    {historyDetail ? (
                      <HighlightedJson text={formatSchemaForDisplay(historyDetail.schema)} />
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {t('schemaDetail.selectVersion')}
                      </span>
                    )}
                  </pre>
                )}
              </div>
            )}
            {diffOpen && (
              <>
                <div>
                  <div
                    style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}
                  >{`v${selectedVersion ?? ''}`}</div>
                  <pre style={{ ...preBox, maxHeight: 480 }}>
                    {diffLoading ? (
                      <Loader2 size={20} style={{ animation: 'km-spin-d 0.9s linear infinite' }} />
                    ) : (
                      <HighlightedJson text={schemaLeft} />
                    )}
                  </pre>
                </div>
                <div>
                  <div
                    style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}
                  >{`v${compareRight ?? ''}`}</div>
                  <pre style={{ ...preBox, maxHeight: 480 }}>
                    {diffLoading ? (
                      <Loader2 size={20} style={{ animation: 'km-spin-d 0.9s linear infinite' }} />
                    ) : (
                      <HighlightedJson text={schemaRight} />
                    )}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'compat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <section>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 'var(--space-3)',
                color: 'var(--color-text)',
              }}
            >
              {t('schemaDetail.compatibilityLevelTitle')}
            </h3>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {t('schemaDetail.currentCompat')}
                <strong style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
                  {compatLevel}
                </strong>
              </span>
              <select
                value={compatDraft}
                onChange={(e) => setCompatDraft(e.target.value)}
                aria-label={t('schemaDetail.compatibilityLevelTitle')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontFamily: 'var(--font-heading)',
                  fontSize: 13,
                  minWidth: 200,
                }}
              >
                {compatSelectLevels.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={compatSaving || !compatDraft}
                onClick={() => void saveCompat()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-primary)',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  cursor: compatSaving ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
              >
                {compatSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </section>

          <section>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 'var(--space-3)',
                color: 'var(--color-text)',
              }}
            >
              {t('schemaDetail.checkCompatibility')}
            </h3>
            <p
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-2)',
              }}
            >
              {t('schemaDetail.checkCompatibilityHint')}
            </p>
            <textarea
              value={checkText}
              onChange={(e) => setCheckText(e.target.value)}
              spellCheck={false}
              placeholder={t('schemaDetail.checkPlaceholder')}
              aria-label={t('schemaDetail.checkPlaceholder')}
              style={{
                width: '100%',
                minHeight: 160,
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-heading)',
                fontSize: 12,
                lineHeight: 1.45,
                marginBottom: 'var(--space-3)',
              }}
            />
            <button
              type="button"
              onClick={() => void runCheck()}
              disabled={checkBusy || !checkText.trim()}
              aria-label={t('schemaDetail.checkCompatibility')}
              style={{
                padding: '8px 18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                fontWeight: 600,
                cursor: checkBusy ? 'wait' : 'pointer',
              }}
            >
              {checkBusy ? t('schemaDetail.checking') : t('schemaDetail.check')}
            </button>

            {checkResult ? (
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${checkResult.isCompatible ? 'var(--color-primary)' : 'rgba(239,68,68,0.45)'}`,
                  background: checkResult.isCompatible
                    ? 'var(--color-primary-muted)'
                    : 'rgba(239,68,68,0.08)',
                  color: checkResult.isCompatible ? 'var(--color-success)' : 'var(--color-error)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {checkResult.isCompatible
                    ? t('schemaDetail.compatible')
                    : t('schemaDetail.incompatible')}
                </div>
                {checkResult.messages?.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text)' }}>
                    {checkResult.messages.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
