import { create } from 'zustand';
import type { PanelType, TabItem } from '../types';

const MAX_TABS = 20;

const WELCOME_TAB: TabItem = {
  id: 'welcome',
  title: 'Welcome',
  panel: { type: 'welcome' },
  closable: false,
};

interface UIStore {
  tabs: TabItem[];
  activeTabId: string | null;
  openTab: (panel: PanelType, title: string, icon?: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  sidebarWidth: number;
  sidebarCollapsed: boolean;
  showInternalTopics: boolean;
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  toggleInternalTopics: () => void;

  expandedNodes: Set<string>;
  toggleNode: (nodeId: string) => void;
  expandNode: (nodeId: string) => void;
  collapseAll: () => void;

  selectedNodeId: string | null;
  setSelectedNode: (id: string | null) => void;

  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;

  language: 'zh' | 'en';
  setLanguage: (l: 'zh' | 'en') => void;

  commandPaletteOpen: boolean;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  clusterDashboardModules: Record<string, string>;
  setClusterDashboardModule: (clusterId: string, module: string) => void;
}

export function panelToTabId(panel: PanelType): string {
  switch (panel.type) {
    case 'welcome':
      return 'welcome';
    case 'settings':
      return 'settings';
    case 'cluster-dashboard':
      return `cluster-dashboard-${panel.clusterId}`;
    case 'cluster-overview':
      return `cluster-overview-${panel.clusterId}`;
    case 'broker-detail':
      return `broker-detail-${panel.clusterId}-${panel.brokerId}`;
    case 'topic-data':
      return `topic-data-${panel.clusterId}-${panel.topicName}`;
    case 'topic-properties':
      return `topic-properties-${panel.clusterId}-${panel.topicName}`;
    case 'topic-partitions':
      return `topic-partitions-${panel.clusterId}-${panel.topicName}`;
    case 'consumer-group-list':
      return `consumer-group-list-${panel.clusterId}`;
    case 'consumer-group-detail':
      return `consumer-group-detail-${panel.clusterId}-${panel.groupId}`;
    case 'schema-registry':
      return `schema-registry-${panel.clusterId}`;
    case 'schema-detail':
      return `schema-detail-${panel.clusterId}-${encodeURIComponent(panel.subject)}`;
    case 'kafka-connect':
      return `kafka-connect-${panel.clusterId}`;
    case 'connector-detail':
      return `connector-detail-${panel.clusterId}-${encodeURIComponent(panel.connectorName)}`;
    case 'acl-list':
      return `acl-list-${panel.clusterId}`;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

function tabClosableForPanel(panel: PanelType): boolean {
  return panel.type !== 'welcome';
}

/** Drop oldest tabs until fewer than MAX_TABS; prefers removing closable tabs from the left. */
function shrinkTabsIfNeeded(tabs: TabItem[]): TabItem[] {
  if (tabs.length < MAX_TABS) {
    return tabs;
  }
  const next = [...tabs];
  while (next.length >= MAX_TABS) {
    const closableIdx = next.findIndex((t) => t.closable);
    if (closableIdx !== -1) {
      next.splice(closableIdx, 1);
    } else {
      next.shift();
    }
  }
  return next;
}

export const useUIStore = create<UIStore>((set, get) => ({
  tabs: [WELCOME_TAB],
  activeTabId: 'welcome',

  sidebarWidth: 280,
  sidebarCollapsed: false,
  showInternalTopics: false,

  expandedNodes: new Set<string>(),
  selectedNodeId: null,

  theme: 'system',
  language: 'en',

  commandPaletteOpen: false,

  clusterDashboardModules: {},

  setClusterDashboardModule: (clusterId, module) =>
    set((s) => ({
      clusterDashboardModules: { ...s.clusterDashboardModules, [clusterId]: module },
    })),

  openTab: (panel, title, icon) => {
    const id = panelToTabId(panel);
    const { tabs, activeTabId } = get();
    const existing = tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: id });
      return;
    }

    const closable = tabClosableForPanel(panel);
    let nextTabs = shrinkTabsIfNeeded(tabs);
    nextTabs = [
      ...nextTabs,
      {
        id,
        title,
        icon,
        panel,
        closable,
      },
    ];
    set({ tabs: nextTabs, activeTabId: id });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab?.closable) {
      return;
    }
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const nextTabs = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      const neighbor = nextTabs[idx] ?? nextTabs[idx - 1] ?? nextTabs[0] ?? null;
      nextActive = neighbor?.id ?? null;
    }
    set({ tabs: nextTabs, activeTabId: nextActive });
  },

  closeOtherTabs: (id) => {
    const { tabs, activeTabId } = get();
    const keep = tabs.filter((t) => t.id === id || !t.closable);
    const nextActive = keep.some((t) => t.id === activeTabId) ? activeTabId : id;
    set({ tabs: keep, activeTabId: nextActive });
  },

  closeTabsToRight: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const toRemoveIds = new Set(
      tabs.slice(idx + 1).filter((t) => t.closable).map((t) => t.id),
    );
    if (toRemoveIds.size === 0) return;
    const nextTabs = tabs.filter((t) => !toRemoveIds.has(t.id));
    const nextActive =
      activeTabId && toRemoveIds.has(activeTabId) ? id : activeTabId;
    set({ tabs: nextTabs, activeTabId: nextActive });
  },

  closeAllTabs: () => {
    const { tabs } = get();
    const keep = tabs.filter((t) => !t.closable);
    const nextActive = keep[0]?.id ?? null;
    set({ tabs: keep.length > 0 ? keep : [WELCOME_TAB], activeTabId: nextActive ?? 'welcome' });
  },

  setActiveTab: (id) => {
    if (!get().tabs.some((t) => t.id === id)) return;
    set({ activeTabId: id });
  },

  reorderTabs: (fromIndex, toIndex) => {
    const { tabs } = get();
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tabs.length ||
      toIndex >= tabs.length
    ) {
      return;
    }
    const next = [...tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ tabs: next });
  },

  setSidebarWidth: (w) => {
    const clamped = Math.min(560, Math.max(180, w));
    set({ sidebarWidth: clamped });
  },

  toggleSidebar: () =>
    set((s) => ({
      sidebarCollapsed: !s.sidebarCollapsed,
    })),

  toggleInternalTopics: () =>
    set((s) => ({
      showInternalTopics: !s.showInternalTopics,
    })),

  toggleNode: (nodeId) =>
    set((s) => {
      const expanded = new Set(s.expandedNodes);
      if (expanded.has(nodeId)) {
        expanded.delete(nodeId);
      } else {
        expanded.add(nodeId);
      }
      return { expandedNodes: expanded };
    }),

  expandNode: (nodeId) =>
    set((s) => {
      const expanded = new Set(s.expandedNodes);
      expanded.add(nodeId);
      return { expandedNodes: expanded };
    }),

  collapseAll: () =>
    set({
      expandedNodes: new Set(),
    }),

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  setTheme: (t) => set({ theme: t }),

  setLanguage: (l) => set({ language: l }),

  toggleCommandPalette: () =>
    set((s) => ({
      commandPaletteOpen: !s.commandPaletteOpen,
    })),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
