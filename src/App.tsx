/**
 * KafkaManager 主布局 — 侧栏 + 标签栏 + 面板路由
 */
import React, { useEffect } from 'react';
import { ConnectionDialogProvider, useConnectionDialogContext } from './contexts/connectionDialogContext';
import { DataDialogProvider } from './contexts/dataDialogContext';
import { ConnectionDialog } from './components/cluster/ConnectionDialog';
import { ClusterSidebar } from './components/sidebar/ClusterSidebar';
import { TabBar } from './components/layout/TabBar';
import { PanelRouter } from './components/layout/PanelRouter';
import { CommandPalette } from './components/command/CommandPalette';
import { GlobalKeyboardHandler } from './components/command/GlobalKeyboardHandler';
import { connectionToFormData, formDataToConnectionPayload } from './lib/connectionFormMap';
import { useConnectionStore } from './stores/connectionStore';
import { useUIStore } from './stores/uiStore';
import { bootstrapUserSettings } from './stores/settingsStore';
import { getT, useT } from './i18n';
import './styles/design-tokens.css';

class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 16,
            padding: 32,
            fontFamily: 'var(--font-body)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span style={{ fontSize: 36 }}>⚠</span>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-error)' }}>
            {getT()('app.panelRenderError')}
          </p>
          <pre
            style={{
              maxWidth: 480,
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--color-text-faint)',
              overflow: 'auto',
              maxHeight: 160,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 16px',
              background: 'var(--color-primary-muted)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {getT()('common.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppDialogs() {
  const { isOpen, dialogOptions, closeConnectionDialog } = useConnectionDialogContext();
  const saveConnection = useConnectionStore((s) => s.saveConnection);
  const testConnection = useConnectionStore((s) => s.testConnection);
  const getConnection = useConnectionStore((s) => s.getConnection);

  const editingId = dialogOptions?.connectionId;
  const existing = editingId ? getConnection(editingId) : undefined;
  const initialData = existing ? connectionToFormData(existing) : undefined;

  return (
    <ConnectionDialog
      open={isOpen}
      initialData={initialData}
      onClose={closeConnectionDialog}
      onSave={async (data) => {
        await saveConnection(formDataToConnectionPayload(data, existing));
      }}
      onTestConnection={async (data) => {
        const payload = formDataToConnectionPayload(data);
        const result = await testConnection(payload);
        return {
          success: result.success,
          errorMessage: result.message ?? getT()('common.unknownError'),
          latencyMs: result.latencyMs,
          brokerCount: 0,
          topicCount: 0,
          kafkaVersion: '—',
        };
      }}
    />
  );
}

function AppInner() {
  const t = useT();
  const loadConnections = useConnectionStore((s) => s.loadConnections);
  const loadGroups = useConnectionStore((s) => s.loadGroups);

  useEffect(() => {
    void loadConnections();
    void loadGroups();
  }, [loadConnections, loadGroups]);

  useEffect(() => {
    bootstrapUserSettings();
  }, []);

  const theme = useUIStore((s) => s.theme);
  const language = useUIStore((s) => s.language);

  useEffect(() => {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  return (
    <>
      <GlobalKeyboardHandler />
      <CommandPalette />
      <div
        style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}
      >
        <a href="#main-content" className="skip-link">
          {t('app.skipToMain')}
        </a>
        <ClusterSidebar />
        <main
          id="main-content"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          tabIndex={-1}
        >
          <TabBar />
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <PanelErrorBoundary>
              <PanelRouter />
            </PanelErrorBoundary>
          </div>
        </main>
      </div>
      <AppDialogs />
    </>
  );
}

export default function App() {
  return (
    <ConnectionDialogProvider>
      <DataDialogProvider>
        <AppInner />
      </DataDialogProvider>
    </ConnectionDialogProvider>
  );
}
