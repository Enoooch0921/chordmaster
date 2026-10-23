import React, { useState } from 'react';
import type { AppLanguage, RhythmVoice, Song } from '../types';
import RhythmNotation from './RhythmNotation';
import { applyRhythmEdit, type RhythmEditAction } from '../lib/rhythmEditing';
import { getRhythmEventGlyph, parseRhythmNotation } from '../utils/rhythmUtils';

const NOTE_LABELS: Record<string, [string, string]> = { w: ['全音符', 'Whole note'], h: ['二分音符', 'Half note'], q: ['四分音符', 'Quarter note'], e: ['八分音符', 'Eighth note'], s: ['十六分音符', 'Sixteenth note'], wr: ['全休止符', 'Whole rest'], hr: ['二分休止符', 'Half rest'], qr: ['四分休止符', 'Quarter rest'], er: ['八分休止符', 'Eighth rest'], sr: ['十六分休止符', 'Sixteenth rest'], q3: ['四分三連音', 'Quarter triplet'], e3: ['八分三連音', 'Eighth triplet'], s3: ['十六分三連音', 'Sixteenth triplet'], q3r: ['四分三連休止', 'Quarter-triplet rest'], e3r: ['八分三連休止', 'Eighth-triplet rest'], s3r: ['十六分三連休止', 'Sixteenth-triplet rest'] };

interface Props { expanded?: boolean; onExpandedChange?: (open: boolean) => void; voices?: RhythmVoice[]; timeSignature: string; language: AppLanguage; onChange: (voices: RhythmVoice[] | undefined) => void; }
function VoiceEditor({ voice, timeSignature, language, onChange, onRemove }: { voice: RhythmVoice; timeSignature: string; language: AppLanguage; onChange: (voice: RhythmVoice) => void; onRemove: () => void }) {
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const zh = language === 'zh';
  const edit = (action: RhythmEditAction) => {
    const song: Song = { title: 'Voice', originalKey: 'C', currentKey: 'C', timeSignature, sections: [{ id: 'voice', title: '', bars: [{ id: voice.id, chords: [], rhythm: voice.rhythm }] }] };
    const result = applyRhythmEdit(song, { sectionId: 'voice', barId: voice.id }, { cursorUnit: cursor }, action);
    setCursor(result.cursor.cursorUnit); setError(result.error);
    if (result.changed) onChange({ ...voice, rhythm: result.song.sections[0].bars[0].rhythm || '' });
  };
  return <div className="space-y-2 rounded border border-slate-200 bg-white p-2" data-rhythm-voice-editor={voice.id}>
    <div className="flex gap-2">
      <input aria-label={zh ? '聲部名稱' : 'Voice name'} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs" value={voice.label} onChange={e => onChange({ ...voice, label: e.target.value })} />
      <button type="button" className="text-xs text-rose-700" onClick={onRemove}>{zh ? '移除聲部' : 'Remove voice'}</button>
    </div>
    <RhythmNotation notation={voice.rhythm} timeSignature={timeSignature} compact renderMode="editor" selectionMode="insert" selectedInsertIndex={cursor} showInsertCursor onInsertSelect={setCursor} className="min-h-8 w-full" />
    <div className="flex flex-wrap gap-1">
      {['w','h','q','e','s','wr','hr','qr','er','sr','q3','e3','s3','q3r','e3r','s3r'].map(token => <button key={token} type="button" className="h-8 min-w-8 rounded border px-2 font-rhythm text-xl" aria-label={NOTE_LABELS[token][zh ? 0 : 1]} onClick={() => edit({ type: 'insert', token })}>{getRhythmEventGlyph(parseRhythmNotation(token, timeSignature).events[0])}{token.includes('3') && <sup className="ml-0.5 font-sans text-[9px]">3</sup>}</button>)}
      {([['toggle-dot', '·', '附點', 'Dot'], ['toggle-accent', '>', '重音', 'Accent'], ['toggle-tie', '⌒', '連結', 'Tie'], ['cycle-cross-head', '×', '叉形音頭', 'Crosshead']] as const).map(([type, label, zhLabel, enLabel]) => <button key={type} type="button" className="h-8 min-w-8 rounded border px-2" aria-label={zh ? zhLabel : enLabel} onClick={() => edit({ type })}>{label}</button>)}
      <button type="button" className="rounded border px-2 text-xs" onClick={() => edit({ type: 'delete' })}>{zh ? '刪除音符' : 'Delete note'}</button>
    </div>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
  </div>;
}
export default function RhythmVoicesEditor({ voices = [], timeSignature, language, onChange, onExpandedChange, expanded }: Props) {
  const zh = language === 'zh';
  return <details open={expanded} className="my-2 text-xs" data-additional-rhythm-editor onToggle={event => onExpandedChange?.(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">{zh ? '其他節奏聲部' : 'Additional rhythm voices'}{voices.length ? ` (${voices.length})` : ''}</summary>
    <div className="mt-2 space-y-2">
      {voices.map((voice, i) => <VoiceEditor key={voice.id} voice={voice} language={language} timeSignature={timeSignature}
        onChange={next => onChange(voices.map((v, j) => i === j ? next : v))}
        onRemove={() => { const next = voices.filter((_, j) => j !== i); onChange(next.length ? next : undefined); }} />)}
      <button type="button" className="rounded border px-2 py-1" onClick={() => onChange([...voices, { id: crypto.randomUUID(), label: zh ? '聲部' : 'Voice', rhythm: '' }])}>{zh ? '新增節奏聲部' : 'Add rhythm voice'}</button>
    </div>
  </details>;
}
