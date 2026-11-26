import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { AppLanguage, Bar } from '../types';
import { availableSubdivisionPositions, chordEventLabel, getChordEvents } from '../utils/chordSubdivisions';
import { normalizeChordQualityAliases } from '../utils/musicUtils';

export default function ChordSubdivisionsEditor({bar, beats, language, onChange, onSelectChord, selectedBeat = 0}:{bar:Bar;beats:number;language:AppLanguage;selectedBeat?:number;onChange:(value:Bar['chordSubdivisions'])=>void;onSelectChord?:(entry:NonNullable<Bar['chordSubdivisions']>[number])=>void}) {
 const zh=language==='zh', entries=bar.chordSubdivisions??[];
 const available=availableSubdivisionPositions(bar,beats);
 const nextPosition = available.find(p => p.beat === selectedBeat && p.offset === 0.5)
   ?? available.find(p => p.offset === 0.5)
   ?? available.find(p => p.beat === selectedBeat)
   ?? available[0];
 const panel = React.useRef<HTMLDivElement>(null);
 const [showPositions, setShowPositions] = React.useState(false);
 const positionToggle = React.useRef<HTMLButtonElement>(null);
 const positionListId = React.useId();
 const focusPosition = React.useRef<string | null>(null);
 React.useLayoutEffect(() => {
   if (!focusPosition.current) return;
   const input = panel.current?.querySelector<HTMLInputElement>(`input[data-position="${focusPosition.current}"]`);
   focusPosition.current = null;
   input?.focus();
   input?.select();
 }, [bar.chordSubdivisions]);
 function addChord(position: (typeof available)[number] | undefined) {
   if (!position) return;
   setShowPositions(false);
   focusPosition.current = chordEventLabel(position.beat, position.offset);
   onChange([...entries, { ...position, chord: bar.chordKeyUnspecified ? '1' : 'C' }]);
 }
 const primary=getChordEvents({...bar,chordSubdivisions:undefined},beats);
 return <div ref={panel} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs" data-chord-subdivisions-editor
   onKeyDown={event => {
     if (showPositions && event.key === 'Escape') {
       event.preventDefault();
       event.stopPropagation();
       setShowPositions(false);
       positionToggle.current?.focus();
     }
   }}>
  <p className="font-bold">{zh?'拍內追加和弦／休止':'Additional chords or rests within beats'}</p>
  <p className="text-slate-500">{bar.chordKeyUnspecified ? (zh?'目的調未標；以原譜級數加入拍內和弦，保留原拍位。':'The destination key is unspecified; add source degree chords at their printed positions.') : zh?'以本小節原調輸入。& 是後半拍，可填 0_ 休止；點 ▾ 選 e 或 a。':'Use this bar’s written key. Enter 0_ for a rest at &, or open the arrow menu to choose e or a.'}</p>
  <p className="break-words text-slate-500">{primary.map(e=>`${chordEventLabel(e.beat,e.offset)} ${e.chord}`).join(' · ')}</p>
  {entries.some(e=>e.beat>=beats) && <p role="alert" className="text-rose-700">{zh?'有追加和弦超出目前拍號，請調整拍位。':'An additional chord is outside this meter. Adjust its position.'}</p>}
  {entries.some(e=>e.chord==='0_'&&e.offset!==.5) && <p role="alert" className="text-rose-700">{zh?'八分休止 0_ 請放在拍的 &。':'Place the eighth rest 0_ at the beat’s & position.'}</p>}
  {entries.map((entry,index)=>{
    const choices=availableSubdivisionPositions(bar,beats,index).filter(position=>entry.chord!=='0_'||position.offset===.5);
    if(!choices.some(e=>e.beat===entry.beat&&e.offset===entry.offset))choices.push(entry);
    return <div key={index} className="grid grid-cols-[64px_minmax(0,1fr)_44px] gap-2">
     <select className="min-h-9 rounded border bg-white px-1" aria-label={zh?`追加和弦 ${index+1} 拍位`:`Additional chord ${index+1} position`} value={entry.beat+entry.offset} onChange={event=>{const position=Number(event.target.value);onChange(entries.map((e,i)=>i===index?{...e,beat:Math.floor(position),offset:position%1 as .25|.5|.75}:e));}}>{choices.map(e=><option key={e.beat+e.offset} value={e.beat+e.offset}>{chordEventLabel(e.beat,e.offset)}</option>)}</select>
     <input data-position={chordEventLabel(entry.beat,entry.offset)} autoComplete="off" spellCheck={false} onFocus={()=>onSelectChord?.(entry)} className="min-h-9 min-w-0 rounded border px-2 font-mono" aria-label={zh?`追加和弦 ${index+1}`:`Additional chord ${index+1}`} value={entry.chord} onChange={event=>onChange(entries.map((e,i)=>i===index?{...e,chord:normalizeChordQualityAliases(event.target.value)}:e))}/>
     <button type="button" className="min-h-9 rounded border text-rose-700" aria-label={zh?`移除追加和弦 ${index+1}`:`Remove additional chord ${index+1}`} onClick={()=>{const next=entries.filter((_,i)=>i!==index);onChange(next.length?next:undefined);}}>{zh?'移除':'×'}</button>
    </div>;
  })}
  <div className="flex overflow-hidden rounded border border-indigo-200 bg-indigo-50 font-bold text-indigo-700">
    <button type="button" disabled={!nextPosition} onClick={() => addChord(nextPosition)}
      className="min-h-11 flex-1 px-2 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-40">
      {zh ? '新增拍內和弦' : 'Add chord within beat'}{nextPosition && ` · ${chordEventLabel(nextPosition.beat, nextPosition.offset)}`}
    </button>
    {available.length > 1 && (
      <button type="button" ref={positionToggle} aria-expanded={showPositions} aria-controls={showPositions ? positionListId : undefined}
        aria-label={zh ? '選擇其他拍位' : 'Choose another beat position'}
        title={zh ? '選擇其他拍位' : 'Choose another beat position'}
        onClick={() => setShowPositions(open => !open)}
        className="grid min-h-11 w-11 shrink-0 place-items-center border-l border-indigo-200 focus-visible:outline-2 focus-visible:-outline-offset-2">
        <ChevronDown size={16} aria-hidden="true" className={showPositions ? 'rotate-180' : undefined} />
      </button>
    )}
  </div>
  {available.length > 1 && showPositions && (
    <div id={positionListId} role="group" aria-label={zh ? '可新增的拍位' : 'Available beat positions'}
      className="flex max-h-48 flex-wrap gap-1 overflow-y-auto overscroll-contain">
      {available.map(position => {
        const label = chordEventLabel(position.beat, position.offset);
        return <button type="button" key={label} onClick={() => addChord(position)}
          className="min-h-11 min-w-11 rounded border border-slate-200 px-2 font-mono focus-visible:outline-2 focus-visible:-outline-offset-2">
          {label}
        </button>;
      })}
    </div>
  )}
 </div>;
}
