/**
 * Spotlight 风格命令面板 — 模糊搜索、分组、键盘导航、焦点陷阱
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  Download,
  Eye,
  FilePlus,
  Layers,
  List,
  Network,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useConnectionDialogContext } from '../../contexts/connectionDialogContext';
import { CreateTopicDialog } from '../topic/CreateTopicDialog';
import { refreshActiveView } from '../../lib/refreshActiveView';
import { useT } from '../../i18n';

const RECENT_KEY = 'km-command-palette-recent';
const RECENT_MAX = 12;

function useIsApple(): boolean {
  const [v, setV] = useState(true);
  useEffect(() => {
    setV(/Mac|iPhone|iPod|iPad/i.test(navigator.userAgent || navigator.platform || ''));
  }, []);
  return v;
}

function modShortcut(label: string, apple: boolean): string {
  if (!label) return '';
  return apple ? label : label.replace(/⌘/g, 'Ctrl+');
}

function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 + (200 - t.indexOf(q));
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return 0;
    ti = idx + 1;
  }
  return 40;
}

type CommandDef = {
  id: string;
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  category: string;
  action: () => void;
};

function loadRecent(): string[] {
  try {
    const r = localStorage.getItem(RECENT_KEY);
    const p = r ? JSON.parse(r) : [];
    return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}

type ResourceRow = {
  id: string;
  kind: 'cluster' | 'topic' | 'group';
  label: string;
  sub: string;
  clusterId: string;
  meta?: string;
  icon: LucideIcon;
};

type FlatRow =
  | { type: 'header'; title: string; icon?: LucideIcon }
  | { type: 'command'; def: CommandDef }
  | { type: 'resource'; res: ResourceRow };

export function CommandPalette() {
  const t = useT();
  const apple = useIsApple();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openTab = useUIStore((s) => s.openTab);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleInternalTopics = useUIStore((s) => s.toggleInternalTopics);

  const { openConnectionDialog } = useConnectionDialogContext();
  const connections = useConnectionStore((s) => s.connections);
  const getConnected = useConnectionStore((s) => s.getConnectedClusters);
  const loadTopics = useClusterStore((s) => s.loadTopics);
  const topicsMap = useClusterStore((s) => s.topics);
  const groupsMap = useClusterStore((s) => s.consumerGroups);

  const [query, setQuery] = useState('');
  const [highlightSlot, setHighlightSlot] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const highlightedRowRef = useRef<HTMLButtonElement>(null);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecent());
  const [createTopicClusterId, setCreateTopicClusterId] = useState<string | null>(null);

  const pushRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      saveRecent(next);
      return next;
    });
  }, []);

  const resolveCreateTopicCluster = useCallback((): string | null => {
    const ui = useUIStore.getState();
    const active = ui.tabs.find((t) => t.id === ui.activeTabId);
    const panel = active?.panel;
    let cid =
      panel &&
      typeof panel === 'object' &&
      'clusterId' in panel &&
      typeof (panel as { clusterId: string }).clusterId === 'string'
        ? (panel as { clusterId: string }).clusterId
        : '';
    if (!cid) {
      const first = useConnectionStore.getState().getConnectedClusters()[0];
      cid = first?.id ?? '';
    }
    return cid || null;
  }, []);

  const commandDefs: CommandDef[] = useMemo(
    () => [
      {
        id: 'new-connection',
        label: t('command.newConnection'),
        shortcut: modShortcut('⌘N', apple),
        icon: Plus,
        category: t('command.catConnection'),
        action: () => openConnectionDialog(),
      },
      {
        id: 'settings',
        label: t('command.openSettings'),
        shortcut: modShortcut('⌘,', apple),
        icon: Settings,
        category: t('command.catApp'),
        action: () => openTab({ type: 'settings' }, t('settings.title'), 'settings'),
      },
      {
        id: 'create-topic',
        label: t('command.createTopic'),
        icon: FilePlus,
        category: t('command.catTopic'),
        action: () => {
          const cid = resolveCreateTopicCluster();
          if (!cid) {
            window.alert(t('command.connectFirst'));
            return;
          }
          setCreateTopicClusterId(cid);
        },
      },
      {
        id: 'import-connections',
        label: t('command.importConnections'),
        icon: Upload,
        category: t('command.catConnection'),
        action: () => window.alert(t('command.importLater')),
      },
      {
        id: 'export-connections',
        label: t('command.exportConnections'),
        icon: Download,
        category: t('command.catConnection'),
        action: () => window.alert(t('command.exportLater')),
      },
      {
        id: 'refresh',
        label: t('command.refreshView'),
        shortcut: modShortcut('⌘R', apple),
        icon: RefreshCw,
        category: t('command.catView'),
        action: () => refreshActiveView(),
      },
      {
        id: 'toggle-sidebar',
        label: t('command.toggleSidebar'),
        icon: PanelLeft,
        category: t('command.catView'),
        action: () => toggleSidebar(),
      },
      {
        id: 'toggle-internal-topics',
        label: t('command.toggleInternalTopics'),
        icon: Eye,
        category: t('command.catView'),
        action: () => toggleInternalTopics(),
      },
    ],
    [
      apple,
      openConnectionDialog,
      openTab,
      resolveCreateTopicCluster,
      t,
      toggleInternalTopics,
      toggleSidebar,
    ],
  );

  const resources: ResourceRow[] = useMemo(() => {
    const rows: ResourceRow[] = [];
    for (const c of connections) {
      rows.push({
        id: `res-cluster-${c.id}`,
        kind: 'cluster',
        label: c.name || c.id,
        sub: t('command.resCluster'),
        clusterId: c.id,
        icon: Network,
      });
    }
    const connected = getConnected();
    for (const c of connected) {
      const cid = c.id;
      const topicList = topicsMap[cid] ?? [];
      for (const topic of topicList.slice(0, 200)) {
        rows.push({
          id: `res-topic-${cid}-${topic.name}`,
          kind: 'topic',
          label: topic.name,
          sub: t('command.resTopic'),
          clusterId: cid,
          meta: c.name,
          icon: List,
        });
      }
      const groups = groupsMap[cid] ?? [];
      for (const g of groups.slice(0, 200)) {
        rows.push({
          id: `res-group-${cid}-${g.groupId}`,
          kind: 'group',
          label: g.groupId,
          sub: t('command.resConsumerGroup'),
          clusterId: cid,
          meta: c.name,
          icon: Users,
        });
      }
    }
    return rows;
  }, [connections, getConnected, groupsMap, t, topicsMap]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlightSlot(0);
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const { flatRows, selectableRowIndexes } = useMemo(() => {
    const q = query.trim();
    const cmds = commandDefs
      .map((def) => ({ def, score: fuzzyScore(`${def.label} ${def.category}`, q) }))
      .filter(({ score }) => !q || score > 0)
      .sort((a, b) => b.score - a.score);

    const recentDefs = recentIds
      .map((id) => commandDefs.find((c) => c.id === id))
      .filter((d): d is CommandDef => Boolean(d))
      .filter((def) => !q || fuzzyScore(`${def.label} ${def.category}`, q) > 0);

    const rescoredResources = resources
      .map((r) => ({
        res: r,
        score: fuzzyScore(`${r.label} ${r.sub} ${r.meta ?? ''}`, q),
      }))
      .filter(({ score }) => !q || score > 0)
      .sort((a, b) => b.score - a.score);

    const rows: FlatRow[] = [];
    const selectableRowIndexes: number[] = [];

    const addHeader = (title: string, icon?: LucideIcon) => {
      rows.push({ type: 'header', title, icon });
    };

    if (recentDefs.length > 0 && !q) {
      addHeader(t('command.recentlyUsed'), Command);
      for (const def of recentDefs) {
        selectableRowIndexes.push(rows.length);
        rows.push({ type: 'command', def });
      }
    }

    addHeader(t('command.allCommands'), Command);
    for (const { def } of cmds) {
      selectableRowIndexes.push(rows.length);
      rows.push({ type: 'command', def });
    }

    addHeader(t('command.resources'), Layers);
    for (const { res } of rescoredResources) {
      selectableRowIndexes.push(rows.length);
      rows.push({ type: 'resource', res });
    }

    return { flatRows: rows, selectableRowIndexes };
  }, [commandDefs, query, recentIds, resources, t]);

  const maxSlot = selectableRowIndexes.length - 1;

  useEffect(() => {
    if (highlightSlot > maxSlot) {
      setHighlightSlot(Math.max(0, maxSlot));
    }
  }, [highlightSlot, maxSlot]);

  useEffect(() => {
    if (!open || !highlightedRowRef.current) return;
    highlightedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightSlot, open, selectableRowIndexes]);

  const runRow = useCallback(
    (row: FlatRow) => {
      if (row.type === 'command') {
        pushRecent(row.def.id);
        row.def.action();
        setPaletteOpen(false);
      } else if (row.type === 'resource') {
        const conn = connections.find((c) => c.id === row.res.clusterId);
        const titlePrefix = conn?.name?.trim() || row.res.clusterId;
        if (row.res.kind === 'cluster') {
          openTab(
            { type: 'cluster-overview', clusterId: row.res.clusterId },
            titlePrefix,
            'layout-dashboard',
          );
        } else if (row.res.kind === 'topic') {
          openTab(
            { type: 'topic-data', clusterId: row.res.clusterId, topicName: row.res.label },
            `${titlePrefix} · ${row.res.label}`,
            'list',
          );
        } else {
          openTab(
            { type: 'consumer-group-detail', clusterId: row.res.clusterId, groupId: row.res.label },
            `${titlePrefix} · ${row.res.label}`,
            'users',
          );
        }
        setPaletteOpen(false);
      }
    },
    [connections, openTab, pushRecent, setPaletteOpen],
  );

  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setPaletteOpen(false);
      return;
    }

    const n = selectableRowIndexes.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightSlot((s) => (n === 0 ? 0 : (s + 1) % n));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightSlot((s) => (n === 0 ? 0 : (s - 1 + n) % n));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const rowIdx = selectableRowIndexes[highlightSlot];
      const row = rowIdx !== undefined ? flatRows[rowIdx] : undefined;
      if (row && row.type !== 'header') runRow(row);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const stops: (HTMLElement | null)[] = [inputRef.current, highlightedRowRef.current];
      const active = document.activeElement;
      const i = stops.findIndex((el) => el && el === active);
      const nextIdx = i < 0 ? 0 : (i + (e.shiftKey ? stops.length - 1 : 1)) % stops.length;
      stops[nextIdx]?.focus();
    }
  };

  const highlightedFlatIndex =
    selectableRowIndexes[
      Math.min(Math.max(0, highlightSlot), Math.max(selectableRowIndexes.length - 1, 0))
    ];

  const rowTone = (flatIndex: number): Pick<React.CSSProperties, 'background' | 'color'> => ({
    background: flatIndex === highlightedFlatIndex ? 'var(--color-primary-muted)' : 'transparent',
    color: flatIndex === highlightedFlatIndex ? 'var(--color-primary)' : 'var(--color-text)',
  });

  return (
    <>
      {open && (
        <div
          ref={backdropRef}
          role="presentation"
          onClick={(ev) => {
            if (ev.target === backdropRef.current) setPaletteOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 8000,
            background: 'rgba(15, 23, 42, 0.62)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '18vh',
            transition: 'opacity var(--transition-fast)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('command.palette')}
            data-palette-panel=""
            tabIndex={-1}
            onKeyDown={onDialogKeyDown}
            style={{
              width: 'min(600px, calc(100vw - 48px))',
              maxHeight: 'min(70vh, 520px)',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              outline: 'none',
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--color-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Search size={18} color="var(--color-text-muted)" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightSlot(0);
                }}
                placeholder={t('command.searchPlaceholder')}
                aria-label={t('command.searchLabel')}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  outline: 'none',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                }}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div
              role="listbox"
              aria-activedescendant={
                selectableRowIndexes[highlightSlot] !== undefined
                  ? `palette-row-${selectableRowIndexes[highlightSlot]}`
                  : undefined
              }
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '4px 6px',
              }}
            >
              {flatRows.length === 0 && (
                <div
                  style={{
                    padding: 28,
                    color: 'var(--color-text-faint)',
                    textAlign: 'center',
                    fontSize: 13,
                  }}
                >
                  {t('command.noMatch')}
                </div>
              )}
              {flatRows.map((row, flatIndex) => {
                if (row.type === 'header') {
                  const HIcon = row.icon ?? Command;
                  return (
                    <div
                      key={`h-${flatIndex}-${row.title}`}
                      role="presentation"
                      style={{
                        padding: '8px 10px 4px',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        color: 'var(--color-text-faint)',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      <HIcon size={12} aria-hidden />
                      {row.title}
                    </div>
                  );
                }
                if (row.type === 'command') {
                  const Icon = row.def.icon;
                  const isHi = flatIndex === highlightedFlatIndex;
                  return (
                    <button
                      key={`${flatIndex}-${row.def.id}`}
                      ref={isHi ? highlightedRowRef : undefined}
                      type="button"
                      role="option"
                      id={`palette-row-${flatIndex}`}
                      tabIndex={isHi ? 0 : -1}
                      aria-selected={isHi}
                      onMouseEnter={() => setHighlightSlot(selectableRowIndexes.indexOf(flatIndex))}
                      onClick={() => runRow(row)}
                      style={{
                        width: '100%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 10px',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'left',
                        fontSize: 13,
                        transition: `background var(--transition-fast), color var(--transition-fast)`,
                        ...rowTone(flatIndex),
                      }}
                    >
                      <Icon size={17} aria-hidden strokeWidth={2} />
                      <span style={{ flex: 1, fontFamily: 'var(--font-body)' }}>
                        {row.def.label}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-heading)',
                          fontSize: 11,
                          color: 'var(--color-text-faint)',
                        }}
                      >
                        {row.def.shortcut ?? ''}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-surface-2)',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {row.def.category}
                      </span>
                    </button>
                  );
                }
                const Icon = row.res.icon;
                const isHi = flatIndex === highlightedFlatIndex;
                return (
                  <button
                    key={row.res.id}
                    ref={isHi ? highlightedRowRef : undefined}
                    type="button"
                    role="option"
                    id={`palette-row-${flatIndex}`}
                    tabIndex={isHi ? 0 : -1}
                    aria-selected={isHi}
                    onMouseEnter={() => setHighlightSlot(selectableRowIndexes.indexOf(flatIndex))}
                    onClick={() => runRow(row)}
                    style={{
                      width: '100%',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 10px',
                      borderRadius: 'var(--radius-sm)',
                      textAlign: 'left',
                      fontSize: 13,
                      transition: `background var(--transition-fast), color var(--transition-fast)`,
                      ...rowTone(flatIndex),
                    }}
                  >
                    <Icon size={17} aria-hidden strokeWidth={2} />
                    <span
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-body)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.res.label}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                      （{row.res.sub}）
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {createTopicClusterId && (
        <CreateTopicDialog
          open={Boolean(createTopicClusterId)}
          clusterId={createTopicClusterId}
          onClose={() => setCreateTopicClusterId(null)}
          onCreated={() => {
            void loadTopics(createTopicClusterId);
            setPaletteOpen(false);
            setCreateTopicClusterId(null);
          }}
        />
      )}
    </>
  );
}
