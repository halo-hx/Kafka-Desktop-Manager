/**
 * 集群连接侧边栏 — 数据与树状态来自 Zustand
 */
import React, { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ClusterConnection as ClusterConnectionRecord, ConnectionStatus } from '../../types';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  Folder,
  Link2,
  Pencil,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  Unplug,
  Upload,
} from 'lucide-react';
import { useConnectionDialogContext } from '../../contexts/connectionDialogContext';
import { useDataDialogs } from '../../contexts/dataDialogContext';
import { useConnectionStore } from '../../stores/connectionStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import { useT } from '../../i18n';

type TreeCtxKind = 'group' | 'connection';

interface TreeCtx {
  clientX: number;
  clientY: number;
  kind: TreeCtxKind;
  connectionId?: string;
  groupId?: string;
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'var(--color-connected)',
  disconnected: 'var(--color-disconnected)',
  connecting: 'var(--color-warning)',
  error: 'var(--color-error-dot)',
};

const COLOR_TAG_MAP: Record<string, string> = {
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#EAB308',
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#A855F7',
};

function StatusDot({ status }: { status: ConnectionStatus }) {
  const t = useT();
  const label =
    status === 'connected'
      ? t('sidebar.status.connected')
      : status === 'disconnected'
        ? t('sidebar.status.disconnected')
        : status === 'connecting'
          ? t('sidebar.status.connecting')
          : t('sidebar.status.error');
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
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

export function ClusterSidebar() {
  const t = useT();
  const connections = useConnectionStore((s) => s.connections);
  const groups = useConnectionStore((s) => s.groups);
  const connectCluster = useConnectionStore((s) => s.connectCluster);
  const disconnectCluster = useConnectionStore((s) => s.disconnectCluster);
  const toggleFavorite = useConnectionStore((s) => s.toggleFavorite);
  const deleteConnection = useConnectionStore((s) => s.deleteConnection);
  const deleteGroup = useConnectionStore((s) => s.deleteGroup);
  const getConnection = useConnectionStore((s) => s.getConnection);

  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const expandedNodes = useUIStore((s) => s.expandedNodes);
  const toggleNode = useUIStore((s) => s.toggleNode);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const openTab = useUIStore((s) => s.openTab);

  const loadClusterOverview = useClusterStore((s) => s.loadClusterOverview);

  const { openConnectionDialog } = useConnectionDialogContext();
  const { openConnectionExport, openConnectionImport } = useDataDialogs();

  const [search, setSearch] = useState('');
  const [treeMenu, setTreeMenu] = useState<TreeCtx | null>(null);
  const [clusterRootMenu, setClusterRootMenu] = useState<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const closeMenu = () => {
      setTreeMenu(null);
      setClusterRootMenu(null);
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    for (const c of connections) {
      if (c.status !== 'connected') continue;
      void loadClusterOverview(c.id);
    }
  }, [connections, loadClusterOverview]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [groups],
  );

  const groupedMap = useMemo(() => {
    const m = new Map<string | undefined, ClusterConnectionRecord[]>();
    for (const c of connections) {
      const gid = c.groupId ?? undefined;
      const prev = m.get(gid);
      if (prev) prev.push(c);
      else m.set(gid, [c]);
    }
    return m;
  }, [connections]);

  const filterConns = (conns: ClusterConnectionRecord[]) =>
    search.trim()
      ? conns.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
      : conns;

  const ungrouped = groupedMap.get(undefined) ?? [];
  const favorites = filterConns(ungrouped.filter((c) => c.isFavorite));
  const totalClusters = connections.length;
  const totalConnected = connections.filter((c) => c.status === 'connected').length;

  const selectStyle = (selected: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    userSelect: 'none',
    outline: 'none',
    transition: 'background var(--transition-fast), color var(--transition-fast)',
    background: selected ? 'var(--color-primary-muted)' : 'transparent',
    color: selected ? 'var(--color-primary)' : 'var(--color-text)',
    ...extra,
  });

  const openClusterDashboard = (conn: ClusterConnectionRecord) => {
    openTab({ type: 'cluster-dashboard', clusterId: conn.id }, conn.name, 'layout-dashboard');
  };

  const renderConnectionItem = (conn: ClusterConnectionRecord) => {
    const connected = conn.status === 'connected';
    const selected = selectedNodeId === `conn:${conn.id}`;

    return (
      <li key={conn.id} role="treeitem">
        <div
          role="treeitem"
          tabIndex={0}
          aria-selected={selected}
          onClick={() => {
            setSelectedNode(`conn:${conn.id}`);
            if (connected) {
              openClusterDashboard(conn);
            } else if (conn.status !== 'connecting') {
              void connectCluster(conn.id);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedNode(`conn:${conn.id}`);
              if (connected) openClusterDashboard(conn);
              else if (conn.status !== 'connecting') void connectCluster(conn.id);
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (connected) {
              openClusterDashboard(conn);
            } else if (conn.status !== 'connecting') {
              void connectCluster(conn.id);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTreeMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              kind: 'connection',
              connectionId: conn.id,
            });
          }}
          style={selectStyle(selected, {
            padding: '6px 12px 6px 28px',
          })}
          onMouseEnter={(e) => {
            if (!selected) e.currentTarget.style.background = 'var(--color-surface-2)';
          }}
          onMouseLeave={(e) => {
            if (!selected) e.currentTarget.style.background = 'transparent';
          }}
        >
          {conn.colorTag && COLOR_TAG_MAP[conn.colorTag] && (
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: COLOR_TAG_MAP[conn.colorTag],
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              fontWeight: selected ? 600 : 400,
            }}
          >
            {conn.name}
          </span>
          {conn.isFavorite && (
            <Star size={12} fill="#EAB308" stroke="#EAB308" aria-label={t('sidebar.favorited')} />
          )}
          <StatusDot status={conn.status} />
        </div>
      </li>
    );
  };

  const renderGroup = (group: { id: string; name: string }) => {
    const groupExp = expandedNodes.has(`group:${group.id}`);
    const conns = filterConns(groupedMap.get(group.id) ?? []);
    return (
      <li key={group.id} role="treeitem" aria-expanded={groupExp}>
        <div
          tabIndex={0}
          onClick={() => toggleNode(`group:${group.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleNode(`group:${group.id}`);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setTreeMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              kind: 'group',
              groupId: group.id,
            });
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            outline: 'none',
            transition: 'color var(--transition-fast)',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          <span
            style={{
              display: 'inline-flex',
              transform: groupExp ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform var(--transition-fast)',
            }}
          >
            <ChevronRight size={12} strokeWidth={2.5} aria-hidden />
          </span>
          <Folder size={14} strokeWidth={2} aria-hidden />
          <span
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {group.name}
          </span>
          <span style={{ color: 'var(--color-text-faint)', fontWeight: 400, letterSpacing: 0 }}>
            {conns.length}
          </span>
        </div>
        {groupExp && (
          <ul role="group" style={{ listStyle: 'none' }}>
            {conns.map((c) => renderConnectionItem(c))}
          </ul>
        )}
      </li>
    );
  };

  const COLLAPSED_WIDTH = 56;
  const asideStyles: React.CSSProperties = sidebarCollapsed
    ? {
        width: COLLAPSED_WIDTH,
        minWidth: COLLAPSED_WIDTH,
        maxWidth: COLLAPSED_WIDTH,
        flexShrink: 0,
      }
    : {
        width: sidebarWidth,
        minWidth: 200,
        maxWidth: 360,
        flexShrink: 0,
      };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 4000,
    minWidth: 180,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-popup)',
    overflow: 'hidden',
    padding: 4,
  };

  return (
    <>
      <aside
        aria-label={t('sidebar.clusterList')}
        style={{
          ...asideStyles,
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {sidebarCollapsed ? (
          <CollapsedSidebar
            connections={connections}
            selectedNodeId={selectedNodeId}
            onToggle={toggleSidebar}
            onSelect={(conn) => {
              setSelectedNode(`conn:${conn.id}`);
              if (conn.status === 'connected') {
                openClusterDashboard(conn);
              } else if (conn.status !== 'connecting') {
                void connectCluster(conn.id);
              }
            }}
            onNewConnection={() => openConnectionDialog()}
            onOpenSettings={() => openTab({ type: 'settings' }, t('settings.title'), 'settings')}
            totalConnected={totalConnected}
            totalClusters={totalClusters}
            expandLabel={t('sidebar.expandSidebar')}
            newConnectionLabel={t('sidebar.newConnection')}
            settingsLabel={t('sidebar.settings')}
          />
        ) : (
          <>
            <div
              style={{
                padding: '12px 12px 10px',
                borderBottom: '1px solid var(--color-border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <SidebarIconBtn
                  icon={<ChevronLeft size={16} strokeWidth={2} />}
                  label={t('sidebar.collapseSidebar')}
                  onClick={toggleSidebar}
                />
                <button
                  type="button"
                  aria-label={t('sidebar.newConnection')}
                  onClick={() => openConnectionDialog()}
                  title={t('sidebar.newConnection')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '7px 12px',
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
                    boxShadow: '0 1px 3px rgba(22,119,255,0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-primary-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--color-primary)';
                  }}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  {t('sidebar.newConnection')}
                </button>
                <SidebarIconBtn
                  icon={<Download size={14} strokeWidth={2} />}
                  label={t('sidebar.exportConfig')}
                  onClick={() => openConnectionExport()}
                />
                <SidebarIconBtn
                  icon={<Upload size={14} strokeWidth={2} />}
                  label={t('sidebar.importConfig')}
                  onClick={() => openConnectionImport()}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  strokeWidth={2}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--color-text-faint)',
                  }}
                />
                <input
                  ref={searchRef}
                  type="search"
                  aria-label={t('sidebar.searchConnections')}
                  placeholder={t('sidebar.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 30px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    outline: 'none',
                    transition:
                      'border-color var(--transition-fast), box-shadow var(--transition-fast)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.boxShadow = '0 0 0 2px var(--color-primary-muted)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            <nav
              aria-label={t('sidebar.clusterTree')}
              style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}
            >
              <div
                role="presentation"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setClusterRootMenu({ clientX: e.clientX, clientY: e.clientY });
                }}
                style={{
                  padding: '6px 12px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                  textTransform: 'uppercase',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {t('sidebar.clusters')}
              </div>
              <ul
                role="tree"
                aria-label={t('sidebar.clusterConnections')}
                style={{ listStyle: 'none' }}
              >
                {favorites.length > 0 && (
                  <li role="treeitem">
                    <div
                      style={{
                        padding: '4px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-text-faint)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Star size={11} strokeWidth={0} fill="#EAB308" aria-hidden />
                      {t('sidebar.favorites')}
                    </div>
                    <ul role="group" style={{ listStyle: 'none' }}>
                      {favorites.map((conn) => renderConnectionItem(conn))}
                    </ul>
                  </li>
                )}
                {sortedGroups.map((g) => renderGroup({ id: g.id, name: g.name }))}
                {filterConns(ungrouped.filter((c) => !c.isFavorite)).map((conn) =>
                  renderConnectionItem(conn),
                )}
              </ul>
            </nav>

            <footer
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--color-border-subtle)',
                fontSize: 11,
                color: 'var(--color-text-faint)',
                fontFamily: 'var(--font-body)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <StatusDot status="connected" />
              <span>
                <strong style={{ color: 'var(--color-text-muted)' }}>{totalConnected}</strong>/
                <strong style={{ color: 'var(--color-text-muted)' }}>{totalClusters}</strong>{' '}
                {t('sidebar.connectedCount')}
              </span>
              <button
                type="button"
                aria-label={t('sidebar.settings')}
                title={t('sidebar.settings')}
                onClick={() => openTab({ type: 'settings' }, t('settings.title'), 'settings')}
                style={{
                  marginLeft: 'auto',
                  padding: 6,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-primary)';
                  e.currentTarget.style.background = 'var(--color-surface-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Settings size={15} strokeWidth={2} />
              </button>
            </footer>
          </>
        )}
      </aside>

      {treeMenu && treeMenu.kind === 'connection' && treeMenu.connectionId && (
        <div
          role="menu"
          aria-label={t('sidebar.menu.connectionActions')}
          style={{ ...menuStyle, left: treeMenu.clientX, top: treeMenu.clientY }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const c = getConnection(treeMenu.connectionId as string);
            if (!c) return null;
            return (
              <>
                {c.status === 'disconnected' || c.status === 'error' ? (
                  <MenuBtn
                    label={t('sidebar.menu.connect')}
                    icon={<Link2 size={14} />}
                    onClick={() => {
                      void connectCluster(c.id);
                      setTreeMenu(null);
                    }}
                  />
                ) : (
                  <MenuBtn
                    label={t('sidebar.menu.disconnect')}
                    icon={<Unplug size={14} />}
                    onClick={() => {
                      void disconnectCluster(c.id);
                      setTreeMenu(null);
                    }}
                  />
                )}
                <MenuBtn
                  label={t('sidebar.menu.editConfig')}
                  icon={<Pencil size={14} />}
                  onClick={() => {
                    openConnectionDialog({ connectionId: c.id });
                    setTreeMenu(null);
                  }}
                />
                <MenuBtn
                  label={t('sidebar.menu.toggleFavorite')}
                  icon={<Star size={14} />}
                  onClick={() => {
                    void toggleFavorite(c.id);
                    setTreeMenu(null);
                  }}
                />
                <Divider />
                <MenuBtn
                  label={t('sidebar.menu.deleteConnection')}
                  icon={<Trash2 size={14} />}
                  accent
                  onClick={() => {
                    void deleteConnection(c.id);
                    setTreeMenu(null);
                  }}
                />
              </>
            );
          })()}
        </div>
      )}

      {treeMenu && treeMenu.kind === 'group' && treeMenu.groupId && (
        <div
          role="menu"
          aria-label={t('sidebar.menu.groupActions')}
          style={{ ...menuStyle, left: treeMenu.clientX, top: treeMenu.clientY, minWidth: 160 }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuBtn
            label={t('sidebar.menu.deleteGroup')}
            accent
            icon={<Trash2 size={14} />}
            onClick={() => {
              void deleteGroup(treeMenu.groupId!);
              setTreeMenu(null);
            }}
          />
        </div>
      )}

      {clusterRootMenu && (
        <div
          role="menu"
          aria-label={t('sidebar.menu.clusterMenu')}
          style={{ ...menuStyle, left: clusterRootMenu.clientX, top: clusterRootMenu.clientY }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuBtn
            label={t('sidebar.exportConfig')}
            icon={<Download size={14} />}
            onClick={() => {
              openConnectionExport();
              setClusterRootMenu(null);
            }}
          />
          <MenuBtn
            label={t('sidebar.importConfig')}
            icon={<Upload size={14} />}
            onClick={() => {
              openConnectionImport();
              setClusterRootMenu(null);
            }}
          />
        </div>
      )}
    </>
  );
}

function SidebarIconBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '6px 8px',
        background: 'var(--color-surface)',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-primary)';
        e.currentTarget.style.color = 'var(--color-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.color = 'var(--color-text-muted)';
      }}
    >
      {icon}
    </button>
  );
}

interface CollapsedSidebarProps {
  connections: ClusterConnectionRecord[];
  selectedNodeId: string | null;
  onToggle: () => void;
  onSelect: (conn: ClusterConnectionRecord) => void;
  onNewConnection: () => void;
  onOpenSettings: () => void;
  totalConnected: number;
  totalClusters: number;
  expandLabel: string;
  newConnectionLabel: string;
  settingsLabel: string;
}

function CollapsedSidebar({
  connections,
  selectedNodeId,
  onToggle,
  onSelect,
  onNewConnection,
  onOpenSettings,
  totalConnected,
  totalClusters,
  expandLabel,
  newConnectionLabel,
  settingsLabel,
}: CollapsedSidebarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '12px 0 10px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <CollapsedIconBtn
          icon={<ChevronRight size={16} strokeWidth={2.2} />}
          label={expandLabel}
          onClick={onToggle}
        />
        <CollapsedIconBtn
          icon={<Plus size={16} strokeWidth={2.4} />}
          label={newConnectionLabel}
          primary
          onClick={onNewConnection}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {connections.map((conn) => {
          const selected = selectedNodeId === `conn:${conn.id}`;
          const initials = conn.name.trim().slice(0, 2).toUpperCase() || '??';
          const tagColor = conn.colorTag ? COLOR_TAG_MAP[conn.colorTag] : undefined;
          return (
            <button
              key={conn.id}
              type="button"
              aria-label={`${conn.name} · ${conn.status}`}
              title={conn.name}
              aria-current={selected}
              onClick={() => onSelect(conn)}
              style={{
                position: 'relative',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: selected ? 'var(--color-primary-muted)' : 'transparent',
                color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)',
                border: '1px solid',
                borderColor: selected ? 'var(--color-primary)' : 'transparent',
                transition: 'all var(--transition-fast)',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.background = 'var(--color-surface-2)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                }
              }}
            >
              {initials === '??' ? (
                <Database size={16} strokeWidth={2} />
              ) : (
                <span
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  {initials}
                </span>
              )}
              {tagColor && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: -1,
                    top: 6,
                    bottom: 6,
                    width: 3,
                    borderRadius: 2,
                    background: tagColor,
                  }}
                />
              )}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: STATUS_COLORS[conn.status],
                  border: '2px solid var(--color-surface)',
                  boxShadow:
                    conn.status === 'connected' ? `0 0 4px ${STATUS_COLORS.connected}` : 'none',
                }}
              />
            </button>
          );
        })}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          padding: '8px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div
          aria-label={`${totalConnected}/${totalClusters}`}
          title={`${totalConnected}/${totalClusters}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: 10,
            color: 'var(--color-text-faint)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.2,
          }}
        >
          <strong style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            {totalConnected}
          </strong>
          <span style={{ opacity: 0.6 }}>/{totalClusters}</span>
        </div>
        <CollapsedIconBtn
          icon={<Settings size={15} strokeWidth={2} />}
          label={settingsLabel}
          onClick={onOpenSettings}
        />
      </div>
    </div>
  );
}

function CollapsedIconBtn({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: primary ? 'var(--color-primary)' : 'transparent',
        color: primary ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
        border: primary ? 'none' : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        padding: 0,
        transition: 'all var(--transition-fast)',
        boxShadow: primary ? '0 1px 3px rgba(22,119,255,0.25)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (primary) {
          e.currentTarget.style.background = 'var(--color-primary-hover)';
        } else {
          e.currentTarget.style.borderColor = 'var(--color-primary)';
          e.currentTarget.style.color = 'var(--color-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (primary) {
          e.currentTarget.style.background = 'var(--color-primary)';
        } else {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.color = 'var(--color-text-muted)';
        }
      }}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />;
}

function MenuBtn({
  label,
  onClick,
  accent,
  icon,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick();
      }}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        background: 'none',
        border: 'none',
        color: accent ? 'var(--color-error)' : 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        cursor: 'pointer',
        borderRadius: 'var(--radius-xs)',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      <span style={{ flexShrink: 0, opacity: accent ? 1 : 0.75 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
