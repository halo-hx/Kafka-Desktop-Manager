/**
 * 跨集群复制 Topic 数据（客户端：fetch_messages → send_message）
 */
import { invoke } from '@tauri-apps/api/core';
import { Copy, Square, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KafkaMessage } from '../../types';
import { normalizeKafkaMessage } from '../../lib/topicDataFileFormat';
import { useConnectionStore } from '../../stores/connectionStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useT } from '../../i18n';

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

type CopyRange = 'all' | 'latest_n' | 'time_range';
type RateOpt = 'none' | '100' | '500' | '1000' | 'custom';

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

function dedupe(rows: KafkaMessage[]): KafkaMessage[] {
  const seen = new Set<string>();
  const out: KafkaMessage[] = [];
  for (const m of rows) {
    const k = `${m.partition}-${m.offset}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function CrossClusterCopyDialog({
  open: openDlg,
  onClose,
  sourceClusterId,
  topicName,
}: {
  open: boolean;
  onClose: () => void;
  sourceClusterId: string;
  topicName: string;
}) {
  const t = useT();
  const getConnection = useConnectionStore((s) => s.getConnection);
  const connected = useConnectionStore((s) => s.getConnectedClusters());
  const topicsByCluster = useClusterStore((s) => s.topics);
  const loadTopics = useClusterStore((s) => s.loadTopics);

  const [targetClusterId, setTargetClusterId] = useState('');
  const [targetTopic, setTargetTopic] = useState(topicName);
  const [createIfMissing, setCreateIfMissing] = useState(false);
  const [newPartitions, setNewPartitions] = useState('3');
  const [newRf, setNewRf] = useState('1');
  const [copyRange, setCopyRange] = useState<CopyRange>('latest_n');
  const [latestN, setLatestN] = useState(500);
  const [maxAll, setMaxAll] = useState(50_000);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [rangeCount, setRangeCount] = useState(2000);
  const [rateOpt, setRateOpt] = useState<RateOpt>('500');
  const [customRate, setCustomRate] = useState(200);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(0);
  const [fail, setFail] = useState(0);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const cancelled = useRef(false);

  const sourceLabel = getConnection(sourceClusterId)?.name ?? sourceClusterId;

  const targetChoices = useMemo(
    () => connected.filter((c) => c.id !== sourceClusterId),
    [connected, sourceClusterId],
  );

  useEffect(() => {
    if (openDlg) {
      setTargetTopic(topicName);
      const first = targetChoices[0]?.id ?? '';
      setTargetClusterId(first);
      setCreateIfMissing(false);
      setCopyRange('latest_n');
      setLatestN(500);
      setRunning(false);
      setProgress(0);
      setDone(0);
      setFail(0);
      setTotal(0);
      setErr(null);
      cancelled.current = false;
      if (first) void loadTopics(first);
    }
  }, [openDlg, topicName, loadTopics]); // omit targetChoices from deps to avoid reset when list changes

  useEffect(() => {
    if (targetClusterId) void loadTopics(targetClusterId);
  }, [targetClusterId, loadTopics]);

  const metaSource = topicsByCluster[sourceClusterId]?.find((t) => t.name === topicName);

  useEffect(() => {
    if (metaSource?.partitionCount) {
      setNewPartitions(String(metaSource.partitionCount));
      setNewRf(String(metaSource.replicationFactor || 1));
    }
  }, [metaSource, openDlg]);

  const msgsPerSecond = (): number => {
    if (rateOpt === 'none') return Infinity;
    if (rateOpt === 'custom') return Math.max(1, customRate);
    return Number(rateOpt);
  };

  const delayBetweenMessages = (): number => {
    const r = msgsPerSecond();
    if (!Number.isFinite(r) || r <= 0) return 0;
    return 1000 / r;
  };

  const runCopy = async () => {
    if (!targetClusterId) {
      setErr(t('crossCopy.errPickTargetCluster'));
      return;
    }
    if (!targetTopic.trim()) {
      setErr(t('crossCopy.errTargetTopicRequired'));
      return;
    }

    const ok = window.confirm(
      t('crossCopy.confirmCopy', {
        sourceCluster: sourceLabel,
        sourceTopic: topicName,
        targetCluster: getConnection(targetClusterId)?.name ?? targetClusterId,
        targetTopic: targetTopic.trim(),
      }),
    );
    if (!ok) return;

    cancelled.current = false;
    setRunning(true);
    setErr(null);
    setDone(0);
    setFail(0);
    setProgress(2);

    try {
      const targetTopics = topicsByCluster[targetClusterId] ?? [];
      const exists = targetTopics.some((t) => t.name === targetTopic.trim());
      if (!exists && createIfMissing) {
        await invoke('create_topic', {
          clusterId: targetClusterId,
          name: targetTopic.trim(),
          partitions: Math.max(1, Number(newPartitions) || 1),
          replicationFactor: Math.max(1, Number(newRf) || 1),
          configs: {},
        });
        await loadTopics(targetClusterId);
      } else if (!exists) {
        throw new Error(t('crossCopy.errTopicMissingCreate'));
      }

      let count = 1000;
      let range_mode = 'newest';
      let offset_start: number | null = null;
      let timestamp_ms: number | null = null;
      let endMs: number | undefined;

      if (copyRange === 'all') {
        range_mode = 'oldest';
        count = Math.max(1, maxAll);
      } else if (copyRange === 'latest_n') {
        range_mode = 'newest';
        count = Math.max(1, latestN);
      } else {
        if (!timeStart) throw new Error(t('crossCopy.errStartTimeRequired'));
        const d = Date.parse(timeStart);
        if (!Number.isFinite(d)) throw new Error(t('crossCopy.errStartTimeInvalid'));
        range_mode = 'timestamp';
        timestamp_ms = d;
        count = Math.max(1, rangeCount);
        if (timeEnd) {
          const e = Date.parse(timeEnd);
          if (Number.isFinite(e)) endMs = e;
        }
      }

      const rows = await invokeFetchSlice(
        sourceClusterId,
        topicName,
        null,
        count,
        range_mode,
        offset_start,
        timestamp_ms,
      );
      let batch = dedupe(rows);
      if (endMs !== undefined) {
        batch = batch.filter((m) => {
          const t = Date.parse(m.timestamp);
          return Number.isFinite(t) && t <= endMs;
        });
      }

      setTotal(batch.length);
      const delay = delayBetweenMessages();

      for (let i = 0; i < batch.length; i++) {
        if (cancelled.current) break;
        const m = batch[i];
        try {
          await invoke('send_message', {
            clusterId: targetClusterId,
            topic: targetTopic.trim(),
            partition: null,
            key: m.key || null,
            value: m.value || null,
            headers: Object.keys(m.headers).length ? m.headers : null,
          });
          setDone((d) => d + 1);
        } catch {
          setFail((f) => f + 1);
        }
        setProgress(Math.min(99, Math.round(((i + 1) / batch.length) * 100)));
        if (delay > 0 && i + 1 < batch.length) await sleep(delay);
      }

      setProgress(100);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  if (!openDlg) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={backdrop}
      onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}
    >
      <div
        style={{
          width: 'min(480px, 92vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-body)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Copy size={20} color="var(--color-primary)" />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>{t('crossCopy.dialogHeading')}</h2>
          <button
            type="button"
            disabled={running}
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-faint)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div
          style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            <div>
              <strong>{t('crossCopy.sourcePrefix')}</strong>
              {sourceLabel} · {topicName}
            </div>
          </div>

          <label style={lab}>
            {t('crossCopy.targetClusterLabel')}
            <select
              value={targetClusterId}
              onChange={(e) => setTargetClusterId(e.target.value)}
              style={inp}
              disabled={running}
            >
              <option value="">{t('crossCopy.selectConnectedCluster')}</option>
              {targetChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label style={lab}>
            {t('crossCopy.targetTopicLabel')}
            <input
              value={targetTopic}
              onChange={(e) => setTargetTopic(e.target.value)}
              style={inp}
              disabled={running}
            />
          </label>

          <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={createIfMissing}
              onChange={(e) => setCreateIfMissing(e.target.checked)}
              disabled={running}
              style={{ accentColor: 'var(--color-primary)' }}
            />
            {t('crossCopy.createIfMissing')}
          </label>
          {createIfMissing && (
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...lab, flex: 1 }}>
                {t('crossCopy.partitions')}
                <input
                  value={newPartitions}
                  onChange={(e) => setNewPartitions(e.target.value)}
                  style={inp}
                  disabled={running}
                />
              </label>
              <label style={{ ...lab, flex: 1 }}>
                {t('crossCopy.replicationFactor')}
                <input
                  value={newRf}
                  onChange={(e) => setNewRf(e.target.value)}
                  style={inp}
                  disabled={running}
                />
              </label>
            </div>
          )}

          <label style={lab}>
            {t('crossCopy.copyRangeLabel')}
            <select
              value={copyRange}
              onChange={(e) => setCopyRange(e.target.value as CopyRange)}
              style={inp}
              disabled={running}
            >
              <option value="all">{t('crossCopy.rangeAllCapped')}</option>
              <option value="latest_n">{t('crossCopy.rangeLatestN')}</option>
              <option value="time_range">{t('crossCopy.rangeTimeRange')}</option>
            </select>
          </label>
          {copyRange === 'all' && (
            <label style={lab}>
              {t('crossCopy.maxMessageCount')}
              <input
                type="number"
                min={1}
                value={maxAll}
                onChange={(e) => setMaxAll(Math.max(1, Number(e.target.value) || 1))}
                style={inp}
                disabled={running}
              />
            </label>
          )}
          {copyRange === 'latest_n' && (
            <label style={lab}>
              {t('crossCopy.nCount')}
              <input
                type="number"
                min={1}
                value={latestN}
                onChange={(e) => setLatestN(Math.max(1, Number(e.target.value) || 1))}
                style={inp}
                disabled={running}
              />
            </label>
          )}
          {copyRange === 'time_range' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <label style={{ ...lab, flex: '1 1 180px' }}>
                {t('crossCopy.startTime')}
                <input
                  type="datetime-local"
                  step={1}
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  style={inp}
                  disabled={running}
                />
              </label>
              <label style={{ ...lab, flex: '1 1 180px' }}>
                {t('crossCopy.endTimeOptional')}
                <input
                  type="datetime-local"
                  step={1}
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  style={inp}
                  disabled={running}
                />
              </label>
              <label style={{ ...lab, flex: '1 1 140px' }}>
                {t('crossCopy.fetchCountCap')}
                <input
                  type="number"
                  min={1}
                  value={rangeCount}
                  onChange={(e) => setRangeCount(Math.max(1, Number(e.target.value) || 1))}
                  style={inp}
                  disabled={running}
                />
              </label>
            </div>
          )}

          <label style={lab}>
            {t('crossCopy.rateLimit')}
            <select
              value={rateOpt}
              onChange={(e) => setRateOpt(e.target.value as RateOpt)}
              style={inp}
              disabled={running}
            >
              <option value="none">{t('crossCopy.rateUnlimited')}</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="custom">{t('crossCopy.rateCustom')}</option>
            </select>
          </label>
          {rateOpt === 'custom' && (
            <label style={lab}>
              {t('crossCopy.customMsgsPerSec')}
              <input
                type="number"
                min={1}
                value={customRate}
                onChange={(e) => setCustomRate(Math.max(1, Number(e.target.value) || 1))}
                style={inp}
                disabled={running}
              />
            </label>
          )}

          {running && (
            <div>
              <div
                style={{
                  height: 8,
                  background: 'var(--color-bg)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid var(--color-border)',
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
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {t('crossCopy.progressFmt', { progress, total, done, fail })}
              </p>
              <button
                type="button"
                onClick={() => {
                  cancelled.current = true;
                }}
                style={{
                  ...btnSecondary,
                  marginTop: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Square size={14} />
                {t('crossCopy.cancelRun')}
              </button>
            </div>
          )}

          {err && (
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239,68,68,0.12)',
                color: 'var(--color-error)',
                fontSize: 12,
              }}
            >
              {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" disabled={running} onClick={onClose} style={btnSecondary}>
              {t('crossCopy.close')}
            </button>
            {!running && (
              <button
                type="button"
                onClick={() => void runCopy()}
                style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Copy size={16} />
                {t('crossCopy.startCopyCta')}
              </button>
            )}
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
const inp: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
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
