/**
 * TopicMessageViewer — Topic 消息浏览器（Data Tab）
 * Stores + TableVirtuoso + 右键菜单 / 导出 / 发送
 */
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Filter,
  Inbox,
  Play,
  Plus,
  Radio,
  Save,
  Send,
  Square,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import type { FilterCondition, FilterField, KafkaMessage, MessageRange } from '../../types';
import type { TFunction } from '../../i18n';
import { useT } from '../../i18n';
import { useMessageStore } from '../../stores/messageStore';
import { useClusterStore } from '../../stores/clusterStore';
import { SendMessageDialog } from './SendMessageDialog';
import { MessageExportDialog } from './MessageExportDialog';

const EMPTY_MESSAGES: KafkaMessage[] = [];
const EMPTY_PROGRESS = { loaded: 0, target: 0 } as const;

function topicStoreKey(clusterId: string, topicName: string) {
  return `${clusterId}/${topicName}`;
}

type DetailTab = 'key' | 'value' | 'headers';
type SortDir = 'asc' | 'desc';
type ValueFormat = 'auto' | 'text' | 'json' | 'xml' | 'hex';

const COUNT_OPTIONS = [50, 100, 500, 1000, 5000];
const FILTER_FIELDS: FilterField[] = ['Offset', 'Key', 'Value', 'Header Key', 'Header Value'];

function filterFieldLabel(field: FilterField, t: TFunction): string {
  switch (field) {
    case 'Offset':
      return t('messages.offset');
    case 'Key':
      return t('messages.key');
    case 'Value':
      return t('messages.value');
    case 'Header Key':
      return t('sendMsg.headerKey');
    case 'Header Value':
      return t('sendMsg.headerValue');
    default:
      return field;
  }
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function msgId(m: KafkaMessage): string {
  return `${m.partition}-${m.offset}`;
}

function formatBody(raw: string, format: ValueFormat): string {
  if (format === 'json') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  if (format === 'hex') {
    return Array.from(new TextEncoder().encode(raw))
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
  }
  if (format === 'auto') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return raw;
}

function JsonPre({ text, folded }: { text: string; folded: boolean }) {
  const body = useMemo(() => {
    if (folded) {
      try {
        return JSON.stringify(JSON.parse(text));
      } catch {
        return text;
      }
    }
    return formatBody(text, 'json');
  }, [text, folded]);

  return (
    <pre
      style={{
        margin: 0,
        padding: '14px 16px',
        overflow: 'auto',
        maxHeight: 280,
        fontFamily: 'var(--font-heading)',
        fontSize: 12.5,
        lineHeight: 1.7,
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-sm)',
        transition: 'max-height var(--transition-normal)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: 'var(--color-text)',
      }}
    >
      {body}
    </pre>
  );
}

function DetailPanel({
  message,
  onClose,
}: {
  message: KafkaMessage;
  onClose: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<DetailTab>('value');
  const [format, setFormat] = useState<ValueFormat>('auto');
  const [jsonFolded, setJsonFolded] = useState(false);

  const raw = tab === 'value' ? message.value : tab === 'key' ? message.key : JSON.stringify(message.headers, null, 2);
  const displayPlain = formatBody(raw, tab === 'headers' ? 'text' : format);
  const jsonMode = tab !== 'headers' && (format === 'json' || format === 'auto');

  const saveToFile = async () => {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: `kafka-${message.partition}-${message.offset}.txt`,
      filters: [{ name: 'Text', extensions: ['txt', 'json'] }],
    });
    if (path) await writeTextFile(path, displayPlain);
  };

  const metaItems = [
    { label: t('messages.partition'), value: String(message.partition) },
    { label: t('messages.offset'), value: String(message.offset) },
    { label: t('messages.timestamp'), value: message.timestamp },
    { label: t('messages.size'), value: `${message.size} B` },
  ];

  const formatOptions: ValueFormat[] = ['json', 'text', 'hex'];

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 420,
        transition: 'min-height var(--transition-normal)',
      }}
    >
      {/* Metadata bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 16,
          padding: '10px 20px',
          borderBottom: '1px solid var(--color-border-subtle)',
          fontSize: 12,
          color: 'var(--color-text-muted)',
          background: 'var(--color-surface)',
        }}
      >
        {metaItems.map((item) => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>{item.label}</span>
            <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{item.value}</strong>
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-faint)',
            borderRadius: 'var(--radius-xs)',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-2)';
            e.currentTarget.style.color = 'var(--color-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = 'var(--color-text-faint)';
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs + format + actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center' }}>
        {(['key', 'value', 'headers'] as DetailTab[]).map((tabName) => (
          <button
            key={tabName}
            type="button"
            onClick={() => setTab(tabName)}
            style={{
              padding: '5px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: tab === tabName ? 'var(--color-primary-muted)' : 'transparent',
              color: tab === tabName ? 'var(--color-primary)' : 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === tabName ? 600 : 400,
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              if (tab !== tabName) e.currentTarget.style.background = 'var(--color-surface-2)';
            }}
            onMouseLeave={(e) => {
              if (tab !== tabName) e.currentTarget.style.background = 'transparent';
            }}
          >
            {tabName === 'key'
              ? t('messages.key')
              : tabName === 'value'
                ? t('messages.value')
                : t('messages.headersCount', { count: Object.keys(message.headers).length })}
          </button>
        ))}

        {tab !== 'headers' && (
          <>
            <span style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 4px' }} />
            <span style={{ color: 'var(--color-text-faint)', fontSize: 12, fontWeight: 500 }}>{t('messages.format')}</span>
            {formatOptions.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: format === f ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  background: format === f ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                  color: format === f ? 'var(--color-primary)' : 'var(--color-text-faint)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {f}
              </button>
            ))}
            {jsonMode && (
              <button type="button" style={ghostBtn} onClick={() => setJsonFolded((v) => !v)}>
                {jsonFolded ? t('messages.expand') : t('messages.collapse')}
              </button>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={ghostBtn}
          onClick={() => void navigator.clipboard?.writeText(displayPlain)}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)';
            e.currentTarget.style.color = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <Copy size={13} /> {t('messages.copyMessage')}
        </button>
        <button
          type="button"
          style={ghostBtn}
          onClick={() => void saveToFile()}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)';
            e.currentTarget.style.color = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <Save size={13} /> {t('messages.saveMessage')}
        </button>
      </div>

      {/* Content */}
      {tab !== 'headers' && jsonMode ? (
        <JsonPre text={raw} folded={jsonFolded} />
      ) : (
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            overflow: 'auto',
            maxHeight: 280,
            fontFamily: 'var(--font-heading)',
            fontSize: 12.5,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'var(--color-text)',
          }}
        >
          {displayPlain || <span style={{ color: 'var(--color-text-faint)', fontStyle: 'italic' }}>{t('messages.emptyDisplay')}</span>}
        </pre>
      )}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
  transition: 'all var(--transition-fast)',
};

export function TopicMessageViewer({ clusterId, topicName }: { clusterId: string; topicName: string }) {
  const t = useT();
  const tk = topicStoreKey(clusterId, topicName);
  const messages = useMessageStore((s) => s.messages[tk] ?? EMPTY_MESSAGES);
  const loading = useMessageStore((s) => s.loading[tk] ?? false);
  const liveMode = useMessageStore((s) => s.liveMode[tk] ?? false);
  const fetchProgress = useMessageStore((s) => s.fetchProgress[tk] ?? EMPTY_PROGRESS);
  const msgsPerSec = useMessageStore((s) => s.msgsPerSecond[tk] ?? 0);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const stopFetch = useMessageStore((s) => s.stopFetch);
  const toggleLiveMode = useMessageStore((s) => s.toggleLiveMode);

  const topicMeta = useClusterStore((s) => s.topics[clusterId]?.find((x) => x.name === topicName) ?? null);
  const loadTopics = useClusterStore((s) => s.loadTopics);
  useEffect(() => {
    if (!topicMeta) void loadTopics(clusterId);
  }, [clusterId, topicMeta, loadTopics]);

  const [range, setRange] = useState<MessageRange>('newest');
  const [countSel, setCountSel] = useState('100');
  const [customCount, setCustomCount] = useState(200);
  const [fetchPartition, setFetchPartition] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [filterField, setFilterField] = useState<FilterField>('Value');
  const [filterJsonPath, setFilterJsonPath] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [extraFilters, setExtraFilters] = useState<FilterCondition[]>([]);
  const [offsetValue, setOffsetValue] = useState('');
  const [timestampValue, setTimestampValue] = useState('');
  const [expanded, setExpanded] = useState<KafkaMessage | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorIdx = useRef<number | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; msg: KafkaMessage } | null>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [clonePayload, setClonePayload] = useState<{
    key?: string;
    value?: string;
    headers?: Record<string, string>;
  } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const sortedMessages = useMemo(() => {
    const arr = [...messages];
    arr.sort((a, b) => (sortDir === 'desc' ? b.offset - a.offset : a.offset - b.offset));
    return arr;
  }, [messages, sortDir]);

  const partitions = useMemo(() => {
    const n = topicMeta?.partitionCount ?? 0;
    return Array.from({ length: Math.max(0, n) }, (_, i) => i);
  }, [topicMeta]);

  const effectiveCount = COUNT_OPTIONS.includes(Number(countSel)) ? Number(countSel) : customCount;

  const rangeLabels = useMemo(
    (): Record<MessageRange, string> => ({
      newest: t('messages.rangeNewest'),
      oldest: t('messages.rangeOldest'),
      offset: t('messages.rangeOffset'),
      timestamp: t('messages.rangeTimestamp'),
    }),
    [t],
  );

  const buildFilters = useCallback((): FilterCondition[] => {
    const filters: FilterCondition[] = [];
    if (filterInput.trim()) {
      filters.push({
        id: 'main',
        field: filterField,
        value: filterInput,
        regex: useRegex,
        logic: 'AND',
        jsonPath: filterJsonPath.trim() || undefined,
      });
    }
    filters.push(...extraFilters);
    return filters;
  }, [filterInput, filterField, filterJsonPath, useRegex, extraFilters]);

  const handleFetch = () => {
    const ts = range === 'timestamp' && timestampValue ? timestampValue : undefined;
    const off = range === 'offset' && offsetValue !== '' ? Number(offsetValue) : undefined;
    const part = fetchPartition === '' ? null : Number(fetchPartition);
    void fetchMessages(clusterId, topicName, range, effectiveCount, buildFilters(), off, ts, part);
  };

  const fetchRef = useRef(handleFetch);
  fetchRef.current = handleFetch;

  useEffect(() => {
    const onRefresh = (ev: Event) => {
      const ce = ev as CustomEvent<{ clusterId: string; topicName: string }>;
      const d = ce.detail;
      if (!d || d.clusterId !== clusterId || d.topicName !== topicName) return;
      fetchRef.current();
    };
    window.addEventListener('km:refresh-topic-messages', onRefresh);
    return () => window.removeEventListener('km:refresh-topic-messages', onRefresh);
  }, [clusterId, topicName]);

  const onRowMouse = (
    e: React.MouseEvent<HTMLTableRowElement>,
    idx: number,
    msg: KafkaMessage,
    itemIndex: number,
  ) => {
    const actualIdx = itemIndex >= 0 ? itemIndex : idx;
    const id = msgId(msg);
    if (e.type === 'contextmenu') {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(msg);
      setCtx({ x: e.clientX, y: e.clientY, msg });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
      anchorIdx.current = actualIdx;
      return;
    }
    if (e.shiftKey && anchorIdx.current !== null) {
      const a = anchorIdx.current;
      const [lo, hi] = actualIdx > a ? [a, actualIdx] : [actualIdx, a];
      const slice = sortedMessages.slice(lo, hi + 1).map(msgId);
      setSelectedIds(new Set(slice));
      return;
    }
    anchorIdx.current = actualIdx;
    setSelectedIds(new Set([id]));
    setExpanded((prev) => (prev && msgId(prev) === id ? null : msg));
  };

  const selectedRows = useMemo(
    () => sortedMessages.filter((m) => selectedIds.has(msgId(m))),
    [sortedMessages, selectedIds],
  );

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const emptyHint = useMemo(
    () =>
      t('messages.emptyStateHint', {
        fetch: t('messages.fetch'),
        realtime: t('messages.realtime'),
      }),
    [t],
  );

  const th: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-faint)',
    borderBottom: '2px solid var(--color-border)',
    background: 'var(--color-surface)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div
        style={{
          padding: '14px 20px 12px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Title row + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)', fontWeight: 500, letterSpacing: '0.02em' }}>{t('messages.currentTopic')}</span>
            <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}>{topicName}</span>
          </div>

          <div style={{ marginLeft: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <PrimaryBtn icon={<Play size={14} />} label={t('messages.fetch')} onClick={handleFetch} disabled={loading} />
            <ActionBtn icon={<Square size={13} />} label={t('messages.stop')} onClick={() => stopFetch(clusterId, topicName)} disabled={!loading} />
            <ActionBtn
              icon={<Radio size={14} className={liveMode ? 'spin-slow' : ''} />}
              label={t('messages.realtimeMode')}
              onClick={() => toggleLiveMode(clusterId, topicName)}
              active={liveMode}
            />
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ActionBtn
              icon={<Send size={14} />}
              label={t('messages.sendMessage')}
              onClick={() => {
                setClonePayload(null);
                setSendOpen(true);
              }}
            />
            <ActionBtn icon={<Download size={14} />} label={t('messages.exportMessages')} onClick={() => setExportOpen(true)} disabled={selectedIds.size === 0} />
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <FieldGroup label={t('messages.range')}>
            <select value={range} onChange={(e) => setRange(e.target.value as MessageRange)} style={selStyle}>
              {(Object.keys(rangeLabels) as MessageRange[]).map((k) => (
                <option key={k} value={k}>{rangeLabels[k]}</option>
              ))}
            </select>
          </FieldGroup>
          {range === 'offset' && (
            <input type="number" placeholder={t('messages.startOffset')} value={offsetValue} onChange={(e) => setOffsetValue(e.target.value)} style={inpStyle} />
          )}
          {range === 'timestamp' && (
            <input type="datetime-local" step="0.001" value={timestampValue} onChange={(e) => setTimestampValue(e.target.value)} style={inpStyle} />
          )}
          <FieldGroup label={t('messages.partition')}>
            <select value={fetchPartition} onChange={(e) => setFetchPartition(e.target.value)} style={selStyle}>
              <option value="">{t('messages.allPartitions')}</option>
              {partitions.map((p) => (
                <option key={p} value={String(p)}>{p}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label={t('messages.batch')}>
            <select value={countSel} onChange={(e) => setCountSel(e.target.value)} style={selStyle}>
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
              <option value="custom">{t('messages.custom')}</option>
            </select>
          </FieldGroup>
          {countSel === 'custom' && (
            <input
              type="number"
              min={1}
              value={customCount}
              onChange={(e) => setCustomCount(Math.max(1, Number(e.target.value) || 1))}
              style={{ ...inpStyle, width: 88 }}
            />
          )}

          <div style={{ flex: 1 }} />

          {liveMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'var(--font-heading)' }}>
              <span className="live-dot" />
              <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{t('messages.live')}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{msgsPerSec} {t('messages.perSecond')}</span>
            </div>
          )}

          <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
            {t('messages.loaded')}:<strong style={{ color: 'var(--color-text-muted)' }}>{fetchProgress.loaded}</strong> /{' '}
            <strong style={{ color: 'var(--color-text-muted)' }}>{fetchProgress.target || '—'}</strong>{' '}
            {t('messages.messagesUnit')}
          </span>
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              flex: '1 1 300px',
              maxWidth: 600,
            }}
          >
            <Filter size={14} color="var(--color-text-faint)" style={{ flexShrink: 0 }} />
            <input
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              placeholder={t('messages.searchKeywordPlaceholder')}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: 'var(--color-text)',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          <select value={filterField} onChange={(e) => setFilterField(e.target.value as FilterField)} style={selStyle}>
            {FILTER_FIELDS.map((f) => (
              <option key={f} value={f}>{filterFieldLabel(f, t)}</option>
            ))}
          </select>

          <input
            value={filterJsonPath}
            onChange={(e) => setFilterJsonPath(e.target.value)}
            placeholder={t('messages.jsonpathPlaceholder')}
            style={{ ...inpStyle, width: 160, fontFamily: 'var(--font-heading)', fontSize: 12 }}
          />

          <button
            type="button"
            onClick={() => setUseRegex(!useRegex)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-heading)',
              border: `1px solid ${useRegex ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-sm)',
              background: useRegex ? 'var(--color-primary-muted)' : 'var(--color-surface)',
              color: useRegex ? 'var(--color-primary)' : 'var(--color-text-faint)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            {t('messages.regex')}
          </button>

          <button
            type="button"
            onClick={() => setExtraFilters((x) => [...x, { id: `${Date.now()}`, field: 'Value', value: '', regex: false, logic: 'AND' }])}
            style={dashedStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            <Plus size={13} /> {t('messages.addFilter')}
          </button>

          {extraFilters.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', fontSize: 12 }}>
              <button
                type="button"
                onClick={() =>
                  setExtraFilters((rows) =>
                    rows.map((r) => (r.id === f.id ? { ...r, logic: r.logic === 'AND' ? 'OR' : 'AND' } : r)),
                  )
                }
                style={{ border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 'var(--radius-xs)', background: 'var(--color-primary-muted)', color: 'var(--color-primary)', fontWeight: 700, fontSize: 10, fontFamily: 'var(--font-heading)' }}
              >
                {f.logic === 'AND' ? t('messages.filterAnd') : t('messages.filterOr')}
              </button>
              <select
                value={f.field}
                onChange={(e) =>
                  setExtraFilters((rows) => rows.map((r) => (r.id === f.id ? { ...r, field: e.target.value as FilterField } : r)))
                }
                style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text-muted)', fontSize: 12 }}
              >
                {FILTER_FIELDS.map((fld) => (
                  <option key={fld} value={fld}>{filterFieldLabel(fld, t)}</option>
                ))}
              </select>
              <input
                placeholder={t('messages.jsonpath')}
                title={t('messages.jsonpath')}
                style={{ width: 64, padding: '2px 6px', fontSize: 11, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-xs)', color: 'var(--color-text)' }}
                value={f.jsonPath ?? ''}
                onChange={(e) =>
                  setExtraFilters((rows) => rows.map((r) => (r.id === f.id ? { ...r, jsonPath: e.target.value || undefined } : r)))
                }
              />
              <input
                value={f.value}
                onChange={(e) => setExtraFilters((rows) => rows.map((r) => (r.id === f.id ? { ...r, value: e.target.value } : r)))}
                placeholder={t('common.value')}
                style={{ width: 80, padding: '2px 6px', border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => setExtraFilters((rows) => rows.filter((r) => r.id !== f.id))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-faint)'; }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Message table */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {sortedMessages.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--color-text-faint)' }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed var(--color-border)',
            }}>
              <Inbox size={36} strokeWidth={1.2} color="var(--color-border)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t('messages.noMessages')}</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>{emptyHint}</p>
            </div>
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={sortedMessages}
            fixedHeaderContent={() => (
              <tr>
                <th style={{ ...th, width: 88 }}>{t('messages.partition')}</th>
                <th style={{ ...th, width: 108, cursor: 'pointer' }} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  {t('messages.offset')} {sortDir === 'asc' ? <ChevronUp size={12} style={{ verticalAlign: 'middle' }} /> : <ChevronDown size={12} style={{ verticalAlign: 'middle' }} />}
                </th>
                <th style={{ ...th, width: 200 }}>{t('messages.timestamp')}</th>
                <th style={th}>{t('messages.key')}</th>
                <th style={th}>{t('messages.value')}</th>
                <th style={{ ...th, width: 88 }}>{t('messages.headers')}</th>
                <th style={{ ...th, width: 72 }}>{t('messages.size')}</th>
              </tr>
            )}
            components={{
              TableRow: (props) => {
                const { item: msg, children, ...rest } = props;
                const idx = (rest as { 'data-item-index'?: number })['data-item-index'] ?? -1;
                const id = msgId(msg);
                const isSel = selectedIds.has(id);
                const act = expanded && msgId(expanded) === id;
                return (
                  <tr
                    {...rest}
                    onClick={(e) => onRowMouse(e, idx, msg, idx)}
                    onContextMenu={(e) => onRowMouse(e, idx, msg, idx)}
                    style={{
                      ...((rest as { style?: React.CSSProperties }).style ?? {}),
                      background: act ? 'var(--color-primary-muted)' : isSel ? 'rgba(59,130,246,0.04)' : undefined,
                      borderLeft: act ? '3px solid var(--color-primary)' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    {children}
                  </tr>
                );
              },
            }}
            itemContent={(_index, msg) => (
              <>
                <td style={{ padding: '9px 14px', textAlign: 'center', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-muted)' }}>{msg.partition}</td>
                <td style={{ padding: '9px 14px', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-primary)', fontWeight: 600 }}>{msg.offset.toLocaleString()}</td>
                <td style={{ padding: '9px 14px', fontFamily: 'var(--font-heading)', fontSize: 11.5, whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{msg.timestamp}</td>
                <td style={{ padding: '9px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-heading)', fontSize: 12 }}>
                  {msg.key || <span style={{ color: 'var(--color-text-faint)', fontStyle: 'italic' }}>∅</span>}
                </td>
                <td style={{ padding: '9px 14px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }} title={msg.value}>
                  {truncate(msg.value, 200)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-heading)', fontWeight: 500, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
                    {Object.keys(msg.headers).length}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-heading)', fontSize: 11.5, color: 'var(--color-text-faint)' }}>{msg.size}B</td>
              </>
            )}
          />
        )}
      </div>

      {expanded && <DetailPanel message={expanded} onClose={() => setExpanded(null)} />}

      {/* Context menu */}
      {ctx && (
        <ul
          style={{
            position: 'fixed',
            left: ctx.x,
            top: ctx.y,
            zIndex: 2000,
            minWidth: 200,
            listStyle: 'none',
            margin: 0,
            padding: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-popup)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <CtxItem onClick={() => void navigator.clipboard?.writeText(ctx.msg.key)}>{t('messages.copyKey')}</CtxItem>
          <CtxItem onClick={() => void navigator.clipboard?.writeText(ctx.msg.value)}>{t('messages.copyValue')}</CtxItem>
          <CtxItem
            onClick={() =>
              void navigator.clipboard?.writeText(
                JSON.stringify(
                  { partition: ctx.msg.partition, offset: ctx.msg.offset, timestamp: ctx.msg.timestamp, key: ctx.msg.key, value: ctx.msg.value, headers: ctx.msg.headers, size: ctx.msg.size },
                  null,
                  2,
                ),
              )
            }
          >
            {t('messages.copyAsJson')}
          </CtxItem>
          <CtxItem
            onClick={async () => {
              const { save } = await import('@tauri-apps/plugin-dialog');
              const { writeTextFile } = await import('@tauri-apps/plugin-fs');
              const path = await save({ defaultPath: `msg-${ctx.msg.partition}-${ctx.msg.offset}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
              if (path) await writeTextFile(path, JSON.stringify({ key: ctx.msg.key, value: ctx.msg.value, headers: ctx.msg.headers }, null, 2));
              setCtx(null);
            }}
          >
            {t('messages.saveToFile')}
          </CtxItem>
          <CtxItem
            onClick={() => {
              setClonePayload({ key: ctx.msg.key, value: ctx.msg.value, headers: { ...ctx.msg.headers } });
              setCtx(null);
              setSendOpen(true);
            }}
          >
            {t('messages.cloneSend')}
          </CtxItem>
        </ul>
      )}

      <SendMessageDialog
        open={sendOpen}
        onClose={() => {
          setSendOpen(false);
          setClonePayload(null);
        }}
        clusterId={clusterId}
        topicName={topicName}
        initialKey={clonePayload?.key}
        initialValue={clonePayload?.value}
        initialHeaders={clonePayload?.headers}
      />
      <MessageExportDialog open={exportOpen} onClose={() => setExportOpen(false)} rows={selectedRows} />

      <style>{`
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        .spin-slow { animation: spin-slow 2.2s linear infinite; }
        @keyframes live-pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.35;transform:scale(0.9);} }
        .live-dot { display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--color-error-dot);box-shadow:0 0 8px rgba(239,68,68,0.5);animation:live-pulse 1s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'flex', gap: 6, alignItems: 'center', fontWeight: 500 }}>
      {label}
      {children}
    </label>
  );
}

function CtxItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => { onClick(); }}
        style={{
          width: '100%',
          textAlign: 'left',
          border: 'none',
          background: 'none',
          padding: '8px 14px',
          fontSize: 13,
          color: 'var(--color-text)',
          cursor: 'pointer',
          borderRadius: 'var(--radius-xs)',
          transition: 'background var(--transition-fast)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {children}
      </button>
    </li>
  );
}

function PrimaryBtn({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 16px',
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: disabled ? 'var(--color-surface-2)' : 'var(--color-primary)',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-primary-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition-fast)',
        boxShadow: disabled ? 'none' : '0 1px 3px rgba(59,130,246,0.3)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-primary-hover)';
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-primary)';
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  active,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-primary-muted)' : 'var(--color-surface)',
        color: active ? 'var(--color-primary)' : disabled ? 'var(--color-text-faint)' : 'var(--color-text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.borderColor = 'var(--color-primary)';
          e.currentTarget.style.color = 'var(--color-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.color = 'var(--color-text-muted)';
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const selStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 10px',
  fontSize: 13,
  cursor: 'pointer',
  transition: 'border-color var(--transition-fast)',
};

const inpStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  transition: 'border-color var(--transition-fast)',
};

const dashedStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  fontSize: 12,
  fontWeight: 500,
  border: '1px dashed var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'none',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
  transition: 'all var(--transition-fast)',
};
