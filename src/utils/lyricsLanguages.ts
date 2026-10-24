import type { AppLanguage } from '../types';
export const LYRICS_LANGUAGES = ['en', 'ko', 'ja', 'id', 'ms', 'es', 'pt', 'fr', 'de', 'zh-Hant'] as const;
const names: Record<string, [string, string]> = { en: ['英文', 'English'], ko: ['韓文', 'Korean'], ja: ['日文', 'Japanese'], id: ['印尼文', 'Indonesian'], ms: ['馬來文', 'Malay'], es: ['西班牙文', 'Spanish'], pt: ['葡萄牙文', 'Portuguese'], fr: ['法文', 'French'], de: ['德文', 'German'], 'zh-Hant': ['中文', 'Chinese'] };
export const lyricsLanguageName = (code: string | undefined, language: AppLanguage): string => {
  const value = code || 'en';
  if (names[value]) return names[value][language === 'zh' ? 0 : 1];
  try { return new Intl.DisplayNames([language === 'zh' ? 'zh-Hant' : 'en'], { type: 'language' }).of(value) || value; } catch { return value; }
};
