import React from 'react';
import type { AppLanguage } from '../types';
import { LYRICS_LANGUAGES, lyricsLanguageName } from '../utils/lyricsLanguages';
export default function LyricsLanguagePicker({ value = 'en', language, onChange }: { value?: string; language: AppLanguage; onChange: (value: string) => void }) {
  const options = Array.from(new Set([...LYRICS_LANGUAGES, value]));
  return <label className="flex items-center gap-2 text-sm">{language === 'zh' ? '對照語言' : 'Translation language'}
    <select className="rounded-lg border border-stone-200 bg-white px-2 py-2" aria-label={language === 'zh' ? '對照語言' : 'Translation language'} value={value} onChange={event => onChange(event.target.value)}>
      {options.map(code => <option key={code} value={code}>{lyricsLanguageName(code, language)}</option>)}
    </select>
  </label>;
}
