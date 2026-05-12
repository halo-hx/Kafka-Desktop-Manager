/**
 * ClusterSidebar — 左侧集群连接树形导航
 * Design: ui-ux-pro-max · Palette: Code Dark + Run Green · Font: Fira Code / Fira Sans
 */
import React, { useState, useCallback, useRef, KeyboardEvent } from 'react';
import { useT } from '../../i18n';

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface ClusterConnection {
  id: string;
  name: string;
  status: ConnectionStatus;
  isFavorite?: boolean;
  colorTag?: string;
  groupId?: string;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  parentId?: string;
  connections: ClusterConnection[];
  isExpanded?: boolean;
}

interface Props {
  groups: ConnectionGroup[];
  ungrouped: ClusterConnection[];
  totalConnected: number;
  onNewConnection: () => void;
  onImport: () => void;
  onSelectConnection: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'connection' | 'group', id: string) => void;
  selectedId?: string;
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'var(--color-connected)',
  disconnected: 'var(--color-disconnected)',
  error: 'var(--color-error-dot)',
};

function useStatusLabels(): Record<ConnectionStatus, string> {
  const t = useT();
  return {
    connected: t('sidebar.status.connected'),
    disconnected: t('sidebar.status.disconnected'),
    error: t('sidebar.status.error'),
  };
}

const COLOR_TAG_MAP: Record<string, string> = {
  red: '#EF4444', orange: '#F97316', yellow: '#EAB308',
  green: '#22C55E', blue: '#3B82F6', purple: '#A855F7',
};

function StatusDot({ status }: { status: ConnectionStatus }) {
  const labels = useStatusLabels();
  return (
    <span
      role="img"
      aria-label={labels[status]}
      title={labels[status]}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: STATUS_COLORS[status],
        flexShrink: 0,
        boxShadow: status === 'connected' ? `0 0 6px ${STATUS_COLORS.connected}` : 'none',
      }}
    />
  );
}

function ConnectionItem({
  connection,
  isSelected,
  onSelect,
  onContextMenu,
}: {
  connection: ClusterConnection;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
    if (e.key === 'ContextMenu') { e.preventDefault(); /* trigger via ref if needed */ }
  };

  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px 5px 28px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: isSelected ? 'var(--color-primary-muted)' : 'transparent',
        color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
        transition: 'background var(--transition-fast), color var(--transition-fast)',
        userSelect: 'none',
        outline: 'none',
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {connection.colorTag && COLOR_TAG_MAP[connection.colorTag] && (
        <span
          aria-hidden="true"
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: COLOR_TAG_MAP[connection.colorTag],
            flexShrink: 0,
          }}
        />
      )}
      <span style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 13,
        fontFamily: 'var(--font-body)',
      }}>
        {connection.name}
      </span>
      {connection.isFavorite && (
        <svg aria-label="Favorited" width="12" height="12" viewBox="0 0 24 24" fill="#EAB308">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      )}
      <StatusDot status={connection.status} />
    </li>
  );
}

function GroupItem({
  group,
  isSelected,
  selectedId,
  onSelect,
  onSelectConnection,
  onContextMenu,
}: {
  group: ConnectionGroup;
  isSelected: boolean;
  selectedId?: string;
  onSelect: () => void;
  onSelectConnection: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'connection' | 'group', id: string) => void;
}) {
  const [expanded, setExpanded] = useState(group.isExpanded ?? true);

  const toggle = () => setExpanded(v => !v);

  return (
    <li role="treeitem" aria-expanded={expanded}>
      <div
        tabIndex={0}
        onClick={toggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
        onContextMenu={e => onContextMenu(e, 'group', group.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          transition: 'color var(--transition-fast)',
          userSelect: 'none',
          outline: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
      >
        {/* Chevron */}
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform var(--transition-fast)', flexShrink: 0 }}
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        {/* Folder icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.name}
        </span>
        <span style={{ color: 'var(--color-text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          {group.connections.length}
        </span>
      </div>

      {expanded && (
        <ul role="group" style={{ listStyle: 'none' }}>
          {group.connections.map(conn => (
            <ConnectionItem
              key={conn.id}
              connection={conn}
              isSelected={selectedId === conn.id}
              onSelect={() => onSelectConnection(conn.id)}
              onContextMenu={e => onContextMenu(e, 'connection', conn.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ClusterSidebar({
  groups,
  ungrouped,
  totalConnected,
  onNewConnection,
  onImport,
  onSelectConnection,
  onContextMenu,
  selectedId,
}: Props) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filterConns = useCallback(
    (conns: ClusterConnection[]) =>
      search ? conns.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : conns,
    [search]
  );

  const totalClusters = groups.reduce((a, g) => a + g.connections.length, 0) + ungrouped.length;

  return (
    <aside
      aria-label="集群连接列表"
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-min)',
        maxWidth: 'var(--sidebar-max)',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div style={{
        padding: '12px 12px 8px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* New Connection */}
          <button
            aria-label="新建连接"
            onClick={onNewConnection}
            title="新建连接 (Cmd+N)"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--color-primary)',
              color: 'var(--color-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background var(--transition-fast)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新建连接
          </button>

          {/* Import */}
          <button
            aria-label="导入连接配置"
            onClick={onImport}
            title="导入连接配置"
            style={{
              padding: '6px 8px',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background var(--transition-fast), color var(--transition-fast)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--color-surface-2)';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg
            aria-hidden="true"
            width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="var(--color-text-faint)" strokeWidth="2"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            type="search"
            aria-label="搜索连接"
            placeholder="搜索连接... (Cmd+F)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px 5px 28px',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              outline: 'none',
              transition: 'border-color var(--transition-fast)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
          />
        </div>
      </div>

      {/* Tree */}
      <nav aria-label="集群树形导航" style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
        <ul role="tree" aria-label="集群连接" style={{ listStyle: 'none' }}>

          {/* Favorites (if any) */}
          {ungrouped.filter(c => c.isFavorite).length > 0 && (
            <li role="treeitem">
              <div style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-text-faint)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#EAB308">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                收藏夹
              </div>
              <ul role="group" style={{ listStyle: 'none' }}>
                {filterConns(ungrouped.filter(c => c.isFavorite)).map(conn => (
                  <ConnectionItem
                    key={conn.id}
                    connection={conn}
                    isSelected={selectedId === conn.id}
                    onSelect={() => onSelectConnection(conn.id)}
                    onContextMenu={e => onContextMenu(e, 'connection', conn.id)}
                  />
                ))}
              </ul>
            </li>
          )}

          {/* Groups */}
          {groups.map(group => (
            <GroupItem
              key={group.id}
              group={{ ...group, connections: filterConns(group.connections) }}
              isSelected={false}
              selectedId={selectedId}
              onSelect={() => {}}
              onSelectConnection={onSelectConnection}
              onContextMenu={onContextMenu}
            />
          ))}

          {/* Ungrouped */}
          {filterConns(ungrouped.filter(c => !c.isFavorite)).map(conn => (
            <ConnectionItem
              key={conn.id}
              connection={conn}
              isSelected={selectedId === conn.id}
              onSelect={() => onSelectConnection(conn.id)}
              onContextMenu={e => onContextMenu(e, 'connection', conn.id)}
            />
          ))}
        </ul>
      </nav>

      {/* Status bar */}
      <footer style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--color-border-subtle)',
        fontSize: 11,
        color: 'var(--color-text-faint)',
        fontFamily: 'var(--font-heading)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <StatusDot status="connected" />
        <span>共 <strong style={{ color: 'var(--color-text-muted)' }}>{totalClusters}</strong> 个集群，
          <strong style={{ color: 'var(--color-primary)' }}>{totalConnected}</strong> 个已连接
        </span>
      </footer>
    </aside>
  );
}
