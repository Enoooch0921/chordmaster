import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import type {Song} from '../types';
import ChordSheet from '../components/ChordSheet';
import {normalizeStoredSong} from './workspace';
import {getChordEvents,availableSubdivisionPositions} from '../utils/chordSubdivisions';
import {applyBarKeyChange,insertChordBeatBeforeSlot,setChordAtBeatSlot,setChordBeatOffset,setBarChordText,isBarCompletelyEmpty,updateEditableBarFields} from './songEditing';
import {copyPreviewContent,pastePreviewContent,previewClipboardText} from './previewClipboard';
import {createPreviewEditSession,applyPreviewDraft,undoPreviewDraft,redoPreviewDraft} from './previewEditSession';
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
afterEach(cleanup);
const song=():Song=>({title:'Subbeats',chordTimingVersion:2,originalKey:'G',currentKey:'G',timeSignature:'4/4',sections:[{id:'s',title:'Bridge',bars:[{id:'b',chords:['Am','Am/C','',''],chordSubdivisions:[{beat:0,offset:.5,chord:'Am/B'},{beat:1,offset:.5,chord:'G/D'}],annotation:'original',rhythm:'e e e e qr qr',riff:'1 | 2 | 3 | 4'},{id:'next',chords:[],keyChangeTo:'A'}]}]});
const target={sectionId:'s',barId:'b',slotIndex:0};
const bar=(s:Song)=>s.sections[0].bars[0];
it('round trips every additional attack and preserves meter, lyrics and unrelated data',()=>{
 const s=song();const n=normalizeStoredSong(JSON.parse(JSON.stringify(s)),0);expect(bar(n).chordSubdivisions).toEqual(bar(s).chordSubdivisions);expect(getChordEvents(bar(n),4).map(e=>[e.beat+e.offset,e.chord])).toEqual([[0,'Am'],[.5,'Am/B'],[1,'Am/C'],[1.5,'G/D']]);expect(bar(n).rhythm).toBe(bar(s).rhythm);expect(n.timeSignature).toBe('4/4');expect(isBarCompletelyEmpty({chords:[],chordSubdivisions:bar(s).chordSubdivisions})).toBe(false);
});
it('does not offer occupied times or times covered by rests and prevents primary timing collisions',()=>{
 const s=song();expect(availableSubdivisionPositions(bar(s),4)).not.toContainEqual({beat:0,offset:.5});expect(setChordBeatOffset(s,target,.5)).toBe(s);const rested=setChordAtBeatSlot(s,target,'0h');expect(bar(rested).chordSubdivisions).toBeUndefined();expect(availableSubdivisionPositions(bar(rested),4).every(e=>e.beat>=2)).toBe(true);expect(bar(setChordAtBeatSlot(s,target,'%')).chordSubdivisions).toBeUndefined();
});
it('moves events with inserted beats and preserves them when editing ordinary chord names',()=>{
 const s=song(),edited=setChordAtBeatSlot(s,target,'A7');expect(bar(edited).chordSubdivisions).toEqual(bar(s).chordSubdivisions);const moved=insertChordBeatBeforeSlot(s,target);expect(bar(moved).chordSubdivisions?.map(e=>e.beat)).toEqual([1,2]);expect(bar(setBarChordText(s,target,'').song).chordSubdivisions).toBeUndefined();
});
it('copies additional chords into a new key and transposes them with a written-key change',()=>{
 const s=song(),clip=copyPreviewContent(s,[target],'chords')!;expect(previewClipboardText(clip)).toContain('1&: Am/B');const result=pastePreviewContent(s,[{sectionId:'s',barId:'next'}],clip);expect(result.song.sections[0].bars[1].chordSubdivisions?.map(e=>e.chord)).toEqual(['Bm/C#','A/E']);expect(bar(applyBarKeyChange(s,target,'A')).chordSubdivisions?.map(e=>e.chord)).toEqual(['Bm/C#','A/E']);expect(bar(s).chordSubdivisions?.[0].chord).toBe('Am/B');
});
it('retains additional chords in bar copies, undo/redo and meter changes',()=>{
 const s=song();const copied=pastePreviewContent(s,[{sectionId:'s',barId:'next'}],copyPreviewContent(s,[target],'bars')!);expect(copied.song.sections[0].bars.some(b=>b.chordSubdivisions?.length===2&&b.id!=='b')).toBe(true);
 const session=createPreviewEditSession({song:s,target:{...target,kind:'bar',field:'chords',previewIdentity:'x',rawChordIndex:0,anchorKey:'x',anchorRect:{left:0,top:0,right:1,bottom:1,width:1,height:1}},inputMode:'letters'});const updated=updateEditableBarFields(s,target,{chordSubdivisions:[{beat:3,offset:.5,chord:'D'}]});const edited=applyPreviewDraft(session,updated);expect(bar(undoPreviewDraft(edited).draftSong).chordSubdivisions).toEqual(bar(s).chordSubdivisions);expect(bar(redoPreviewDraft(undoPreviewDraft(edited)).draftSong).chordSubdivisions).toEqual(bar(updated).chordSubdivisions);const shorter=updateEditableBarFields(updated,target,{timeSignature:'3/4'});expect(getChordEvents(bar(shorter),3).at(-1)?.chord).toBe('D');
});
it('renders all attacks and beat labels in every row layout and transposes letter and Nashville views',()=>{
 for(const rows of [1,2,3] as const)for(const numbers of [false,true]){
  const s={...song(),barRowCount:rows,showNashvilleNumbers:numbers};const {container}=render(<ChordSheet song={s} currentKey="A" language="zh"/>);const events=[...container.querySelectorAll('[data-chord-event-position]')];expect(events.map(e=>(e as HTMLElement).dataset.chordEventPosition)).toEqual(['1','1&','2','2&']);expect(events[1].textContent).toContain(numbers?'2m/3':'Bm/C#');cleanup();
 }
});
it('renders an additional-only harmony alongside rhythm rather than hiding it',()=>{
 const s=song();bar(s).chords=[];const {container}=render(<ChordSheet song={s} currentKey="G" language="zh"/>);expect(container.querySelectorAll('[data-chord-event-kind="additional"]')).toHaveLength(2);
});
it('normalizes imported event data without accepting invalid timing or duplicate positions',()=>{
 const s=song();bar(s).chordSubdivisions=[{beat:1,offset:.5,chord:'G/D'},{beat:0,offset:.5,chord:' Am/B '},{beat:0,offset:.5,chord:'C'},{beat:-1,offset:.5,chord:'C'},{beat:0,offset:.3,chord:'C'},{beat:0,offset:.25,chord:'0w'},{beat:0,offset:.75,chord:'C>'}] as any;
 expect(bar(normalizeStoredSong(s,0)).chordSubdivisions).toEqual([{beat:0,offset:.5,chord:'Am/B'},{beat:1,offset:.5,chord:'G/D'}]);
});
it('remaps compact primary timing before checking conflicts with additional events',()=>{
 const s=song();bar(s).chords=['C','G'];bar(s).chordMarks={1:{beatOffset:.5}};bar(s).chordSubdivisions=[{beat:1,offset:.5,chord:'Am'}];
 const changed=setChordAtBeatSlot(s,{...target,slotIndex:1},'D');expect(bar(changed).chordSubdivisions).toEqual([{beat:1,offset:.5,chord:'Am'}]);expect(bar(changed).chordMarks).toEqual({2:{beatOffset:.5}});
});
