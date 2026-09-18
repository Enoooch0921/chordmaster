import React from 'react';
import type { AppLanguage, ChordMark } from '../types';
export default function ChordBeatOffsetPicker({ value, disabled, onChange, language, occupiedOffsets = [] }: {
  occupiedOffsets?: number[]; value: ChordMark['beatOffset']; disabled?: boolean; onChange: (value: number) => void; language: AppLanguage;
}) {
  return <label className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-700">
    <span>{language === 'zh' ? '拍內位置' : 'Beat position'}</span>
    <select aria-label={language === 'zh' ? '和弦拍內位置' : 'Chord beat position'} value={value ?? 0} disabled={disabled}
      onChange={event => onChange(Number(event.target.value))}
      className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-1 disabled:opacity-40">
      <option value="0">{language === 'zh' ? '正拍' : 'On beat'}</option>
      <option value="0.25" disabled={occupiedOffsets.includes(.25)}>e · +¼</option><option value="0.5" disabled={occupiedOffsets.includes(.5)}>&amp; · +½</option><option value="0.75" disabled={occupiedOffsets.includes(.75)}>a · +¾</option>
    </select>
  </label>;
}
