/**
 * 全局快捷键（对话框内输入框仍响应组合键）
 */
import { useEffect, useRef } from 'react';
import { useConnectionDialogContext } from '../../contexts/connectionDialogContext';
import { refreshActiveView } from '../../lib/refreshActiveView';
import { useUIStore } from '../../stores/uiStore';
import { getT } from '../../i18n';

export function GlobalKeyboardHandler() {
  const { openConnectionDialog, closeConnectionDialog, isOpen } = useConnectionDialogContext();

  const isOpenConnRef = useRef(isOpen);
  isOpenConnRef.current = isOpen;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUIStore.getState().toggleCommandPalette();
        return;
      }

      if (mod && (e.code === 'Comma' || e.key === ',')) {
        e.preventDefault();
        useUIStore.getState().openTab({ type: 'settings' }, getT()('settings.title'), 'settings');
        return;
      }

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openConnectionDialog();
        return;
      }

      if (mod && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        refreshActiveView();
        return;
      }

      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const { activeTabId, closeTab } = useUIStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('km:focus-sidebar-search'));
        return;
      }

      if (mod && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        const idx = Number(e.code.replace('Digit', '')) - 1;
        const { tabs } = useUIStore.getState();
        if (tabs[idx]) useUIStore.getState().setActiveTab(tabs[idx].id);
        return;
      }

      if (e.key === 'Escape') {
        if (useUIStore.getState().commandPaletteOpen) {
          useUIStore.getState().setCommandPaletteOpen(false);
          return;
        }
        if (isOpenConnRef.current) {
          e.preventDefault();
          closeConnectionDialog();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openConnectionDialog, closeConnectionDialog]);

  return null;
}
