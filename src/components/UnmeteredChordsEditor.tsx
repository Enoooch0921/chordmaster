import React from 'react';
import type { AppLanguage } from '../types';
import { parseUnmeteredChordText, unmeteredChordText } from '../utils/unmeteredChords';
import { normalizeChordQualityAliases } from '../utils/musicUtils';

export default function UnmeteredChordsEditor({lines,language,onChange,withinMeasure=false,keyUnspecified=false}:{lines:string[][];language:AppLanguage;onChange:(lines:string[][])=>void;withinMeasure?:boolean;keyUnspecified?:boolean}) {
 const value=unmeteredChordText(lines),[draft,setDraft]=React.useState(value);
 // Keep trailing input whitespace, but follow external undo/redo changes.
 React.useEffect(()=>{
  setDraft(current=>unmeteredChordText(parseUnmeteredChordText(current))===value?current:value);
 },[value]);
 return <label className="flex min-h-0 w-full flex-col gap-2 text-xs font-semibold text-slate-700">
  <span>{language==='zh'?'未定拍位和弦序列':'Chords without specified timing'}</span>
  <span className="text-[11px] font-normal text-slate-500">{keyUnspecified
   ? (language==='zh'?'保留原譜級數與和弦順序；目的調未標，不換成字母和弦。':'Keep the source degrees and chord order; the destination key is unspecified.')
   : withinMeasure
   ? (language==='zh'?'保留這一小節的和弦順序；以空白分隔，使用譜面原調。切換拍位仍待核。':'Keep the chord order within this measure, separated by spaces in the written key. Beat positions remain unspecified.')
   : (language==='zh'?'依原譜分行，和弦以空白分隔；使用譜面原調。未標明的拍位仍待核。':'Keep source lines; separate chords with spaces in the written key. Timing remains unspecified.')}</span>
  <textarea aria-label={language==='zh'?'未定拍位和弦序列':'Chords without specified timing'} value={draft} rows={Math.max(3,Math.min(8,lines.length+1))} spellCheck={false} className="min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white p-2 font-mono text-sm leading-6 text-slate-900" onChange={event=>{const text=event.target.value.replace(/\S+/g,normalizeChordQualityAliases);setDraft(text);onChange(parseUnmeteredChordText(text))}}/>
 </label>;
}
