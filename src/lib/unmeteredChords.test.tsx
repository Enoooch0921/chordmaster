import React from 'react';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/react';
import type {Song} from '../types';
import ChordSheet from '../components/ChordSheet';
import UnmeteredChordsEditor from '../components/UnmeteredChordsEditor';
import SongMetadataPanel from '../components/SongMetadataPanel';
import {normalizeSongBars} from './workspace';
import {getChordEvents} from '../utils/chordSubdivisions';
import {normalizeUnmeteredChordLines} from '../utils/unmeteredChords';
import {applyBarKeyChange,isBarCompletelyEmpty,updateEditableBarFields} from './songEditing';
import {copyPreviewContent,pastePreviewContent,previewClipboardText} from './previewClipboard';
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})});
const song=():Song=>({title:'原譜',originalKey:'G',currentKey:'G',timeSignature:'4/4',chordTimingVersion:2,barNumberMode:'all',sections:[{id:'s',title:'Verse',bars:[{id:'a',chords:['G']},{id:'u',chords:[],unmeteredChordLines:[['G','B'],['Em','F/G','Cm9']]},{id:'b',chords:['D']}]},{id:'c',title:'Other',keyChangeTo:'A',bars:[{id:'dest',chords:[],timeSignature:'3/4'}]}]});
const target={sectionId:'s',barId:'u'};
describe('source chord sequences without measured timing',()=>{
 it('retains provisional key provenance through reload, transposition and an explicit confirmation',()=>{
  const s={...song(),originalKeyUnspecified:true};const normalized=normalizeSongBars(JSON.parse(JSON.stringify(s)));expect(normalized.originalKeyUnspecified).toBe(true);
  for(const numbers of [false,true]){const {container}=render(<ChordSheet song={{...normalized,showNashvilleNumbers:numbers}} currentKey="A" language="zh"/>);expect(container.querySelector('[data-source-key-unconfirmed]')).toHaveTextContent('原調未定');const free=container.querySelector('[data-unmetered-chord-block="u"]')!;expect([...free.querySelectorAll('[data-unmetered-chord]')].map(c=>c.textContent)).toEqual(numbers?['1','3','6m','b7/1','4m9']:['A','C#','F#m','G/A','Dm9']);cleanup()}
  const onChange=vi.fn();render(<SongMetadataPanel song={s} language="zh" onChange={onChange}/>);fireEvent.click(screen.getByRole('checkbox',{name:'原調未定'}));expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({originalKey:'G',currentKey:'G',originalKeyUnspecified:undefined});cleanup();
  const {container}=render(<ChordSheet song={song()} currentKey="G" language="zh"/>);expect(container.querySelector('[data-source-key-unconfirmed]')).toBeNull();cleanup();
 });
 it('retains unknown source meter on reload and never displays the internal fallback as confirmed',()=>{
  const s={...song(),timeSignatureUnspecified:true};const normalized=normalizeSongBars(JSON.parse(JSON.stringify(s)));expect(normalized.timeSignatureUnspecified).toBe(true);
  const {container}=render(<ChordSheet song={normalized} currentKey="G" language="zh"/>);expect(container.querySelector('[data-preview-meta-value="timeSignature"]')?.textContent ?? container.textContent).toContain('未標');cleanup();
  const onChange=vi.fn();const view=render(<SongMetadataPanel song={s} language="zh" onChange={onChange}/>);const field=view.container.querySelector('[data-song-metadata-field="timeSignature"]')!;
  for(const input of field.querySelectorAll('input[type="text"]')){expect(input).toBeDisabled();expect(input).toHaveValue('')}
  fireEvent.click(screen.getByRole('checkbox',{name:'拍號未定'}));expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({timeSignature:'4/4',timeSignatureUnspecified:undefined});cleanup();
 });
 it('shows an explicit modulation on an unmeasured section in both letter and number views',()=>{
  const s=song();s.sections[1].bars[0].unmeteredChordLines=[['A','Bm']];
  for(const numbers of [false,true]){const {container}=render(<ChordSheet song={{...s,showNashvilleNumbers:numbers}} currentKey="A" language="zh"/>);const free=container.querySelector('[data-unmetered-chord-block="dest"]')!;expect(free.querySelector('[data-unmetered-key-change]')).toHaveTextContent('轉調 · B');expect([...free.querySelectorAll('[data-unmetered-chord]')].map(c=>c.textContent)).toEqual(numbers?['1','2m']:['B','C#m']);cleanup()}
 });
 it('normalizes and saves explicit empty blocks without making them measures',()=>{
  expect(normalizeUnmeteredChordLines([[' G ','','B'],[]])).toEqual([['G','B']]);expect(normalizeUnmeteredChordLines([['G',2]])).toBeUndefined();
  const s=song(),n=normalizeSongBars(JSON.parse(JSON.stringify(s)));expect(n.sections[0].bars[1].unmeteredChordLines).toEqual(s.sections[0].bars[1].unmeteredChordLines);expect(getChordEvents(n.sections[0].bars[1],4)).toEqual([]);expect(isBarCompletelyEmpty({chords:[],unmeteredChordLines:[]})).toBe(false);
 });
 it('transposes slash bass and distinct source chord qualities without changing lines or timing',()=>{
  const changed=applyBarKeyChange(song(),target,'A');expect(changed.sections[0].bars[1].unmeteredChordLines).toEqual([['A','C#'],['F#m','G/A','Dm9']]);expect(changed.sections[0].bars[1].chordSubdivisions).toBeUndefined();expect(changed.sections[0].bars[1].rhythm).toBeUndefined();
 });
 it('copies original lines to a different key and meter without inventing beat labels or barlines',()=>{
  const s=song(),clip=copyPreviewContent(s,[target],'chords')!;expect(previewClipboardText(clip)).toBe('G B\nEm F/G Cm9');expect(previewClipboardText(copyPreviewContent(s,[target],'bars')!)).not.toContain('|');
  const pasted=pastePreviewContent(s,[{sectionId:'c',barId:'dest'}],clip);expect(pasted.error).toBeUndefined();expect(pasted.song.sections[1].bars[0].unmeteredChordLines).toEqual([['A','C#'],['F#m','G/A','Dm9']]);expect(s.sections[0].bars[1].unmeteredChordLines).toEqual([['G','B'],['Em','F/G','Cm9']]);
 });
 it.each([1,2,3] as const)('renders source lines without beat cells and keeps adjacent measure numbers in layout %s',rows=>{
  const s=song();s.barRowCount=rows;const {container}=render(<ChordSheet song={s} currentKey="A" language="zh"/>);const free=container.querySelector('[data-unmetered-chord-block="u"]')!;expect(free).not.toBeNull();expect(free.querySelectorAll('[data-unmetered-chord-line]')).toHaveLength(2);expect([...free.querySelectorAll('[data-unmetered-chord]')].map(x=>x.textContent)).toEqual(['A','C#','F#m','G/A','Dm9']);expect(free.querySelector('.sheet-bar')).toBeNull();expect(free.querySelector('[data-preview-slot-index]')).toBeNull();expect(free.textContent).toContain('拍位待核');expect([...container.querySelectorAll('[data-preview-measure-number]')].map(x=>x.textContent?.trim())).toEqual(['1','2','3']);cleanup();
 });
 it('rejects a chord-only conversion that would hide existing rhythm, pitch or navigation',()=>{
  for(const patch of [{rhythm:'q q q q'},{riff:'1 2 3 4'},{repeatEnd:true}]){
   const s=song();Object.assign(s.sections[1].bars[0],patch);const clip=copyPreviewContent(s,[target],'chords')!;
   const result=pastePreviewContent(s,[{sectionId:'c',barId:'dest'}],clip);expect(result.error).toBe('unmetered-content');expect(result.song).toBe(s);
  }
  const s=song();const rhythm=copyPreviewContent(s,[{sectionId:'s',barId:'a'}],'rhythm')!;expect(pastePreviewContent(s,[target],rhythm).error).toBe('unmetered-content');
 });
 it('keeps editing whitespace and newline entry usable while external undo refreshes source lines',()=>{
  const onChange=vi.fn(),lines=[['G','B']];const {rerender}=render(<UnmeteredChordsEditor lines={lines} language="zh" onChange={onChange}/>);const input=screen.getByRole('textbox',{name:'未定拍位和弦序列'});fireEvent.change(input,{target:{value:'G B\n'}});expect(input).toHaveValue('G B\n');expect(onChange).toHaveBeenLastCalledWith([['G','B']]);rerender(<UnmeteredChordsEditor lines={[['A','C#']]} language="zh" onChange={onChange}/>);expect(input).toHaveValue('A C#');cleanup();
 });
 it('migrates legacy arrows in free lines once and keeps empty beat fields unchanged on editing',()=>{
  const s=song();s.chordTimingVersion=1;s.sections[0].bars[1].unmeteredChordLines=[['G','D>']];const migrated=normalizeSongBars(s);expect(migrated.sections[0].bars[1].unmeteredChordLines).toEqual([['G','D<']]);expect(normalizeSongBars(migrated)).toEqual(migrated);expect(updateEditableBarFields(migrated,target,{unmeteredChordLines:[['C','D']]}).sections[0].bars[1].chords).toEqual([]);
 });
});
