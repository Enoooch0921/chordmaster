import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Song } from '../types';
import ChordSheet from '../components/ChordSheet';
import { normalizeStoredSong } from './workspace';
import { getChordBeatOffset, setRawChordBeatOffset } from '../utils/chordBeatOffsets';
import { setChordBeatOffset, setChordAtBeatSlot, insertChordBeatBeforeSlot, clearChordAtBeatSlot } from './songEditing';
import { copyPreviewContent, pastePreviewContent } from './previewClipboard';
import { createPreviewEditSession, applyPreviewDraft, undoPreviewDraft, redoPreviewDraft } from './previewEditSession';
const song = ():Song => ({title:'Timing',chordTimingVersion:2,originalKey:'E',currentKey:'E',timeSignature:'4/4',sections:[{id:'s',title:'Chorus',bars:[{id:'b',chords:['A','Bsus4','',''],chordMarks:{1:{color:'rose'}},rhythm:'s s s s s q. q'},{id:'next',chords:[]}]}]});
const target={sectionId:'s',barId:'b',slotIndex:1};
const bar=(s:Song)=>s.sections[0].bars[0];
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
afterEach(cleanup);
it('stores 2e without changing any chord, rhythm or bar duration and resets independently of color',()=>{
 const s=song(), result=setChordBeatOffset(s,target,.25);expect(bar(result).chordMarks).toEqual({1:{color:'rose',beatOffset:.25}});expect(bar(result).chords).toEqual(bar(s).chords);expect(bar(result).rhythm).toBe(bar(s).rhythm);expect(bar(s).chordMarks).toEqual({1:{color:'rose'}});expect(bar(setChordBeatOffset(result,target,0)).chordMarks).toEqual({1:{color:'rose'}});
});
it('remaps timing with compact chord slots and insertion, and removes it with a deleted or rest chord',()=>{
 const s=song();bar(s).chords=['A','B'];bar(s).chordMarks={1:{beatOffset:.25}};
 const edited=setChordAtBeatSlot(s,{...target,slotIndex:2},'C#m7');expect(bar(edited).chordMarks).toEqual({2:{beatOffset:.25}});
 const shifted=insertChordBeatBeforeSlot(edited,{...target,slotIndex:1});expect(bar(shifted).chordMarks).toEqual({3:{beatOffset:.25}});
 expect(bar(clearChordAtBeatSlot(shifted,{...target,slotIndex:3})).chordMarks).toBeUndefined();
 expect(bar(setChordAtBeatSlot(edited,{...target,slotIndex:2},'0')).chordMarks).toBeUndefined();
});
it('chooses either explicit timing or a push/pull arrow while preserving accent and color',()=>{
 const s=song();bar(s).chords[1]='Bsus4<^';const precise=setChordBeatOffset(s,target,.25);expect(bar(precise).chords[1]).toBe('Bsus4^');expect(bar(precise).chordMarks?.[1].color).toBe('rose');const arrow=setChordAtBeatSlot(precise,target,'Bsus4>^');expect(getChordBeatOffset(bar(arrow),1)).toBeUndefined();expect(bar(arrow).chordMarks).toEqual({1:{color:'rose'}});
});
it('rejects invalid offsets and unsupported symbols, and normalizes imported metadata',()=>{
 const s=song();for(const value of [-.25,1,.3,NaN,Infinity])expect(setChordBeatOffset(s,target,value)).toBe(s);
 for(const chord of ['', '/', '%','0','0w','|4|']){const b={...bar(s),chords:[chord]};expect(setRawChordBeatOffset(b,0,.25)).toBe(b);}
 const raw=structuredClone(s);bar(raw).chordMarks={0:{beatOffset:.3 as any},1:{beatOffset:.25,color:'rose'},8:{beatOffset:.5}};
 const normalized=normalizeStoredSong(JSON.parse(JSON.stringify(raw)),0);expect(bar(normalized).chordMarks).toEqual({1:{beatOffset:.25,color:'rose'}});
 expect(bar(normalizeStoredSong(JSON.parse(JSON.stringify(normalized)),0)).chordMarks).toEqual(bar(normalized).chordMarks);
});
it('keeps offsets through chord copying, transposition and undo/redo',()=>{
 const s=setChordBeatOffset(song(),target,.25);s.sections[0].bars[1].keyChangeTo='D';const copied=pastePreviewContent(s,[{sectionId:'s',barId:'next'}],copyPreviewContent(s,[target],'chords')!);expect(copied.error).toBeUndefined();expect(copied.song.sections[0].bars[1].chordMarks?.[1].beatOffset).toBe(.25);
 const session=createPreviewEditSession({song:song(),target:{...target,kind:'bar',previewIdentity:'x',field:'chords',rawChordIndex:1,anchorKey:'x',anchorRect:{left:0,top:0,right:1,bottom:1,width:1,height:1}},inputMode:'letters'});
 const edited=applyPreviewDraft(session,s);expect(bar(undoPreviewDraft(edited).draftSong).chordMarks?.[1].beatOffset).toBeUndefined();expect(bar(redoPreviewDraft(undoPreviewDraft(edited)).draftSong).chordMarks?.[1].beatOffset).toBe(.25);
});
it('renders the explicit 2e anchor in every row layout, key and Nashville view used by preview and PDF',()=>{
 for(const rows of [1,2,3]as const)for(const numbers of [false,true]){const s={...setChordBeatOffset(song(),target,.25),barRowCount:rows,showNashvilleNumbers:numbers};const {container}=render(<ChordSheet song={s} currentKey="D" language="zh"/>);const anchor=container.querySelector('[data-chord-beat-position="2e"]') as HTMLElement;expect(anchor).not.toBeNull();expect(anchor.style.transform).toBe('translateX(25%)');expect(anchor.querySelector('[data-chord-beat-label]')?.textContent).toBe('2e');expect(container.querySelectorAll('[data-chord-beat-offset]')).toHaveLength(1);cleanup();}
});
