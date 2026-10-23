import React from 'react';
import type { AppLanguage, Bar } from '../types';
import { getChordDisplaySlotEntries } from '../utils/chordSlots';
import { reconcileChordSubdivisions } from '../utils/chordSubdivisions';
import ChordSubdivisionsEditor from './ChordSubdivisionsEditor';

export default function ChordPassVariantsEditor({ bar, beats, language, onChange }: {
  bar: Bar; beats: number; language: AppLanguage; onChange: (value: Bar['chordPassVariants']) => void;
}) {
  const zh = language === 'zh';
  const variants = bar.chordPassVariants ?? [];
  const update = (index: number, patch: Partial<NonNullable<Bar['chordPassVariants']>[number]>) => {
    onChange(variants.map((variant, i) => i === index ? { ...variant, ...patch } : variant));
  };
  let nextPass = 2;
  while (variants.some(variant => variant.pass === nextPass)) nextPass++;
  return <div data-chord-pass-variants-editor className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
    <p className="font-bold">{zh ? '指定遍數的替代和弦' : 'Chords for a numbered pass'}</p>
    <p className="text-slate-500">{zh ? '第一遍使用原和弦；只在指定遍數使用替代和弦。使用本小節原調，空格沿用前一和弦。' : 'Keep the original harmony on pass 1. Use these chords only on the numbered pass, in this bar’s written key. Blank beats sustain the preceding chord.'}</p>
    {variants.map((variant, index) => {
      const entries = getChordDisplaySlotEntries(variant.chords, beats);
      return <fieldset key={variant.pass} className="space-y-2 rounded border border-indigo-100 p-2">
        <legend className="font-bold text-indigo-800">{zh ? `第${variant.pass}遍` : `Pass ${variant.pass}`}</legend>
        <div className="flex items-center justify-between gap-2">
          <label>{zh ? '遍數' : 'Pass'} <input type="number" min="2" step="1" className="min-h-9 w-16 rounded border px-2" aria-label={zh ? `替代和弦 ${index + 1} 遍數` : `Alternative ${index + 1} pass`} value={variant.pass} onChange={event => {
            const pass = Number(event.target.value);
            if (Number.isInteger(pass) && pass >= 2 && !variants.some((other, i) => i !== index && other.pass === pass)) update(index, { pass });
          }} /></label>
          <button type="button" className="min-h-9 rounded border px-2 text-rose-700" aria-label={zh ? `移除第${variant.pass}遍替代和弦` : `Remove pass ${variant.pass} chords`} onClick={() => {
            const next = variants.filter((_, i) => i !== index);
            onChange(next.length ? next : undefined);
          }}>{zh ? '移除' : 'Remove'}</button>
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${beats}, minmax(0, 1fr))` }}>
          {Array.from({ length: beats }, (_, beat) => <label key={beat} className="min-w-0 text-slate-500">{zh ? `${beat + 1}拍` : `Beat ${beat + 1}`}<input className="min-h-9 w-full min-w-0 rounded border px-1 font-mono text-slate-900" aria-label={zh ? `第${variant.pass}遍 第${beat + 1}拍和弦` : `Pass ${variant.pass} beat ${beat + 1} chord`} value={entries[beat]?.chord ?? ''} onChange={event => {
            const chords = Array.from({ length: beats }, (_, i) => entries[i]?.chord ?? '');
            chords[beat] = event.target.value;
            update(index, { chords, chordSubdivisions: reconcileChordSubdivisions({ chords, chordSubdivisions: variant.chordSubdivisions }, beats) });
          }} /></label>)}
        </div>
        <ChordSubdivisionsEditor bar={{ chords: variant.chords, chordSubdivisions: variant.chordSubdivisions }} beats={beats} language={language} onChange={chordSubdivisions => update(index, { chordSubdivisions })} />
      </fieldset>;
    })}
    <button type="button" className="min-h-9 w-full rounded border border-indigo-200 bg-indigo-50 font-bold text-indigo-700" onClick={() => onChange([...variants, { pass: nextPass, chords: Array(beats).fill('') }])}>{zh ? '新增指定遍數和弦' : 'Add chords for a numbered pass'}</button>
  </div>;
}
