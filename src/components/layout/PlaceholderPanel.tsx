/**
 * 尚未实现的面板占位
 */
import { Construction } from 'lucide-react';
import type { PanelType } from '../../types';
import { useT } from '../../i18n';

function panelTypeLabel(panel: PanelType): string {
  return panel.type;
}

export function PlaceholderPanel({ panel }: { panel: PanelType }) {
  const t = useT();
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 40,
        background: 'var(--color-bg)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <Construction size={48} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)' }} />
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 16,
          color: 'var(--color-text)',
          fontWeight: 600,
        }}
      >
        {panelTypeLabel(panel)}
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('common.comingSoon')}</p>
    </div>
  );
}
