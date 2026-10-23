import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import Jianpu from '../components/Jianpu';
import type { Song } from '../types';
import { findJianpuNoteRanges, getJianpuDurationUnits, rebuildJianpuNote, convertRelativeJianpuToAbsoluteNotation, convertAbsoluteJianpuToRelativeNotation } from '../utils/jianpuUtils';
import { applyJianpuCommand, getJianpuCursorForNote, getJianpuBarLayout } from './jianpuEditing';
import { normalizeStoredSong } from './workspace';
import { copyPreviewContent, pastePreviewContent } from './previewClipboard';
const target={sectionId:'s',barId:'b'};
const song=(riff="6_! 6_! | 6_! 1_! | 1_! 1_! | 7"):Song=>({title:'Accent source',originalKey:'C',currentKey:'C',timeSignature:'4/4',sections:[{id:'s',title:'Riff',bars:[{id:'b',chords:['F'],riff}]}]});
afterEach(cleanup);

it('keeps six accents on the six sounded eighths without shifting their pitches or time',()=>{
 const s=song(),plain=song(s.sections[0].bars[0].riff!.replace(/!/g,''));
 const notes=findJianpuNoteRanges(s.sections[0].bars[0].riff!);
 expect(notes.map(n=>n.pitch)).toEqual(['6','6','6','1','1','1','7']);
 expect(notes.map(n=>Boolean(n.accent))).toEqual([true,true,true,true,true,true,false]);
 expect(notes.reduce((sum,n)=>sum+getJianpuDurationUnits(n.duration,n.dotted,n.triplet),0)).toBe(16);
 expect(getJianpuBarLayout(s,target)?.beats.map(b=>b.notes.map(n=>[n.unitStart,n.unitEnd]))).toEqual(getJianpuBarLayout(plain,target)?.beats.map(b=>b.notes.map(n=>[n.unitStart,n.unitEnd])));
 expect(findJianpuNoteRanges('0! -! 5!').map(n=>n.accent)).toEqual([undefined,undefined,true]);
});

it('retains dots, grace group, tie, phrase and accent through fixed-do conversion and rebuilding',()=>{
 const notation="[({1'2'}#6_.! 6_!) | 1'! | 5 | 7]";
 const fixed=convertRelativeJianpuToAbsoluteNotation(notation,'D')!;
 expect(findJianpuNoteRanges(fixed).filter(n=>n.accent)).toHaveLength(3);
 expect(convertRelativeJianpuToAbsoluteNotation(convertAbsoluteJianpuToRelativeNotation(fixed,'D'),'D')).toBe(fixed);
 const n=findJianpuNoteRanges(notation)[0];expect(rebuildJianpuNote(n,{pitch:'5'})).toBe("[({1'2'}#5_.!");
 expect(rebuildJianpuNote(n,{accent:false})).toBe("[({1'2'}#6_.");
 expect(rebuildJianpuNote(n,{pitch:'0'})).toBe('[(0_.');
});

it('preserves the source accent on pitch and duration edits and drops it when replaced by a rest',()=>{
 const s=song(),c=getJianpuCursorForNote(s,target,0,0)!;
 for(const action of [{type:'insert-pitch',pitch:'5'},{type:'set-duration',duration:'sixteenth'}]as const){
  const a=applyJianpuCommand(s,target,c,action);expect(a.error).toBeNull();expect(findJianpuNoteRanges(a.song.sections[0].bars[0].riff!)[0].accent).toBe(true);
 }
 const rest=applyJianpuCommand(s,target,c,{type:'insert-rest'});expect(rest.error).toBeNull();expect(findJianpuNoteRanges(rest.song.sections[0].bars[0].riff!)[0].accent).toBeUndefined();
});

it('round-trips the source through storage and clipboard without changing other music',()=>{
 const s=normalizeStoredSong(JSON.parse(JSON.stringify(song())),0);s.sections[0].bars.push({id:'dest',chords:['G'],rhythm:'q q q q',repeatEnd:true});
 const clip=copyPreviewContent(s,[target],'jianpu')!;const pasted=pastePreviewContent(s,[{sectionId:'s',barId:'dest'}],clip);
 expect(pasted.error).toBeUndefined();expect(pasted.song.sections[0].bars[1]).toMatchObject({chords:['G'],rhythm:'q q q q',repeatEnd:true,riff:s.sections[0].bars[0].riff});
 expect(findJianpuNoteRanges(pasted.song.sections[0].bars[1].riff!).filter(n=>n.accent)).toHaveLength(6);
});

it('renders accents above high dots in preview and editor without adding timed note targets',()=>{
 for(const compact of [false,true])for(const renderMode of ['preview','editor']as const){
 const{container}=render(<Jianpu notation="0 | 0 | 5'! | 5'!" compact={compact} renderMode={renderMode} onNoteClick={()=>{}}/>);
 const marks=[...container.querySelectorAll<SVGElement>('[data-jianpu-accent]')];expect(marks).toHaveLength(2);
 expect(container.querySelectorAll('button[aria-label^="Select jianpu note"]')).toHaveLength(4);
 expect(marks.map(n=>n.getAttribute('data-jianpu-accent-token'))).toEqual(['2','3']);
 const dots=[...container.querySelectorAll<HTMLElement>('span.rounded-full')];expect(dots).toHaveLength(2);
 expect(parseFloat(marks[0].style.top)+parseFloat(marks[0].style.height)).toBeLessThan(parseFloat(dots[0].style.top));cleanup();
 }
});

it('keeps unaccented legacy geometry unchanged and reserves height only for accented notation',()=>{
 const plain=render(<Jianpu notation="6_6_ | 6_1_ | 1_1_ | 7" compact/>);expect((plain.container.firstElementChild as HTMLElement).style.height).toBe('20px');expect(plain.container.querySelector('[data-jianpu-accent]')).toBeNull();cleanup();
 const accented=render(<Jianpu notation={song().sections[0].bars[0].riff} compact/>);expect((accented.container.firstElementChild as HTMLElement).style.height).toBe('30px');expect(accented.container.querySelectorAll('[data-jianpu-accent]')).toHaveLength(6);
});
