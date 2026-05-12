import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppUserSettings, PersistedSettingsBlob } from '../types';
import { DEFAULT_APP_USER_SETTINGS } from '../types';
import { useUIStore } from './uiStore';

const STORAGE_KEY = 'km-user-settings-v1';

function readLocal(): Partial<PersistedSettingsBlob> {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (!r) return {};
    const parsed = JSON.parse(r) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Partial<PersistedSettingsBlob>)
      : {};
  } catch {
    return {};
  }
}

function mergeApp(raw: Partial<AppUserSettings>): AppUserSettings {
  const font = Number(raw.editorFontSize);
  const fs = Number.isFinite(font) ? Math.min(20, Math.max(12, font)) : DEFAULT_APP_USER_SETTINGS.editorFontSize;
  return {
    ...DEFAULT_APP_USER_SETTINGS,
    ...raw,
    editorFontSize: fs,
    jsonIndent: raw.jsonIndent === 4 ? 4 : 2,
    hexBytesPerRow: raw.hexBytesPerRow === 8 || raw.hexBytesPerRow === 32 ? raw.hexBytesPerRow : 16,
    defaultMessageLoadCount: [50, 100, 500, 1000, 5000].includes(raw.defaultMessageLoadCount as number)
      ? (raw.defaultMessageLoadCount as AppUserSettings['defaultMessageLoadCount'])
      : DEFAULT_APP_USER_SETTINGS.defaultMessageLoadCount,
    timestampDisplayFormat:
      raw.timestampDisplayFormat === 'unix_ms' || raw.timestampDisplayFormat === 'custom'
        ? raw.timestampDisplayFormat
        : 'iso8601',
    defaultContentType:
      raw.defaultContentType === 'json' ||
      raw.defaultContentType === 'hex' ||
      raw.defaultContentType === 'avro' ||
      raw.defaultContentType === 'protobuf'
        ? raw.defaultContentType
        : 'string',
  };
}

type SettingsStore = AppUserSettings & {
  hydrateFromDisk: (raw?: Partial<PersistedSettingsBlob>) => void;
  patch: (p: Partial<AppUserSettings>) => void;
  persistMerged: () => Promise<void>;
};

export async function persistUserSettings(blob: PersistedSettingsBlob): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    /* ignore */
  }
  try {
    await invoke('update_settings', { settings: blob });
  } catch {
    /* backend optional */
  }
}

export function bootstrapUserSettings(): void {
  const raw = readLocal();
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') {
    useUIStore.getState().setTheme(raw.theme);
  }
  if (raw.language === 'zh' || raw.language === 'en') {
    useUIStore.getState().setLanguage(raw.language);
  }
  const { theme: _unusedT, language: _unusedL, ...appOnly } = raw;
  useSettingsStore.setState((prev) => ({
    ...prev,
    ...mergeApp(appOnly as Partial<AppUserSettings>),
  }));
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_APP_USER_SETTINGS,

  hydrateFromDisk: (raw = readLocal()) => {
    const { theme: _t, language: _l, ...rest } = raw;
    set((s) => ({
      ...s,
      ...mergeApp(rest as Partial<AppUserSettings>),
    }));
  },

  patch: (p) => {
    set((s) => ({ ...s, ...p }));
    void get().persistMerged();
  },

  persistMerged: async () => {
    const ui = useUIStore.getState();
    const s = get();
    const blob: PersistedSettingsBlob = {
      theme: ui.theme,
      language: ui.language,
      autoConnectOnStartup: s.autoConnectOnStartup,
      notificationToastSeconds: s.notificationToastSeconds,
      jsonIndent: s.jsonIndent,
      editorFontSize: s.editorFontSize,
      autoFormatJson: s.autoFormatJson,
      hexBytesPerRow: s.hexBytesPerRow,
      defaultMessageLoadCount: s.defaultMessageLoadCount,
      messagePreviewTruncateLength: s.messagePreviewTruncateLength,
      timestampDisplayFormat: s.timestampDisplayFormat,
      timestampCustomPattern: s.timestampCustomPattern,
      defaultContentType: s.defaultContentType,
    };
    await persistUserSettings(blob);
  },
}));
