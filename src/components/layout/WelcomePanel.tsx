/**
 * 无活动标签或欢迎标签时的首页
 */
import { Database, Plus } from 'lucide-react';
import { useConnectionDialogContext } from '../../contexts/connectionDialogContext';
import { useT } from '../../i18n';

export function WelcomePanel() {
  const t = useT();
  const { openConnectionDialog } = useConnectionDialogContext();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
        padding: 40,
        background: 'var(--color-bg)',
      }}
    >
      <Database
        size={56}
        strokeWidth={1}
        aria-hidden
        style={{ color: 'var(--color-text-faint)' }}
      />
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 18,
          color: 'var(--color-text-muted)',
          fontWeight: 500,
        }}
      >
        Kafka Desktop Manager
      </h2>
      <p
        style={{
          color: 'var(--color-text-faint)',
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 360,
          fontFamily: 'var(--font-body)',
        }}
      >
        {t('welcome.desc')}
      </p>
      <button
        type="button"
        onClick={() => openConnectionDialog()}
        style={{
          marginTop: 8,
          padding: '9px 24px',
          background: 'var(--color-primary)',
          color: '#000',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background var(--transition-fast)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-primary-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--color-primary)';
        }}
      >
        <Plus size={16} strokeWidth={2.5} />
        {t('welcome.newConnection')}
      </button>
    </div>
  );
}
