import { useCallback } from 'react';
import zh, { type TranslationKey } from './zh';
import en from './en';
import { useUIStore } from '../stores/uiStore';

const locales: Record<'zh' | 'en', Record<TranslationKey, string>> = { zh, en };

export type { TranslationKey };

export type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string;

function translate(
  lang: 'zh' | 'en',
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let text = locales[lang]?.[key] ?? locales.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function useT(): TFunction {
  const language = useUIStore((s) => s.language);
  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );
}

export function getT(lang?: 'zh' | 'en'): TFunction {
  const l = lang ?? useUIStore.getState().language;
  return (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(l, key, params);
}
