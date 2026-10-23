import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Song } from '../types';
import Jianpu from '../components/Jianpu';
import { findJianpuNoteRanges, getJianpuDurationUnits, rebuildJianpuNote, convertRelativeJianpuToAbsoluteNotation, convertAbsoluteJianpuToRelativeNotation, getJianpuGraceNotes, getCanonicalJianpuBeatTokens } from '../utils/jianpuUtils';
import { applyJianpuCommand, DEFAULT_JIANPU_INPUT_MODE, getJianpuBarLayout, getJianpuCursorForNote, getJianpuSelectedNoteAtCursor } from './jianpuEditing';
import { normalizeStoredSong } from './workspace';
import { copyPreviewContent, pastePreviewContent, previewClipboardText } from './previewClipboard';
const target={sectionId:'s',barId:'b'};
const song=(riff='3 | - | 2_3_'):Song=>({title:'Grace',originalKey:'D',currentKey:'D',timeSignature:'3/4',sections:[{id:'s',title:'Intro',bars:[{id:'b',chords:['D'],riff}]}]});
const grace={pitch:'2',accidental:'',octave:0};
afterEach(cleanup);
it('attaches a grace pitch without adding a timed note or changing following positions',()=>{
 const s=song();const cursor=getJianpuCursorForNote(s,target,0,0)!;const a=applyJianpuCommand(s,target,cursor,{type:'set-grace',grace});expect(a.error).toBeNull();expect(a.song.sections[0].bars[0].riff).toBe('{2}3 | - | 2_3_');const n=findJianpuNoteRanges(a.song.sections[0].bars[0].riff!);expect(n).toHaveLength(4);expect(n[0].grace).toEqual(grace);expect(n.reduce((sum,x)=>sum+getJianpuDurationUnits(x.duration,x.dotted,x.triplet),0)).toBe(12);expect(getJianpuBarLayout(a.song,target)?.beats.map(b=>b.notes.map(n=>n.unitStart))).toEqual(getJianpuBarLayout(s,target)?.beats.map(b=>b.notes.map(n=>n.unitStart)));expect(a.cursor).toEqual(cursor);
});
it('preserves grace notes through duration changes and removes them explicitly',()=>{
 const s=song('{2}3 | - | 2_3_'),cursor=getJianpuCursorForNote(s,target,0,0)!;const a=applyJianpuCommand(s,target,cursor,{type:'set-duration',duration:'eighth'});expect(findJianpuNoteRanges(a.song.sections[0].bars[0].riff!)[0].grace).toEqual(grace);const b=applyJianpuCommand(a.song,target,cursor,{type:'set-grace',grace:null});expect(findJianpuNoteRanges(b.song.sections[0].bars[0].riff!)[0].grace).toBeUndefined();expect(getJianpuBarLayout(b.song,target)?.beats[2].notes.map(n=>n.unitStart)).toEqual([0,2]);
});
it('round-trips grace accidentals and octave dots through fixed-do conversion and JSON storage',()=>{
 const notation="({#2'}3_4_) | {b7,}1 | 2=t3=t4=t5_";
 const fixed=convertRelativeJianpuToAbsoluteNotation(notation,'D')!;expect(fixed).toContain("{4'}#4_");expect(convertRelativeJianpuToAbsoluteNotation(convertAbsoluteJianpuToRelativeNotation(fixed,'D'),'D')).toBe(fixed);const s=normalizeStoredSong(JSON.parse(JSON.stringify(song(notation))),0);expect(s.sections[0].bars[0].riff).toBe(notation);expect(findJianpuNoteRanges(notation)[0].slurStart).toBe(true);
});
it('uses the target play key for a fixed-do grace edit without changing its principal note',()=>{
 const s={...song(),jianpuInputAbsolute:true};const c=getJianpuCursorForNote(s,target,0,0)!;const a=applyJianpuCommand(s,target,c,{type:'set-grace',grace:{pitch:'3',accidental:'',octave:0}},DEFAULT_JIANPU_INPUT_MODE,{playKeyByBarId:{b:'D'}});expect(a.song.sections[0].bars[0].riff).toBe('{2}3 | - | 2_3_');expect(getJianpuSelectedNoteAtCursor(a.song,target,c,{playKeyByBarId:{b:'D'}})?.grace).toEqual({pitch:'3',accidental:'',octave:0});
});
it('rejects rests, empty insertion positions and malformed grace pitches',()=>{
 for(const riff of ['0 | - | 2_3_',' | - | 2_3_']){const s=song(riff);const a=applyJianpuCommand(s,target,{beatIndex:0,unitIndex:0,noteIndex:riff.startsWith('0')?0:null},{type:'set-grace',grace});expect(a.error).not.toBeNull();expect(a.song).toBe(s);}
 const s=song();const a=applyJianpuCommand(s,target,{beatIndex:0,unitIndex:0,noteIndex:0},{type:'set-grace',grace:{...grace,pitch:'0'}});expect(a.error).not.toBeNull();
});
it('drops the ornament when replacing its principal with a rest, and keeps it on pitch changes',()=>{
 const s=song('{2}3 | - | 2_3_'),c=getJianpuCursorForNote(s,target,0,0)!;const a=applyJianpuCommand(s,target,c,{type:'insert-pitch',pitch:'4'});expect(a.song.sections[0].bars[0].riff).toBe('{2}4 | - | 2_3_');const b=applyJianpuCommand(s,target,c,{type:'insert-rest'});expect(b.song.sections[0].bars[0].riff).toBe('0 | - | 2_3_');
});
it('keeps ornament, slurs and triplet timing when rebuilding a selected note',()=>{const n=findJianpuNoteRanges('({b2,}3=t)')[0];expect(rebuildJianpuNote(n,{pitch:'5'})).toBe('({b2,}5=t)');expect(rebuildJianpuNote(n,{grace:undefined})).toBe('(3=t)');});
it('renders an ornament and connecting arc in preview and editor without extra timed selection targets',()=>{
 for(const compact of [true,false])for(const renderMode of ['preview','editor']as const){const {container}=render(<Jianpu notation="{2}3 | - | 2_3_" timeSignature="3/4" compact={compact} renderMode={renderMode}/>);expect(container.querySelectorAll('[data-jianpu-grace-note]')).toHaveLength(1);expect(container.querySelector('[data-jianpu-grace-note] path')).not.toBeNull();cleanup();}
});

it('copies and pastes an ornament as part of the principal note with no extra timed slot',()=>{
 const s=song('{2}3 | - | 2_3_');s.sections[0].bars.push({id:'destination',chords:['D']});const clip=copyPreviewContent(s,[target],'jianpu')!;expect(previewClipboardText(clip)).toBe('{2}3 | - | 2_3_');const a=pastePreviewContent(s,[{sectionId:'s',barId:'destination'}],clip);expect(a.error).toBeUndefined();expect(a.song.sections[0].bars[1].riff).toBe('{2}3 | - | 2_3_');expect(findJianpuNoteRanges(a.song.sections[0].bars[1].riff!)).toHaveLength(4);
});

it('keeps a two-note grace group outside the full four-beat principal rhythm',()=>{
 const notation="0 | {1'2'}3' | 2'_.1'= | 6_.5=";
 const n=findJianpuNoteRanges(notation);
 expect(n.map(x=>x.pitch)).toEqual(['0','3','2','1','6','5']);
 expect(n[1].graceNotes).toEqual([{pitch:'1',accidental:'',octave:1},{pitch:'2',accidental:'',octave:1}]);
 expect(n.reduce((sum,x)=>sum+getJianpuDurationUnits(x.duration,x.dotted,x.triplet),0)).toBe(16);
 const plain={...song(notation.replace("{1'2'}",'')),timeSignature:'4/4'},ornamented={...plain,sections:[{...plain.sections[0],bars:[{...plain.sections[0].bars[0],riff:notation}]}]};
 expect(getJianpuBarLayout(ornamented,target)?.beats.map(b=>b.notes.map(n=>[n.unitStart,n.unitEnd]))).toEqual(getJianpuBarLayout(plain,target)?.beats.map(b=>b.notes.map(n=>[n.unitStart,n.unitEnd])));
});

it('round-trips every pitch in a grace group through fixed-do editing, slurs and storage',()=>{
 const notation="({#2'b7,}3_4_) | 5 | 6";
 const fixed=convertRelativeJianpuToAbsoluteNotation(notation,'D')!;
 expect(fixed).toContain("{4'1}#4_");
 expect(convertRelativeJianpuToAbsoluteNotation(convertAbsoluteJianpuToRelativeNotation(fixed,'D'),'D')).toBe(fixed);
 const s={...song(),jianpuInputAbsolute:true},c=getJianpuCursorForNote(s,target,0,0)!;
 const graces=[{pitch:'3',accidental:'',octave:1},{pitch:'4',accidental:'#',octave:0}];
 const a=applyJianpuCommand(s,target,c,{type:'set-graces',graces},DEFAULT_JIANPU_INPUT_MODE,{playKeyByBarId:{b:'D'}});
 expect(a.error).toBeNull();expect(a.song.sections[0].bars[0].riff).toBe("{2'3}3 | - | 2_3_");
 expect(getJianpuGraceNotes(getJianpuSelectedNoteAtCursor(a.song,target,c,{playKeyByBarId:{b:'D'}})!)).toEqual(graces);
 expect(normalizeStoredSong(JSON.parse(JSON.stringify(a.song)),0).sections[0].bars[0].riff).toBe(a.song.sections[0].bars[0].riff);
 const original=findJianpuNoteRanges(notation)[0];expect(rebuildJianpuNote(original,{pitch:'5'})).toBe("({#2'b7,}5_");
 expect(rebuildJianpuNote(original,{grace:undefined})).toBe('(3_');
});
it('keeps grouped pitches together when spaces separate ornaments and beats',()=>{
 const notation="{1' 2'}3' 4 5 6";
 expect(getCanonicalJianpuBeatTokens(notation,'4/4')).toEqual(["{1' 2'}3'",'4','5','6']);
 expect(findJianpuNoteRanges(notation).map(n=>n.pitch)).toEqual(['3','4','5','6']);
 const {container}=render(<Jianpu notation={notation} timeSignature="4/4"/>);
 expect(container.querySelectorAll('[data-jianpu-grace-pitch]')).toHaveLength(2);
});
it('rejects an invalid second ornament without partially applying the first',()=>{
 const s=song(),c=getJianpuCursorForNote(s,target,0,0)!;
 for(const invalid of [{pitch:'0',accidental:'',octave:0},{pitch:'2',accidental:'x',octave:0},{pitch:'2',accidental:'',octave:3}]){
 const a=applyJianpuCommand(s,target,c,{type:'set-graces',graces:[grace,invalid]});expect(a.error).not.toBeNull();expect(a.song).toBe(s);
 }
});
it('preserves the entire group on principal pitch/duration edits and clears it for a rest',()=>{
 const s=song("{1'2'}3 | - | 2_3_"),c=getJianpuCursorForNote(s,target,0,0)!;
 const a=applyJianpuCommand(s,target,c,{type:'insert-pitch',pitch:'4'});expect(a.song.sections[0].bars[0].riff).toBe("{1'2'}4 | - | 2_3_");
 const b=applyJianpuCommand(s,target,c,{type:'set-duration',duration:'eighth'});expect(getJianpuGraceNotes(findJianpuNoteRanges(b.song.sections[0].bars[0].riff!)[0])).toHaveLength(2);
 const removed=applyJianpuCommand(s,target,c,{type:'set-graces',graces:[]});expect(removed.song.sections[0].bars[0].riff).toBe('3 | - | 2_3_');
 expect(applyJianpuCommand(s,target,c,{type:'insert-rest'}).song.sections[0].bars[0].riff).toBe('0 | - | 2_3_');
});
it('copies the entire group and renders both pitches, dots, beam and arc without timed targets',()=>{
 const s=song("0 | {1'2'}3' | 2'_.1'= | 6_.5=");s.timeSignature='4/4';s.sections[0].bars.push({id:'destination',chords:[]});
 const clip=copyPreviewContent(s,[target],'jianpu')!;
 const pasted=pastePreviewContent(s,[{sectionId:'s',barId:'destination'}],clip);expect(pasted.error).toBeUndefined();
 expect(pasted.song.sections[0].bars[1].riff).toBe(s.sections[0].bars[0].riff);
 for(const compact of [false,true])for(const renderMode of ['preview','editor'] as const){
 const {container}=render(<Jianpu notation={s.sections[0].bars[0].riff} timeSignature="4/4" compact={compact} renderMode={renderMode} onNoteClick={()=>{}}/>);
 const ornament=container.querySelector('[data-jianpu-grace-note]')!;expect([...ornament.querySelectorAll('[data-jianpu-grace-pitch]')].map(n=>n.textContent)).toEqual(['1','2']);expect(ornament.querySelectorAll('circle')).toHaveLength(2);expect(ornament.querySelectorAll('path')).toHaveLength(2);expect(ornament.querySelectorAll('button')).toHaveLength(0);cleanup();
 }
});
