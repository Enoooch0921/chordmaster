import React from 'react';
import type { AppLanguage, Bar } from '../types';
import { availableSubdivisionPositions, chordEventLabel, getChordEvents } from '../utils/chordSubdivisions';

export default function ChordSubdivisionsEditor({bar, beats, language, onChange}:{bar:Bar;beats:number;language:AppLanguage;onChange:(value:Bar['chordSubdivisions'])=>void}) {
 const zh=language==='zh', entries=bar.chordSubdivisions??[];
 const available=availableSubdivisionPositions(bar,beats);
 const primary=getChordEvents({...bar,chordSubdivisions:undefined},beats);
 return <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs" data-chord-subdivisions-editor>
  <p className="font-bold">{zh?'拍內追加和弦':'Additional chords within beats'}</p>
  <p className="text-slate-500">{zh?'保留原和弦，在 e、&、a 加入另一個和弦。使用本小節原調。':'Keep the existing chords and add a chord at e, & or a, in this bar’s written key.'}</p>
  <p className="break-words text-slate-500">{primary.map(e=>`${chordEventLabel(e.beat,e.offset)} ${e.chord}`).join(' · ')}</p>
  {entries.some(e=>e.beat>=beats) && <p role="alert" className="text-rose-700">{zh?'有追加和弦超出目前拍號，請調整拍位。':'An additional chord is outside this meter. Adjust its position.'}</p>}
  {entries.map((entry,index)=>{
    const choices=availableSubdivisionPositions(bar,beats,index);
    if(!choices.some(e=>e.beat===entry.beat&&e.offset===entry.offset))choices.push(entry);
    return <div key={index} className="grid grid-cols-[64px_minmax(0,1fr)_44px] gap-2">
     <select className="min-h-9 rounded border bg-white px-1" aria-label={zh?`追加和弦 ${index+1} 拍位`:`Additional chord ${index+1} position`} value={entry.beat+entry.offset} onChange={event=>{const position=Number(event.target.value);onChange(entries.map((e,i)=>i===index?{...e,beat:Math.floor(position),offset:position%1 as .25|.5|.75}:e));}}>{choices.map(e=><option key={e.beat+e.offset} value={e.beat+e.offset}>{chordEventLabel(e.beat,e.offset)}</option>)}</select>
     <input className="min-h-9 min-w-0 rounded border px-2 font-mono" aria-label={zh?`追加和弦 ${index+1}`:`Additional chord ${index+1}`} value={entry.chord} onChange={event=>onChange(entries.map((e,i)=>i===index?{...e,chord:event.target.value}:e))}/>
     <button type="button" className="min-h-9 rounded border text-rose-700" aria-label={zh?`移除追加和弦 ${index+1}`:`Remove additional chord ${index+1}`} onClick={()=>{const next=entries.filter((_,i)=>i!==index);onChange(next.length?next:undefined);}}>{zh?'移除':'×'}</button>
    </div>;
  })}
  <button type="button" className="min-h-9 w-full rounded border border-indigo-200 bg-indigo-50 font-bold text-indigo-700 disabled:opacity-40" disabled={!available.length} onClick={()=>onChange([...entries,{...available[0],chord:'C'}])}>{zh?'新增拍內和弦':'Add chord within beat'}</button>
 </div>;
}
