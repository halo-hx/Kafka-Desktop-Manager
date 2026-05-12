/**
 * 设置面板 — 左侧标签、右侧内容，中文标签
 */
import { useCallback, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useT } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { AppUserSettings } from '../../types';

type SettingsTab = 'general' | 'editor' | 'messages' | 'shortcuts' | 'about';

const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--space-6)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  marginBottom: 'var(--space-2)',
};

export function SettingsPanel() {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>('general');

  const tabLabels = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('settings.tab.general') },
        { id: 'editor' as const, label: t('settings.tab.editor') },
        { id: 'messages' as const, label: t('settings.tab.messages') },
        { id: 'shortcuts' as const, label: t('settings.tab.shortcuts') },
        { id: 'about' as const, label: t('settings.tab.about') },
      ] satisfies { id: SettingsTab; label: string }[],
    [t],
  );

  const shortcutRows = useMemo(
    () =>
      [
        [t('settings.shortcut.openCommandPalette'), '⌘K / Ctrl+K'],
        [t('settings.shortcut.openSettings'), '⌘, / Ctrl+,'],
        [t('settings.shortcut.newConnection'), '⌘N / Ctrl+N'],
        [t('settings.shortcut.refreshView'), '⌘R / Ctrl+R'],
        [t('settings.shortcut.focusSearch'), '⌘F / Ctrl+F'],
        [t('settings.shortcut.closeTab'), '⌘W / Ctrl+W'],
        [t('settings.shortcut.switchTab'), '⌘1–9 / Ctrl+1–9'],
        [t('settings.shortcut.closeDialog'), 'Escape'],
      ] as [string, string][],
    [t],
  );

  const themeOptions = useMemo(
    () =>
      [
        ['light', t('settings.theme.light')] as const,
        ['dark', t('settings.theme.dark')] as const,
        ['system', t('settings.theme.system')] as const,
      ],
    [t],
  );

  const jsonIndentOptions = useMemo(
    () =>
      [
        [2, t('settings.jsonIndent.2spaces')] as const,
        [4, t('settings.jsonIndent.4spaces')] as const,
      ],
    [t],
  );
  const theme = useUIStore((s) => s.theme);
  const language = useUIStore((s) => s.language);
  const setTheme = useUIStore((s) => s.setTheme);
  const setLanguage = useUIStore((s) => s.setLanguage);
  const persistMerged = useSettingsStore((s) => s.persistMerged);

  const s = useSettingsStore();

  const onThemeLangChange = useCallback(() => {
    void persistMerged();
  }, [persistMerged]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      <aside
        aria-label={t('settings.categories')}
        style={{
          width: 176,
          flexShrink: 0,
          padding: 'var(--space-4) var(--space-3)',
          borderRight: '1px solid var(--color-border-subtle)',
          background: 'var(--color-surface)',
        }}
      >
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabLabels.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              style={{
                textAlign: 'left',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                background: tab === item.id ? 'var(--color-primary-muted)' : 'transparent',
                color: tab === item.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                transition: `background var(--transition-fast), color var(--transition-fast)`,
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div
        role="tabpanel"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-6)',
          minWidth: 0,
        }}
      >
        {tab === 'general' && (
          <>
            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.language')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(
                  [
                    ['zh', '中文'],
                    ['en', 'English'],
                  ] as const
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
                  >
                    <input
                      type="radio"
                      name="lang"
                      checked={language === val}
                      onChange={() => {
                        setLanguage(val);
                        onThemeLangChange();
                      }}
                    />
                    {lbl}
                  </label>
                ))}
              </div>
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.theme')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {themeOptions.map(([val, lbl]) => (
                  <label
                    key={val}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
                  >
                    <input
                      type="radio"
                      name="theme"
                      checked={theme === val}
                      onChange={() => {
                        setTheme(val);
                        onThemeLangChange();
                      }}
                    />
                    {lbl}
                  </label>
                ))}
              </div>
            </section>

            <section style={sectionStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={s.autoConnectOnStartup}
                  onChange={(e) => s.patch({ autoConnectOnStartup: e.target.checked })}
                />
                {t('settings.autoConnect')}
              </label>
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.toastDuration')}</span>
              <input
                type="number"
                min={1}
                max={120}
                value={s.notificationToastSeconds}
                onChange={(e) =>
                  s.patch({
                    notificationToastSeconds: Math.min(120, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                style={{
                  width: 120,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </section>
          </>
        )}

        {tab === 'editor' && (
          <>
            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.jsonIndent')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jsonIndentOptions.map(([n, lbl]) => (
                  <label
                    key={n}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
                  >
                    <input
                      type="radio"
                      name="indent"
                      checked={s.jsonIndent === n}
                      onChange={() => s.patch({ jsonIndent: n })}
                    />
                    {lbl}
                  </label>
                ))}
              </div>
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.fontSize', { size: s.editorFontSize })}</span>
              <input
                type="range"
                min={12}
                max={20}
                value={s.editorFontSize}
                onChange={(e) => s.patch({ editorFontSize: Number(e.target.value) })}
                style={{ width: '100%', maxWidth: 320 }}
              />
            </section>

            <section style={sectionStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={s.autoFormatJson}
                  onChange={(e) => s.patch({ autoFormatJson: e.target.checked })}
                />
                {t('settings.autoFormatJson')}
              </label>
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.hexBytesPerRow')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([8, 16, 32] as const).map((n) => (
                  <label
                    key={n}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
                  >
                    <input
                      type="radio"
                      name="hexrow"
                      checked={s.hexBytesPerRow === n}
                      onChange={() => s.patch({ hexBytesPerRow: n })}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'messages' && (
          <>
            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.defaultLoadCount')}</span>
              <select
                value={s.defaultMessageLoadCount}
                onChange={(e) =>
                  s.patch({
                    defaultMessageLoadCount: Number(e.target.value) as AppUserSettings['defaultMessageLoadCount'],
                  })
                }
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  minWidth: 160,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {[50, 100, 500, 1000, 5000].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.previewTruncate')}</span>
              <input
                type="number"
                min={32}
                max={100000}
                value={s.messagePreviewTruncateLength}
                onChange={(e) =>
                  s.patch({
                    messagePreviewTruncateLength: Math.max(32, Number(e.target.value) || 256),
                  })
                }
                style={{
                  width: 160,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                }}
              />
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.timestampFormat')}</span>
              <select
                value={s.timestampDisplayFormat}
                onChange={(e) =>
                  s.patch({
                    timestampDisplayFormat: e.target.value as AppUserSettings['timestampDisplayFormat'],
                  })
                }
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  minWidth: 220,
                  fontFamily: 'var(--font-body)',
                }}
              >
                <option value="iso8601">ISO 8601</option>
                <option value="unix_ms">{t('settings.unixMs')}</option>
                <option value="custom">{t('settings.timestampCustom')}</option>
              </select>
              {s.timestampDisplayFormat === 'custom' && (
                <input
                  type="text"
                  placeholder={t('settings.timestampPattern')}
                  value={s.timestampCustomPattern}
                  onChange={(e) => s.patch({ timestampCustomPattern: e.target.value })}
                  style={{
                    display: 'block',
                    marginTop: 8,
                    width: '100%',
                    maxWidth: 360,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                  }}
                />
              )}
            </section>

            <section style={sectionStyle}>
              <span style={labelStyle}>{t('settings.defaultContentType')}</span>
              <select
                value={s.defaultContentType}
                onChange={(e) =>
                  s.patch({
                    defaultContentType: e.target.value as AppUserSettings['defaultContentType'],
                  })
                }
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  minWidth: 200,
                  fontFamily: 'var(--font-body)',
                }}
              >
                <option value="string">String</option>
                <option value="json">JSON</option>
                <option value="hex">Hex</option>
                <option value="avro">Avro</option>
                <option value="protobuf">Protobuf</option>
              </select>
            </section>
          </>
        )}

        {tab === 'shortcuts' && (
          <div style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                maxWidth: 560,
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-text-faint)',
                      fontWeight: 600,
                    }}
                  >
                    {t('settings.shortcut.action')}
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-text-faint)',
                      fontWeight: 600,
                    }}
                  >
                    {t('settings.shortcut.key')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shortcutRows.map(([op, keys]) => (
                  <tr key={op}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      {op}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        fontFamily: 'var(--font-heading)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {keys}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'about' && (
          <div style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.7, maxWidth: 480 }}>
            <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text)', fontWeight: 600, fontSize: 18 }}>
              KafkaManager
            </p>
            <p style={{ marginBottom: 'var(--space-2)' }}>
              {t('settings.about.version', { version: '0.1.0' })}
            </p>
            <p style={{ marginBottom: 'var(--space-5)' }}>{t('settings.about.buildInfo')}</p>
            <button
              type="button"
              onClick={() => window.alert(t('settings.about.checkUpdateMsg'))}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: 600,
                marginBottom: 'var(--space-4)',
                transition: `background var(--transition-fast)`,
              }}
            >
              {t('settings.about.checkUpdate')}
            </button>
            <div>
              <a
                href="https://opensource.org/licenses/MIT"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                }}
              >
                {t('settings.about.license')}
                <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
