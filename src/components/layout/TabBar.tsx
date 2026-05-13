/**
 * IDE 风格标签栏 — 拖拽排序、右键菜单、横向滚动
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { TFunction } from '../../i18n';
import { useT } from '../../i18n';
import { resolveTabIcon } from './tabIcons';
import type { PanelType } from '../../types';

type MenuState = {
  tabId: string;
  clientX: number;
  clientY: number;
};

function resolveTabTitle(panel: PanelType, storedTitle: string, t: TFunction): string {
  switch (panel.type) {
    case 'welcome':
      return t('welcome.title');
    case 'settings':
      return t('settings.title');
    case 'consumer-group-list':
      return t('consumer.title');
    case 'schema-registry':
      return t('schema.title');
    case 'kafka-connect':
      return t('connect.title');
    case 'acl-list':
      return t('acl.title');
    case 'broker-detail':
      return `Broker ${panel.brokerId}`;
    default:
      return storedTitle;
  }
}

export function TabBar() {
  const t = useT();
  const tabs = useUIStore((s) => s.tabs);
  const activeTabId = useUIStore((s) => s.activeTabId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const closeTab = useUIStore((s) => s.closeTab);
  const closeOtherTabs = useUIStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useUIStore((s) => s.closeTabsToRight);
  const closeAllTabs = useUIStore((s) => s.closeAllTabs);
  const reorderTabs = useUIStore((s) => s.reorderTabs);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollArrows();
    el.addEventListener('scroll', updateScrollArrows);
    const ro = new ResizeObserver(updateScrollArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollArrows);
      ro.disconnect();
    };
  }, [tabs.length, updateScrollArrows]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const scrollBy = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const from = dragIndex ?? parseInt(raw, 10);
    if (!Number.isNaN(from)) {
      reorderTabs(from, targetIndex);
    }
    setDragIndex(null);
  };

  const handleDragEnd = () => setDragIndex(null);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={t('tabbar.openTabs')}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          height: 40,
          minHeight: 40,
        }}
      >
        <button
          type="button"
          aria-label={t('tabbar.scrollLeft')}
          onClick={() => scrollBy(-160)}
          disabled={!canScrollLeft}
          style={{
            flexShrink: 0,
            width: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRight: '1px solid var(--color-border-subtle)',
            color: canScrollLeft ? 'var(--color-text-muted)' : 'var(--color-text-faint)',
            cursor: canScrollLeft ? 'pointer' : 'default',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (canScrollLeft) e.currentTarget.style.color = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = canScrollLeft
              ? 'var(--color-text-muted)'
              : 'var(--color-text-faint)';
          }}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'stretch',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const Icon = resolveTabIcon(tab.panel, tab.icon);
            const showClose = tab.closable && (isActive || hoveredTabId === tab.id);
            const displayTitle = resolveTabTitle(tab.panel, tab.title, t);

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                draggable
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(index)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = '2px solid var(--color-primary)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ tabId: tab.id, clientX: e.clientX, clientY: e.clientY });
                }}
                onMouseEnter={() => setHoveredTabId(tab.id)}
                onMouseLeave={() => setHoveredTabId(null)}
                style={{
                  flexShrink: 0,
                  maxWidth: 200,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 14px',
                  borderRight: '1px solid var(--color-border-subtle)',
                  borderBottom: isActive
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                  marginBottom: isActive ? -1 : 0,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-primary-muted)' : 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition:
                    'color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast)',
                  outline: 'none',
                }}
              >
                <Icon
                  size={14}
                  strokeWidth={2}
                  style={{ flexShrink: 0, opacity: isActive ? 1 : 0.65 }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 13,
                    fontFamily: 'var(--font-body)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  title={displayTitle}
                >
                  {displayTitle}
                </span>
                {tab.closable && (
                  <button
                    type="button"
                    aria-label={t('tabbar.closeTab', { title: displayTitle })}
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      padding: 0,
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      background: 'transparent',
                      color: 'var(--color-text-faint)',
                      cursor: 'pointer',
                      opacity: showClose ? 1 : 0,
                      pointerEvents: showClose ? 'auto' : 'none',
                      transition:
                        'opacity var(--transition-fast), background var(--transition-fast), color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-surface-2)';
                      e.currentTarget.style.color = 'var(--color-error)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-faint)';
                    }}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          aria-label={t('tabbar.scrollRight')}
          onClick={() => scrollBy(160)}
          disabled={!canScrollRight}
          style={{
            flexShrink: 0,
            width: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--color-border-subtle)',
            color: canScrollRight ? 'var(--color-text-muted)' : 'var(--color-text-faint)',
            cursor: canScrollRight ? 'pointer' : 'default',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (canScrollRight) e.currentTarget.style.color = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = canScrollRight
              ? 'var(--color-text-muted)'
              : 'var(--color-text-faint)';
          }}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      {menu && (
        <div
          role="menu"
          aria-label={t('tabbar.tabActions')}
          style={{
            position: 'fixed',
            left: menu.clientX,
            top: menu.clientY,
            zIndex: 3000,
            minWidth: 200,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-popup)',
            overflow: 'hidden',
            padding: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(
            [
              { label: t('tabbar.close'), fn: () => closeTab(menu.tabId) },
              { label: t('tabbar.closeOthers'), fn: () => closeOtherTabs(menu.tabId) },
              { label: t('tabbar.closeRight'), fn: () => closeTabsToRight(menu.tabId) },
              { label: t('tabbar.closeAll'), fn: () => closeAllTabs() },
            ] as const
          ).map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                item.fn();
                setMenu(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                color: index === 3 ? 'var(--color-error)' : 'var(--color-text)',
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
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
