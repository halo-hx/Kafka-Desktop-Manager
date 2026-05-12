/**
 * 导入 Topic 数据 — 三步向导，解析 JSONL/CSV 后 send_message
 */
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { FileJson, FileSpreadsheet, Upload, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { parseImportFilePreview } from '../../lib/topicDataFileFormat';
import { useClusterStore } from '../../stores/clusterStore';
import { useT } from '../../i18n';

function StepIndicator({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
      {labels.map((lb, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <React.Fragment key={lb}>
            {i > 0 && <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}> → </span>}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: active ? 'var(--color-primary)' : done ? 'var(--color-text-muted)' : 'var(--color-text-faint)',
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading)',
                  background: active ? 'var(--color-primary-muted)' : 'transparent',
                }}
              >
                {n}
              </span>
              {lb}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  backdropFilter: 'blur(8px)',
};

export function ImportTopicDataDialog({
  open: openDlg,
  onClose,
  clusterId,
  defaultTopicName,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  defaultTopicName?: string;
}) {
  const t = useT();
  const topics = useClusterStore((s) => s.topics[clusterId]);
  const loadTopics = useClusterStore((s) => s.loadTopics);

  const stepLabels = useMemo(
    () => [t('dataImport.stepPickSource'), t('dataImport.stepPickTarget'), t('dataImport.stepConfirmRun')],
    [t],
  );

  const [step, setStep] = useState(1);
  const [format, setFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileText, setFileText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [records, setRecords] = useState<ReturnType<typeof parseImportFilePreview>['records']>([]);

  const [createTopic, setCreateTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newPartitions, setNewPartitions] = useState('3');
  const [newRf, setNewRf] = useState('1');
  const [targetTopic, setTargetTopic] = useState(defaultTopicName ?? '');
  const [partitionStrategy, setPartitionStrategy] = useState<'keep' | 'key' | 'fixed'>('key');
  const [fixedPartition, setFixedPartition] = useState(0);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (openDlg) {
      setStep(1);
      setFormat('jsonl');
      setFilePath(null);
      setFileText('');
      setParseError(null);
      setRecords([]);
      setCreateTopic(false);
      setNewTopicName(defaultTopicName ?? '');
      setTargetTopic(defaultTopicName ?? '');
      setPartitionStrategy('key');
      setFixedPartition(0);
      setRunning(false);
      setProgress(0);
      setSent(null);
      setFailed(null);
      setErr(null);
      void loadTopics(clusterId);
    }
  }, [openDlg, clusterId, defaultTopicName, loadTopics]);

  const previewRows = useMemo(() => records.slice(0, 10), [records]);

  const pickFile = async () => {
    const p = await open({
      title: t('dataImport.pickFileTitle'),
      filters: [
        { name: 'JSON Lines', extensions: ['jsonl', 'json', 'txt'] },
        { name: 'CSV', extensions: ['csv'] },
      ],
      multiple: false,
    });
    if (typeof p === 'string') {
      setFilePath(p);
      try {
        const text = await readTextFile(p);
        setFileText(text);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  useEffect(() => {
    if (!fileText) {
      setRecords([]);
      setParseError(null);
      return;
    }
    const parsed = parseImportFilePreview(fileText, format);
    if (parsed.error) {
      setParseError(parsed.error);
      setRecords([]);
    } else {
      setParseError(null);
      setRecords(parsed.records);
    }
  }, [fileText, format]);

  const validateStep1 = () => !!filePath && records.length > 0 && !parseError;
  const validateStep2 = () => {
    if (createTopic) {
      const n = newTopicName.trim();
      if (!n) return false;
      return true;
    }
    return !!targetTopic.trim();
  };

  const runImport = async () => {
    setErr(null);
    const topic =
      createTopic ? newTopicName.trim() : targetTopic.trim();
    if (!topic) return;

    setRunning(true);
    setProgress(2);
    setSent(0);
    setFailed(0);

    try {
      if (createTopic) {
        await invoke('create_topic', {
          clusterId,
          name: topic,
          partitions: Math.max(1, Number(newPartitions) || 1),
          replicationFactor: Math.max(1, Number(newRf) || 1),
          configs: {},
        });
        await loadTopics(clusterId);
      }

      let ok = 0;
      let bad = 0;
      const total = records.length;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        let partition: number | null = null;
        if (partitionStrategy === 'keep' && r.partition !== null) {
          partition = r.partition;
        } else if (partitionStrategy === 'fixed') {
          partition = fixedPartition;
        } else {
          partition = null;
        }

        try {
          await invoke('send_message', {
            clusterId,
            topic,
            partition,
            key: r.key || null,
            value: r.value || null,
            headers: Object.keys(r.headers).length ? r.headers : null,
          });
          ok++;
        } catch {
          bad++;
        }
        setProgress(2 + Math.round(((i + 1) / total) * 98));
        setSent(ok);
        setFailed(bad);
      }

      setProgress(100);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      void loadTopics(clusterId);
    }
  };

  if (!openDlg) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div
        style={{
          width: 'min(560px, 94vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-body)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
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
          <Upload size={20} color="var(--color-primary)" />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>{t('dataImport.title')}</h2>
          <button
            type="button"
            disabled={running}
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: running ? 'not-allowed' : 'pointer', color: 'var(--color-text-faint)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <StepIndicator step={step} labels={stepLabels} />

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('dataImport.fileFormat')}</span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setFormat('jsonl')}
                  style={{
                    ...fmtBtn,
                    borderColor: format === 'jsonl' ? 'var(--color-primary)' : 'var(--color-border)',
                    background: format === 'jsonl' ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                  }}
                >
                  <FileJson size={18} /> {t('msgExport.jsonLines')}
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  style={{
                    ...fmtBtn,
                    borderColor: format === 'csv' ? 'var(--color-primary)' : 'var(--color-border)',
                    background: format === 'csv' ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                  }}
                >
                  <FileSpreadsheet size={18} /> {t('msgExport.csv')}
                </button>
              </div>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('dataImport.file')}</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input readOnly value={filePath ?? ''} placeholder={t('dataExport.notSelected')} style={{ ...inp, flex: 1 }} />
                  <button type="button" onClick={() => void pickFile()} style={btnSecondary}>
                    {t('dataImport.browseEllipsis')}
                  </button>
                </div>
              </div>
              {parseError && <div style={{ color: 'var(--color-error)', fontSize: 12 }}>{parseError}</div>}
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('dataImport.previewUpTo10')}</div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg)' }}>
                      <th style={th}>{t('dataImport.colPartition')}</th>
                      <th style={th}>{t('dataImport.colKey')}</th>
                      <th style={th}>{t('dataImport.colValue')}</th>
                      <th style={th}>{t('dataImport.colHeaders')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, idx) => (
                      <tr key={idx}>
                        <td style={td}>{r.partition ?? '—'}</td>
                        <td style={{ ...td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.key || t('dataImport.emptyKeySymbol')}</td>
                        <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.value}</td>
                        <td style={td}>{Object.keys(r.headers).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length === 0 && (
                  <div style={{ padding: 16, color: 'var(--color-text-faint)', fontSize: 12 }}>{t('dataImport.noPreview')}</div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={createTopic}
                  onChange={(e) => setCreateTopic(e.target.checked)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {t('dataImport.createNewTopic')}
              </label>
              {createTopic ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={lab}>
                    {t('dataImport.topicNameLabel')}
                    <input value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} style={inp} />
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ ...lab, flex: 1 }}>
                      {t('dataImport.partitionCount')}
                      <input value={newPartitions} onChange={(e) => setNewPartitions(e.target.value)} style={inp} />
                    </label>
                    <label style={{ ...lab, flex: 1 }}>
                      {t('dataImport.replicationFactor')}
                      <input value={newRf} onChange={(e) => setNewRf(e.target.value)} style={inp} />
                    </label>
                  </div>
                </div>
              ) : (
                <label style={lab}>
                  {t('dataImport.targetTopicLabel')}
                  <select value={targetTopic} onChange={(e) => setTargetTopic(e.target.value)} style={sel}>
                    <option value="">{t('dataImport.selectEllipsis')}</option>
                    {(topics ?? []).map((topic) => (
                      <option key={topic.name} value={topic.name}>
                        {topic.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label style={lab}>
                {t('dataImport.partitionStrategy')}
                <select
                  value={partitionStrategy}
                  onChange={(e) => setPartitionStrategy(e.target.value as 'keep' | 'key' | 'fixed')}
                  style={sel}
                >
                  <option value="keep">{t('dataImport.strategyKeep')}</option>
                  <option value="key">{t('dataImport.strategyKey')}</option>
                  <option value="fixed">{t('dataImport.strategyFixed')}</option>
                </select>
              </label>
              {partitionStrategy === 'fixed' && (
                <label style={lab}>
                  {t('dataImport.partitionIndex')}
                  <input
                    type="number"
                    min={0}
                    value={fixedPartition}
                    onChange={(e) => setFixedPartition(Math.max(0, Number(e.target.value) || 0))}
                    style={inp}
                  />
                </label>
              )}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: 'var(--color-text-muted)' }}>
              <div>
                <strong>{t('dataImport.summaryFile')}</strong> {filePath}
              </div>
              <div>
                <strong>{t('dataImport.summaryRecords')}</strong> {records.length}
              </div>
              <div>
                <strong>{t('dataImport.summaryTargetTopic')}</strong>{' '}
                {createTopic ? newTopicName.trim() || t('dataImport.newTopicPending') : targetTopic}
              </div>
              <div>
                <strong>{t('dataImport.summaryStrategy')}</strong>
                {partitionStrategy === 'keep'
                  ? t('dataImport.strategyKeepShort')
                  : partitionStrategy === 'key'
                    ? t('dataImport.strategyKeyShort')
                    : t('dataImport.strategyFixedShort', { n: fixedPartition })}
              </div>

              {running && (
                <div>
                  <div
                    style={{
                      height: 8,
                      background: 'var(--color-bg)',
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--color-primary)', transition: 'width var(--transition-fast)' }} />
                  </div>
                  <p style={{ marginTop: 8, fontSize: 12 }}>
                    {t('dataImport.progressFmt', { progress, sent: sent ?? 0, failed: failed ?? 0 })}
                  </p>
                </div>
              )}

              {!running && sent !== null && records.length > 0 && progress >= 100 && (
                <div style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}>
                  {t('dataImport.doneFmt', { sent: sent ?? 0, failed: failed ?? 0 })}
                </div>
              )}

              {err && (
                <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.12)', color: 'var(--color-error)', fontSize: 12 }}>
                  {err}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <button type="button" disabled={running || step === 1} onClick={() => setStep((s) => s - 1)} style={btnSecondary}>
              {t('dataImport.prev')}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={running} onClick={onClose} style={btnSecondary}>
                {step === 3 && !running && progress >= 100 ? t('dataImport.close') : t('dataImport.cancel')}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  disabled={running || (step === 1 ? !validateStep1() : !validateStep2())}
                  onClick={() => {
                    if (step === 2 && records.length === 0) return;
                    setStep((s) => Math.min(3, s + 1));
                  }}
                  style={btnPrimary}
                >
                  {t('dataImport.next')}
                </button>
              ) : (
                !running &&
                progress < 100 &&
                records.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void runImport()}
                    style={{ ...btnPrimary, display: 'inline-flex', gap: 6, alignItems: 'center' }}
                  >
                    <Upload size={16} />
                    {t('dataImport.startImport')}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const fmtBtn: React.CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};
const inp: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};
const sel = inp;
const lab: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-faint)', display: 'flex', flexDirection: 'column', gap: 6 };
const th: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border-subtle)',
  color: 'var(--color-text-faint)',
};
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--color-border-subtle)', color: 'var(--color-text)' };
const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 18px',
  background: 'var(--color-primary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  color: '#0b172a',
  cursor: 'pointer',
};
