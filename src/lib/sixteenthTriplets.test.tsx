import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Song } from '../types';
import { buildJianpuNoteFromMode, buildJianpuPlaceholderFromUnits, convertRelativeJianpuToAbsoluteNotation, convertAbsoluteJianpuToRelativeNotation, findJianpuNoteRanges, findJianpuPlaceholderRanges, getJianpuDurationUnits } from '../utils/jianpuUtils';
import { parseRhythmNotation, normalizeRhythmToken } from '../utils/rhythmUtils';
import { type JianpuCommandResult, applyJianpuCommand, DEFAULT_JIANPU_INPUT_MODE, getJianpuBarLayout, getJianpuCursorForNote, getJianpuInputAvailability } from './jianpuEditing';
import { applyRhythmEdit } from './rhythmEditing';
import { normalizeStoredSong } from './workspace';
import Jianpu from '../components/Jianpu';
import RhythmNotation from '../components/RhythmNotation';
const target = { sectionId: 's', barId: 'b' };
const mode = { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'sixteenth' as const, triplet: true };
const song = (riff = ''): Song => ({ title: 'Triplets', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [{ id: 's', title: 'Intro', bars: [{ id: 'b', chords: ['C'], riff }] }] });
afterEach(cleanup);
it('round-trips pitch, accidental, octave and sixteenth-note triplet timing', () => {
 const canonical = "0_ (#2'=t 4=t 5=t) | 3_ 3_ | 3=t 4=t 5=t 3_ | 2_ 1_";
 const notes = findJianpuNoteRanges(canonical);
 expect(notes.filter(n => n.triplet)).toHaveLength(6);
 expect(notes.reduce((sum,n) => sum + getJianpuDurationUnits(n.duration,n.dotted,n.triplet), 0)).toBeCloseTo(16);
 expect(convertAbsoluteJianpuToRelativeNotation(convertRelativeJianpuToAbsoluteNotation(canonical,'F#'),'F#')).toBe(canonical);
 expect(buildJianpuNoteFromMode('3',mode)).toBe('3=t');
 expect(normalizeStoredSong(JSON.parse(JSON.stringify(song(canonical))),0).sections[0].bars[0].riff).toBe(canonical);
});
it('inserts a full half-beat group after an eighth rest without shifting later beats', () => {
 let result: JianpuCommandResult = { song: song('0_ | 1 | 2 | 3'), cursor: { beatIndex: 0, unitIndex: 2, noteIndex: null as number|null }, inputMode: mode, error: null as string|null, target };
 for (const pitch of ['3','4','5'] as const) { result = applyJianpuCommand(result.song,target,result.cursor,{type:'insert-pitch',pitch},result.inputMode); expect(result.error).toBeNull(); }
 expect(result.song.sections[0].bars[0].riff).toBe('0_3=t4=t5=t | 1 | 2 | 3');
 expect(result.cursor).toMatchObject({beatIndex:1,unitIndex:0});
 expect(getJianpuBarLayout(result.song,target)?.beats[0].usedUnits).toBeCloseTo(4);
});
it('toggles an ordinary sixteenth to triplet and back while preserving the adjacent note', () => {
 const s=song('1=2=3_ | 4 | 5 | 6');const cursor=getJianpuCursorForNote(s,target,0,0)!;
 const a=applyJianpuCommand(s,target,cursor,{type:'toggle-triplet'},DEFAULT_JIANPU_INPUT_MODE);
 expect(a.error).toBeNull();expect(a.song.sections[0].bars[0].riff).toBe('1=ty2=3_ | 4 | 5 | 6');
 expect(getJianpuBarLayout(a.song,target)?.beats[0].notes[1].unitStart).toBeCloseTo(1);
 const b=applyJianpuCommand(a.song,target,cursor,{type:'toggle-triplet'},a.inputMode);
 expect(b.error).toBeNull();expect(b.song.sections[0].bars[0].riff).toBe(s.sections[0].bars[0].riff);
});
it('keeps fractional gap durations exact for resizing and deleting triplets', () => {
 for(let i=1;i<49;i++){const units=i/3;const p=findJianpuPlaceholderRanges(buildJianpuPlaceholderFromUnits(units));expect(p.reduce((a,b)=>a+b.units,0)).toBeCloseTo(units);}
 const s=song('1=t2=t3=t4_ | 5 | 6 | 7');const c=getJianpuCursorForNote(s,target,0,1)!;
 const a=applyJianpuCommand(s,target,c,{type:'delete'},mode);expect(a.error).toBeNull();
 expect(getJianpuBarLayout(a.song,target)?.beats[0].notes.map(n=>n.unitStart)).toEqual([0,4/3,2]);
 const avail=getJianpuInputAvailability(s,target,{beatIndex:0,unitIndex:2/3,noteIndex:1},mode);
 expect(avail.canSixteenth).toBe(true);expect(avail.canTriplet).toBe(true);
});
it('renders consecutive half-beat groups with separate 3 marks in preview and editor', () => {
 for(const compact of [true,false])for(const renderMode of ['preview','editor'] as const){const {container}=render(<Jianpu notation="1=t2=t3=t4=t5=t6=t | 1_t2_t3_t | 1 2" compact={compact} renderMode={renderMode}/>);expect(container.querySelectorAll('[data-jianpu-triplet-mark]')).toHaveLength(3);cleanup();}
});
it('parses sixteenth rhythm triplet notes, rests, crossheads and ties at exact duration', () => {
 const p=parseRhythmNotation('er s3c s3r s3~ e e s3 s3 s3 e q','4/4');expect(p.invalidTokens).toEqual([]);expect(p.totalUnits).toBeCloseTo(16);expect(p.events[1].durationUnits).toBeCloseTo(2/3);expect(p.events[2].isRest).toBe(true);expect(normalizeRhythmToken('s3cu')).toBe('s3cu');
});
it('inserts rhythm triplets with fractional cursors and preserves subsequent notes',()=>{
 let s=song();s.sections[0].bars[0].rhythm='er ex q q q';let cursor={cursorUnit:2};
 for(let i=0;i<3;i++){const result=applyRhythmEdit(s,target,cursor,{type:'insert',token:'s3'});expect(result.error).toBeNull();s=result.song;cursor=result.cursor;}
 const starts=parseRhythmNotation(s.sections[0].bars[0].rhythm!,'4/4').events.filter(e=>!e.isHidden).map(e=>e.startUnit);expect(starts).toHaveLength(7);[0,2,8/3,10/3,4,8,12].forEach((x,i)=>expect(starts[i]).toBeCloseTo(x));
});
it('renders sixteenth rhythm triplet labels and two beams in both renderer paths',()=>{
 for(const compact of [true,false]){const {container}=render(<RhythmNotation notation="er s3 s3 s3 q q q" timeSignature="4/4" compact={compact}/>);expect(container.querySelector('[data-rhythm-triplet-base="s"]')).not.toBeNull();cleanup();}
});

it('replaces an ordinary sixteenth with a triplet while leaving the next hit on time',()=>{
 const s=song();s.sections[0].bars[0].rhythm='s s e q q q';const a=applyRhythmEdit(s,target,{cursorUnit:0},{type:'insert',token:'s3'});expect(a.error).toBeNull();const p=parseRhythmNotation(a.song.sections[0].bars[0].rhythm!,'4/4');expect(p.events.filter(e=>!e.isHidden)[1].startUnit).toBeCloseTo(1);expect(p.events.find(e=>e.token==='y')?.durationUnits).toBeCloseTo(1/3);
});
