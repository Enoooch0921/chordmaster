import React from 'react';
import {cleanup,render} from '@testing-library/react';
import {afterEach,beforeAll,afterAll,describe,expect,it,vi} from 'vitest';
import Jianpu from '../components/Jianpu';
import ChordSheet from '../components/ChordSheet';
import type {Song} from '../types';
import {findJianpuNoteRanges,getJianpuDurationUnits,getJianpuPhraseSegments,convertRelativeJianpuToAbsoluteNotation,convertAbsoluteJianpuToRelativeNotation,rebuildJianpuNote} from '../utils/jianpuUtils';
import {applyJianpuCommand,getJianpuCursorForNote,getJianpuBarLayout} from './jianpuEditing';
import {normalizeStoredSong} from './workspace';
import {copyPreviewContent,pastePreviewContent,previewClipboardText} from './previewClipboard';
const first="[5'_ 4'_ | 4'_ (3'_ | 3'_) 1'] | [(5_";
const second="5_) 4_ | 4_ (3_ | 3_) 1.] | ";
const makeSong=():Song=>({title:'Phrases',originalKey:'F',currentKey:'F',timeSignature:'4/4',sections:[{id:'s',title:'Intro',bars:[{id:'a',chords:['Bb'],riff:first},{id:'b',chords:['Gm7'],riff:second}]}]});
beforeAll(()=>vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}}));
afterEach(cleanup);afterAll(()=>vi.unstubAllGlobals());
describe('phrase arcs independent of ties',()=>{
 it('preserves both outer source arcs, every inner tie and all measured onsets',()=>{
  const a=findJianpuNoteRanges(first),b=findJianpuNoteRanges(second);
  expect(getJianpuPhraseSegments(a).map(x=>[x.type,a.indexOf(x.start!),a.indexOf(x.end!)])).toEqual([['pair',0,5],['outgoing',6,-1]]);
  expect(getJianpuPhraseSegments(b,1).map(x=>[x.type,b.indexOf(x.end!)])).toEqual([['incoming',5]]);
  expect(a[3].slurStart&&a[4].slurEnd&&a[6].slurStart&&b[0].slurEnd&&b[3].slurStart&&b[4].slurEnd).toBe(true);
  for(const riff of[first,second])expect(findJianpuNoteRanges(riff).reduce((sum,n)=>sum+getJianpuDurationUnits(n.duration,n.dotted,n.triplet),0)).toBe(16);
  const s=makeSong(),plain=structuredClone(s);plain.sections[0].bars.forEach(x=>x.riff=x.riff!.replace(/[\[\]]/g,''));
  for(const id of['a','b'])expect(getJianpuBarLayout(s,{sectionId:'s',barId:id})?.beats).toEqual(getJianpuBarLayout(plain,{sectionId:'s',barId:id})?.beats);
 });
 it('round-trips phrases, ties and multiple grace notes through fixed-do and JSON',()=>{
  const riff="[({1'2'}#3'_ #3'_) | 4' | 5' | 1']";
  for(const key of['F','D','Ab']as const){const absolute=convertRelativeJianpuToAbsoluteNotation(riff,key)!;expect(convertRelativeJianpuToAbsoluteNotation(convertAbsoluteJianpuToRelativeNotation(absolute,key),key)).toBe(absolute);expect(findJianpuNoteRanges(absolute)[0]).toMatchObject({phraseStartCount:1,slurStart:true});expect(findJianpuNoteRanges(absolute).at(-1)?.phraseEndCount).toBe(1)}
  const s=normalizeStoredSong(JSON.parse(JSON.stringify(makeSong())),0);expect(s.sections[0].bars.map(x=>x.riff)).toEqual([first,second]);
  expect(rebuildJianpuNote(findJianpuNoteRanges('[[(1_')[0],{pitch:'2'})).toBe('[[(2_');
 });
 it.each([true,false])('renders an outer arc above inner ties and resolves its own next-bar endpoint (compact=%s)',compact=>{
  const spy=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(400);
  try{for(const renderMode of['preview','editor']as const){const {container}=render(<Jianpu notation={first} nextNotationForCrossBar={second} compact={compact} renderMode={renderMode}/>);expect(container.querySelectorAll('[data-jianpu-phrase]')).toHaveLength(2);expect(container.querySelectorAll('[data-jianpu-slur]')).toHaveLength(2);const outer=container.querySelector('[data-jianpu-phrase=pair]')!.getAttribute('d')!,inner=container.querySelector('[data-jianpu-slur=pair]')!.getAttribute('d')!;const numbers=(v:string)=>v.match(/-?\d+(?:\.\d+)?/g)!.map(Number);expect(numbers(outer)[3]).toBeLessThan(numbers(inner)[3]);if(compact){const phrase=numbers(container.querySelector('[data-jianpu-phrase=outgoing]')!.getAttribute('d')!),tie=numbers(container.querySelector('[data-jianpu-slur=outgoing]')!.getAttribute('d')!);expect(phrase[6]).toBeGreaterThan(tie[6]+200)}cleanup();}}
  finally{spy.mockRestore()}
 });
 it('splits phrase arcs at row starts and avoids a duplicate incoming arc inside a row',()=>{
  const same=render(<Jianpu notation={second} previousNotationForCrossBar={first} incomingPhraseCount={1} compact/>);expect(same.container.querySelector('[data-jianpu-phrase=incoming]')).toBeNull();cleanup();
  const newRow=render(<Jianpu notation={second} incomingPhraseCount={1} compact/>);expect(newRow.container.querySelectorAll('[data-jianpu-phrase=incoming]')).toHaveLength(1);
 });
 it.each([148,418])('keeps normal-display phrase and tie endpoints on the rendered notes at %s px',width=>{
  const spy=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(width);
  try{const {container}=render(<Jianpu notation={first}/>);const arc=container.querySelector('[data-jianpu-phrase=pair]')!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);const digits=Array.from(container.querySelectorAll<HTMLSpanElement>('span.font-medium'));const centers=digits.map(d=>parseFloat(d.style.left)*width/100);expect(arc[0]).toBeCloseTo(centers[0]-1.2);expect(arc[6]).toBeCloseTo(centers[5]-1.2);const tie=container.querySelector('[data-jianpu-slur=pair]')!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);expect(tie[0]).toBeCloseTo(centers[3]-1.2);expect(tie[6]).toBeCloseTo(centers[4]-1.2)}finally{spy.mockRestore()}
 });
 it('preserves phrases and preceding sustained ties during a pitch edit, and clears a deleted phrase endpoint',()=>{
  const s=makeSong();s.sections[0].bars.unshift({id:'lead',chords:[],riff:"(5' | - | 5'_) | 1'"});
  const t={sectionId:'s',barId:'a'},cursor=getJianpuCursorForNote(s,t,0,1)!;
  const changed=applyJianpuCommand(s,t,cursor,{type:'insert-pitch',pitch:'2'});expect(changed.error).toBeNull();expect(changed.song.sections[0].bars[0].riff).toBe(s.sections[0].bars[0].riff);expect(getJianpuPhraseSegments(changed.song.sections[0].bars.flatMap(x=>findJianpuNoteRanges(x.riff!))).filter(x=>x.type==='pair')).toHaveLength(2);
  const firstCursor=getJianpuCursorForNote(s,t,0,0)!;const removed=applyJianpuCommand(s,t,firstCursor,{type:'delete',direction:'forward'});expect(removed.error).toBeNull();expect(getJianpuPhraseSegments(removed.song.sections[0].bars.flatMap(x=>findJianpuNoteRanges(x.riff!))).filter(x=>x.type==='pair')).toHaveLength(1);expect(findJianpuNoteRanges(removed.song.sections[0].bars[1].riff!).some(x=>x.phraseEndCount)).toBe(false);
 });
 it('copies both phrase and tie endpoints without adding measured events',()=>{
  const s=makeSong(),t={sectionId:'s',barId:'a'};s.sections[0].bars.push({id:'dest',chords:[]});const clip=copyPreviewContent(s,[t],'jianpu')!;expect(previewClipboardText(clip)).toBe(first);const pasted=pastePreviewContent(s,[{sectionId:'s',barId:'dest'}],clip);expect(pasted.error).toBeUndefined();expect(pasted.song.sections[0].bars[2].riff).toBe(first);
 });
 it.each([1,2,3] as const)('carries primary and independent voice phrases across five bars and line breaks (%s rows)',barRowCount=>{
  const s:Song={...makeSong(),barRowCount,sections:[{id:'s',title:'Intro',bars:['[1 | 2 | 3 | 4','1 | 2 | 3 | 4','1 | 2 | 3 | 4','1 | 2 | 3 | 4','1 | 2 | 3 | 4]'].map((riff,i)=>({id:'long'+i,chords:['F'],riff,riffVoices:[{id:'piano',label:i===0?'Pno':'',riff}]}))}]};const {container}=render(<ChordSheet song={s} language='zh' currentKey='F'/>);const last=container.querySelector('[data-preview-edit-anchor$="|long4|jianpu|all"]')!;expect(last).not.toBeNull();const lanes=last.querySelectorAll('[data-jianpu-voice]');expect(lanes).toHaveLength(2);for(const lane of lanes){expect(lane.querySelectorAll('[data-jianpu-phrase=incoming]')).toHaveLength(1)}
 });
});
