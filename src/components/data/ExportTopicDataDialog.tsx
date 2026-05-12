/**
 * 导出 Topic 数据 — 三步向导，fetch_messages + 写入本地文件
 */
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, FileJson, FileSpreadsheet, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { KafkaMessage } from '../../types';
import { messagesToExportText, normalizeKafkaMessage } from '../../lib/topicDataFileFormat';
import { useClusterStore } from '../../stores/clusterStore';
import { useT } from '../../i18n';

export type MsgRangeChoice = 'oldest_n' | 'newest_n' | 'all' | 'offset_range' | 'time_range';

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

function StepIndicator({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
      {labels.map((lb, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <React.Fragment key={lb}>
            {i > 0 && (
              <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>
                {' '}
                →{' '}
              </span>
            )}
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

async function invokeFetchSlice(
  clusterId: string,
  topicName: string,
  partition: number | null,
  count: number,
  range_mode: string,
  offset_start: number | null,
  timestamp_ms: number | null,
): Promise<KafkaMessage[]> {
  const raw = await invoke<unknown[]>('fetch_messages', {
    clusterId,
    topic: topicName,
    partition,
    offsetStart: offset_start,
    count,
    rangeMode: range_mode,
    timestampMs: timestamp_ms,
  });
  return Array.isArray(raw) ? raw.map(normalizeKafkaMessage) : [];
}

function dedupeMessages(rows: KafkaMessage[]): KafkaMessage[] {
  const seen = new Set<string>();
  const out: KafkaMessage[] = [];
  for (const m of rows) {
    const k = `${m.partition}-${m.offset}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  out.sort((a, b) => {
    const pc = a.partition - b.partition;
    if (pc !== 0) return pc;
    return a.offset - b.offset;
  });
  return out;
}

export function ExportTopicDataDialog({
  open: openDlg,
  onClose,
  clusterId,
  topicName,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  topicName: string;
}) {
  const t = useT();
  const topics = useClusterStore((s) => s.topics[clusterId]);
  const loadTopics = useClusterStore((s) => s.loadTopics);

  const rangeOptions = useMemo(
    () =>
      [
        { value: 'oldest_n' as MsgRangeChoice, label: t('dataExport.rangeOldestN') },
        { value: 'newest_n' as MsgRangeChoice, label: t('dataExport.rangeNewestN') },
        { value: 'all' as MsgRangeChoice, label: t('dataExport.rangeAll') },
        { value: 'offset_range' as MsgRangeChoice, label: t('dataExport.rangeOffsetRange') },
        { value: 'time_range' as MsgRangeChoice, label: t('dataExport.rangeTime') },
      ] as const,
    [t],
  );

  const stepLabels = useMemo(
    () => [t('dataExport.stepPickSource'), t('dataExport.stepFormat'), t('dataExport.stepConfirmRun')],
    [t],
  );

  const [step, setStep] = useState(1);
  const [selectedTopic, setSelectedTopic] = useState(topicName);
  const [partitionMode, setPartitionMode] = useState<'all' | 'specific'>('all');
  const [partitionChecks, setPartitionChecks] = useState<Record<number, boolean>>({});
  const [rangeChoice, setRangeChoice] = useState<MsgRangeChoice>('newest_n');
  const [countLimit, setCountLimit] = useState(1000);
  const [offsetStart, setOffsetStart] = useState('0');
  const [offsetCount, setOffsetCount] = useState(500);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [maxAll, setMaxAll] = useState(100_000);

  const [format, setFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [includeKey, setIncludeKey] = useState(true);
  const [includeValue, setIncludeValue] = useState(true);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [targetDir, setTargetDir] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [resultRows, setResultRows] = useState<number | null>(null);
  const [resultBytes, setResultBytes] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (openDlg) {
      setStep(1);
      setSelectedTopic(topicName);
      setPartitionMode('all');
      setPartitionChecks({});
      setRangeChoice('newest_n');
      setCountLimit(1000);
      setFormat('jsonl');
      setTargetDir(null);
      setRunning(false);
      setProgress(0);
      setResultMsg(null);
      setResultRows(null);
      setResultBytes(null);
      setErr(null);
      void loadTopics(clusterId);
    }
  }, [openDlg, topicName, clusterId, loadTopics]);

  const topicMeta = useMemo(
    () => topics?.find((topic) => topic.name === selectedTopic),
    [topics, selectedTopic],
  );

  const partitionList = useMemo(() => {
    const n = topicMeta?.partitionCount ?? 0;
    return Array.from({ length: Math.max(0, n) }, (_, i) => i);
  }, [topicMeta]);

  useEffect(() => {
    if (!openDlg || !partitionList.length) return;
    setPartitionChecks((prev) => {
      const next = { ...prev };
      for (const p of partitionList) {
        if (next[p] === undefined) next[p] = true;
      }
      return next;
    });
  }, [openDlg, partitionList]);

  const selectedPartitions = useMemo(() => {
    if (partitionMode === 'all') return null as number[] | null;
    return partitionList.filter((p) => partitionChecks[p]);
  }, [partitionMode, partitionList, partitionChecks]);

  const pickDirectory = async () => {
    const dir = await open({ directory: true, title: t('dataExport.pickDirTitle') });
    if (typeof dir === 'string') setTargetDir(dir);
  };

  const resolveFetchPlan = (): {
    range_mode: string;
    count: number;
    offset_start: number | null;
    timestamp_ms: number | null;
    endMs?: number;
  } | null => {
    switch (rangeChoice) {
      case 'oldest_n':
        return { range_mode: 'oldest', count: Math.max(1, countLimit), offset_start: null, timestamp_ms: null };
      case 'newest_n':
        return { range_mode: 'newest', count: Math.max(1, countLimit), offset_start: null, timestamp_ms: null };
      case 'all':
        return {
          range_mode: 'oldest',
          count: Math.max(1, maxAll),
          offset_start: null,
          timestamp_ms: null,
        };
      case 'offset_range': {
        const start = Number(offsetStart);
        const cnt = Math.max(1, offsetCount);
        if (!Number.isFinite(start) || start < 0) return null;
        return { range_mode: 'offset', count: cnt, offset_start: start, timestamp_ms: null };
      }
      case 'time_range': {
        if (!timeStart) return null;
        const d = Date.parse(timeStart);
        if (!Number.isFinite(d)) return null;
        const endMs = timeEnd ? Date.parse(timeEnd) : undefined;
        return {
          range_mode: 'timestamp',
          count: Math.max(1, countLimit),
          offset_start: null,
          timestamp_ms: d,
          endMs,
        };
      }
      default:
        return null;
    }
  };

  const validateStep1 = (): string | null => {
    if (!selectedTopic.trim()) return t('dataExport.errPickTopic');
    if (partitionMode === 'specific' && (!selectedPartitions || selectedPartitions.length === 0)) {
      return t('dataExport.errPickPartition');
    }
    const plan = resolveFetchPlan();
    if (!plan) return t('dataExport.errCheckOffsetTime');
    return null;
  };

  const validateStep2 = (): string | null => {
    if (!targetDir) return t('dataExport.errPickDir');
    if (!includeKey && !includeValue && !includeHeaders) return t('dataExport.errPickExportContent');
    return null;
  };

  const runExport = async () => {
    setErr(null);
    const plan = resolveFetchPlan();
    if (!plan || !targetDir) return;
    setRunning(true);
    setProgress(5);
    setResultMsg(null);

    try {
      let merged: KafkaMessage[] = [];

      if (partitionMode === 'all') {
        merged = await invokeFetchSlice(
          clusterId,
          selectedTopic,
          null,
          plan.count,
          plan.range_mode,
          plan.offset_start,
          plan.timestamp_ms,
        );
        setProgress(65);
      } else {
        const parts = selectedPartitions ?? [];
        const n = Math.max(1, parts.length);
        const perSlice = Math.max(1, Math.ceil(plan.count / n));
        let done = 0;
        for (const part of parts) {
          const slice = await invokeFetchSlice(
            clusterId,
            selectedTopic,
            part,
            perSlice,
            plan.range_mode,
            plan.offset_start,
            plan.timestamp_ms,
          );
          merged.push(...slice);
          done++;
          setProgress(5 + Math.round((done / parts.length) * 60));
        }
      }

      if (plan.endMs !== undefined && Number.isFinite(plan.endMs)) {
        merged = merged.filter((m) => {
          const ts = Date.parse(m.timestamp);
          return Number.isFinite(ts) && ts <= (plan.endMs as number);
        });
      }

      merged = dedupeMessages(merged);
      if (merged.length > plan.count) {
        merged = merged.slice(0, plan.count);
      }

      setProgress(72);
      const text = messagesToExportText(merged, format, includeKey, includeValue, includeHeaders);
      const ext = format === 'jsonl' ? 'jsonl' : 'csv';
      const base = `${selectedTopic}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      const filePath = await join(targetDir, base);

      await writeTextFile(filePath, text);

      const bytes = new TextEncoder().encode(text).length;
      setProgress(100);
      setResultRows(merged.length);
      setResultBytes(bytes);
      setResultMsg(t('dataExport.writtenTo', { path: filePath }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  if (!openDlg) return null;

  const canNext =
    step === 1 ? !validateStep1() : step === 2 ? !validateStep2() : true;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-topic-title"
      style={backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div
        style={{
          width: 'min(540px, 94vw)',
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
          <Download size={20} strokeWidth={2} color="var(--color-primary)" />
          <h2 id="export-topic-title" style={{ flex: 1, margin: 0, fontSize: 16 }}>
            {t('dataExport.title')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            disabled={running}
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: running ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-faint)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <StepIndicator step={step} labels={stepLabels} />

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={lab}>
                {t('dataExport.topic')}
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  style={sel}
                >
                  {!(topics ?? []).some((topic) => topic.name === topicName) && topicName ? (
                    <option value={topicName}>{topicName}</option>
                  ) : null}
                  {(topics ?? []).map((topic) => (
                    <option key={topic.name} value={topic.name}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset style={fs}>
                <legend style={leg}>{t('dataExport.fieldsetPartition')}</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="pm"
                    checked={partitionMode === 'all'}
                    onChange={() => setPartitionMode('all')}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  {t('dataExport.partitionAll')}
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="pm"
                    checked={partitionMode === 'specific'}
                    onChange={() => setPartitionMode('specific')}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  {t('dataExport.partitionPick')}
                </label>
                {partitionMode === 'specific' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                    {partitionList.map((p) => (
                      <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={!!partitionChecks[p]}
                          onChange={(e) =>
                            setPartitionChecks((prev) => ({ ...prev, [p]: e.target.checked }))
                          }
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <label style={lab}>
                {t('dataExport.msgRange')}
                <select
                  value={rangeChoice}
                  onChange={(e) => setRangeChoice(e.target.value as MsgRangeChoice)}
                  style={sel}
                >
                  {rangeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {(rangeChoice === 'oldest_n' || rangeChoice === 'newest_n' || rangeChoice === 'time_range') && (
                <label style={lab}>
                  {t('dataExport.countLimit')}
                  <input
                    type="number"
                    min={1}
                    value={countLimit}
                    onChange={(e) => setCountLimit(Math.max(1, Number(e.target.value) || 1))}
                    style={inp}
                  />
                </label>
              )}

              {rangeChoice === 'all' && (
                <label style={lab}>
                  {t('dataExport.maxRowsSafety')}
                  <input
                    type="number"
                    min={1}
                    value={maxAll}
                    onChange={(e) => setMaxAll(Math.max(1, Number(e.target.value) || 1))}
                    style={inp}
                  />
                </label>
              )}

              {rangeChoice === 'offset_range' && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ ...lab, flex: '1 1 160px' }}>
                    {t('dataExport.startOffset')}
                    <input value={offsetStart} onChange={(e) => setOffsetStart(e.target.value)} style={inp} />
                  </label>
                  <label style={{ ...lab, flex: '1 1 160px' }}>
                    {t('dataExport.rowCountShort')}
                    <input
                      type="number"
                      min={1}
                      value={offsetCount}
                      onChange={(e) => setOffsetCount(Math.max(1, Number(e.target.value) || 1))}
                      style={inp}
                    />
                  </label>
                </div>
              )}

              {rangeChoice === 'time_range' && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ ...lab, flex: '1 1 200px' }}>
                    {t('dataExport.startTime')}
                    <input type="datetime-local" step={1} value={timeStart} onChange={(e) => setTimeStart(e.target.value)} style={inp} />
                  </label>
                  <label style={{ ...lab, flex: '1 1 200px' }}>
                    {t('dataExport.endTimeOptional')}
                    <input type="datetime-local" step={1} value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} style={inp} />
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('dataExport.stepFormat')}</span>
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

              <fieldset style={fs}>
                <legend style={leg}>{t('dataExport.contentFields')}</legend>
                <label style={ck}>
                  <input type="checkbox" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
                  {t('messages.key')}
                </label>
                <label style={ck}>
                  <input type="checkbox" checked={includeValue} onChange={(e) => setIncludeValue(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
                  {t('messages.value')}
                </label>
                <label style={ck}>
                  <input type="checkbox" checked={includeHeaders} onChange={(e) => setIncludeHeaders(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
                  {t('messages.headers')}
                </label>
              </fieldset>

              <div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('dataExport.targetDir')}</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input readOnly value={targetDir ?? ''} placeholder={t('dataExport.notSelected')} style={{ ...inp, flex: 1 }} />
                  <button type="button" onClick={() => void pickDirectory()} style={btnSecondary}>
                    {t('dataExport.browseEllipsis')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong>{t('dataExport.summaryTopic')}</strong>
                  {selectedTopic}
                </div>
                <div>
                  <strong>{t('dataExport.summaryPartition')}</strong>
                  {partitionMode === 'all' ? t('dataExport.partitionAllLabel') : (selectedPartitions ?? []).join(', ')}
                </div>
                <div>
                  <strong>{t('dataExport.summaryRange')}</strong>
                  {rangeOptions.find((r) => r.value === rangeChoice)?.label}
                </div>
                <div>
                  <strong>{t('dataExport.summaryFormat')}</strong>
                  {format === 'jsonl' ? t('msgExport.jsonLines') : t('msgExport.csv')}
                </div>
                <div>
                  <strong>{t('dataExport.summaryDir')}</strong>
                  {targetDir}
                </div>
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
                    <div
                      style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: 'var(--color-primary)',
                        transition: 'width var(--transition-fast)',
                      }}
                    />
                  </div>
                  <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-faint)' }}>{progress}%</p>
                </div>
              )}

              {!running && resultRows !== null && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-primary-muted)',
                    color: 'var(--color-primary)',
                    fontSize: 13,
                  }}
                >
                  <div>{t('dataExport.done')}</div>
                  <div style={{ marginTop: 6 }}>{t('dataExport.msgCount')}{resultRows}</div>
                  <div>{t('dataExport.bytesApprox', { bytes: (resultBytes ?? 0).toLocaleString() })}</div>
                  {resultMsg && <div style={{ marginTop: 6, wordBreak: 'break-all', fontSize: 11 }}>{resultMsg}</div>}
                </div>
              )}

              {err && (
                <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.12)', color: 'var(--color-error)', fontSize: 12 }}>
                  {err}
                </div>
              )}
            </div>
          )}

          {validateStep1() && step === 1 && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 8 }}>{validateStep1()}</p>
          )}
          {validateStep2() && step === 2 && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 8 }}>{validateStep2()}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <button type="button" disabled={running || step === 1} onClick={() => setStep((s) => s - 1)} style={btnSecondary}>
              {t('dataExport.prev')}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={running} onClick={onClose} style={btnSecondary}>
                {step === 3 && resultRows !== null ? t('dataExport.close') : t('common.cancel')}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  disabled={running || !canNext}
                  onClick={() => {
                    const e1 = step === 1 ? validateStep1() : null;
                    const e2 = step === 2 ? validateStep2() : null;
                    if (e1 || e2) return;
                    setStep((s) => s + 1);
                  }}
                  style={btnPrimary}
                >
                  {t('dataExport.next')}
                </button>
              ) : (
                !running &&
                resultRows === null && (
                  <button
                    type="button"
                    onClick={() => void runExport()}
                    style={{
                      ...btnPrimary,
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <Download size={16} />
                    {t('dataExport.startExport')}
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

const lab: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-faint)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const sel: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};
const inp: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};
const fs: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: 12,
};
const leg: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', padding: '0 6px' };
const ck: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', color: 'var(--color-text)' };
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
  color: 'var(--color-text)',
};
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
