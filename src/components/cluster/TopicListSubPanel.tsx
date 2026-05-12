/**
 * TopicListSubPanel — ClusterDashboard 中的 Topic 列表子面板
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Network,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import type { TopicInfo } from '../../types';
import { useT } from '../../i18n';

interface Props {
  clusterId: string;
}

type SortField = 'name' | 'partitionCount' | 'replicationFactor';

const EMPTY_TOPICS: TopicInfo[] = [];

export function TopicListSubPanel({ clusterId }: Props) {
  const t = useT();
  const topics = useClusterStore((s) => s.topics[clusterId] ?? EMPTY_TOPICS);
  const loading = useClusterStore((s) => s.loadingTopics[clusterId]);
  const loadTopics = useClusterStore((s) => s.loadTopics);
  const openTab = useUIStore((s) => s.openTab);
  const showInternal = useUIStore((s) => s.showInternalTopics);
  const toggleInternal = useUIStore((s) => s.toggleInternalTopics);

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    void loadTopics(clusterId);
  }, [clusterId, loadTopics]);

  const filtered = useMemo(() => {
    let list = showInternal ? topics : topics.filter((t) => !t.isInternal);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'partitionCount') cmp = a.partitionCount - b.partitionCount;
      else cmp = a.replicationFactor - b.replicationFactor;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [topics, showInternal, search, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ verticalAlign: 'middle', marginLeft: 2 }} />
      : <ChevronDown size={12} style={{ verticalAlign: 'middle', marginLeft: 2 }} />;
  };

  const openTopicData = (topic: TopicInfo) => {
    openTab({ type: 'topic-data', clusterId, topicName: topic.name }, topic.name, 'list');
  };

  const thStyle: CSSProperties = {
    padding: '8px 14px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-faint)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontFamily: 'var(--font-body)',
    textAlign: 'left',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-body)' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        <Network size={16} strokeWidth={2} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
        <h2
          style={{
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          {t('topicList.title')}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
          ({filtered.length})
        </span>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'relative' }}>
          <Search
            size={12}
            strokeWidth={2}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--color-text-faint)',
            }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('topicList.search')}
            aria-label={t('topicList.searchAria')}
            style={{
              padding: '5px 10px 5px 26px',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              outline: 'none',
              width: 200,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showInternal}
            onChange={toggleInternal}
            style={{ accentColor: 'var(--color-primary)' }}
          />
          {t('topicList.showInternal')}
        </label>

        <button
          type="button"
          aria-label={t('topicList.refresh')}
          onClick={() => void loadTopics(clusterId)}
          disabled={!!loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            background: 'var(--color-surface)',
            color: loading ? 'var(--color-text-faint)' : 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 12,
          }}
        >
          {loading
            ? <Loader2 size={12} className="animate-km-spin" />
            : <RefreshCw size={12} />}
          {t('common.refresh')}
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={thStyle} onClick={() => toggleSort('name')}>
                {t('topicList.columnName')} <SortIcon field="name" />
              </th>
              <th style={{ ...thStyle, textAlign: 'right', width: 100 }} onClick={() => toggleSort('partitionCount')}>
                {t('topicList.columnPartitionCount')} <SortIcon field="partitionCount" />
              </th>
              <th style={{ ...thStyle, textAlign: 'right', width: 100 }} onClick={() => toggleSort('replicationFactor')}>
                {t('topicList.columnReplicationFactor')} <SortIcon field="replicationFactor" />
              </th>
              <th style={{ ...thStyle, textAlign: 'center', width: 80 }}>
                {t('topicList.columnType')}
              </th>
              <th style={{ ...thStyle, textAlign: 'center', width: 100 }}>
                {t('topicList.columnActions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <Loader2 size={28} style={{ animation: 'km-spin 0.9s linear infinite', display: 'inline-block' }} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {search ? t('topicList.noMatch') : t('topicList.noTopics')}
                </td>
              </tr>
            ) : (
              filtered.map((topic, i) => (
                <tr
                  key={topic.name}
                  tabIndex={0}
                  role="button"
                  onClick={() => openTopicData(topic)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openTopicData(topic);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    transition: 'background var(--transition-fast)',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'; }}
                >
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text)' }}>
                    {topic.name}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {topic.partitionCount}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {topic.replicationFactor}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    {topic.isInternal ? (
                      <span style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 10,
                        background: 'rgba(245,158,11,0.12)',
                        color: '#F59E0B',
                        border: '1px solid rgba(245,158,11,0.25)',
                      }}>
                        {t('topicList.badgeInternal')}
                      </span>
                    ) : (
                      <span style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 10,
                        background: 'var(--color-primary-muted)',
                        color: 'var(--color-primary)',
                        border: '1px solid var(--color-primary)',
                      }}>
                        {t('topicList.badgeUser')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      title={t('topicList.viewMessages')}
                      onClick={(e) => {
                        e.stopPropagation();
                        openTopicData(topic);
                      }}
                      style={{
                        padding: '3px 6px',
                        background: 'none',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Eye size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
