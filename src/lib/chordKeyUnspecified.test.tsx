import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Song} from '../types';
import ChordSheet from '../components/ChordSheet';
import PreviewBarEditor from '../components/preview-edit/PreviewBarEditor';
import ChordSubdivisionsEditor from '../components/ChordSubdivisionsEditor';
import {normalizeStoredSong} from './workspace';
import {copyPreviewContent,pastePreviewContent} from './previewClipboard';
import {applyBarKeyChange,isBarCompletelyEmpty,updateEditableBarFields} from './songEditing';
import {applyPreviewDraft,createPreviewEditSession,undoPreviewDraft} from './previewEditSession';

vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
afterEach(cleanup);
const source=():Song=>({title:'Unknown destination',originalKey:'G',currentKey:'G',timeSignature:'4/4',chordTimingVersion:2,sections:[{id:'s',title:'Bridge',bars:[{id:'degrees',chords:['1/3','5<'],chordTimingUnspecified:true,chordKeyUnspecified:true,annotation:'Original key change unspecified'},{id:'tag',chords:['4','6m','5','1~'],chordSubdivisions:[{beat:2,offset:.5,chord:'5'}],chordKeyUnspecified:true,annotation:'Source degrees; destination unmarked',rhythm:'q q e e q',finalBar:true},{id:'known',chords:['G']} ]},{id:'d',title:'Destination',keyChangeTo:'D',bars:[{id:'empty',chords:[]},{id:'next',chords:['D']}]}]});
const identity={sectionId:'s',barId:'degrees'},target={kind:'bar' as const,field:'chords' as const,previewIdentity:'qa',sectionId:'s',barId:'tag',slotIndex:0,rawChordIndex:0,anchorKey:'qa',anchorRect:{left:16,top:16,right:116,bottom:50,width:100,height:34}};
describe('source harmony with unspecified key',()=>{
 it.each([false,true])('keeps original degrees with both display modes, transposition and capo (%s)',numbers=>{
  const{container,rerender}=render(<ChordSheet song={{...source(),showNashvilleNumbers:numbers}} currentKey="A" language="zh"/>);
  const unknown=()=>container.querySelector('[data-preview-clipboard-bar="degrees"]')!;
  expect([...unknown().querySelectorAll('[data-untimed-chord]')].map(x=>x.textContent)).toEqual(['1/3','5']);
  expect(container.querySelectorAll('[data-chord-key-unspecified]')).toHaveLength(2);
  expect(container.querySelector('[data-preview-clipboard-bar="known"]')?.textContent).toContain(numbers?'1':'A');
  const events=()=>[...container.querySelectorAll('[data-preview-clipboard-bar="tag"] [data-chord-event-position]')].map(x=>x.textContent?.replace(/\s/g,''));
  expect(events().join('')).toContain('3&5');
  const tag=container.querySelector('[data-preview-clipboard-bar="tag"]')!;
  expect(tag.querySelector('details')?.textContent).toContain('Source degrees; destination unmarked');
  expect(tag.querySelector('[data-chord-key-unspecified]')?.className).toContain('-top-[10px]');
  rerender(<ChordSheet song={{...source(),capo:2,showNashvilleNumbers:numbers}} currentKey="B" language="zh"/>);
  expect([...unknown().querySelectorAll('[data-untimed-chord]')].map(x=>x.textContent)).toEqual(['1/3','5']);
  expect(events().join('')).toContain('3&5');
 });
 it('preserves strict flags, source subdivisions and distinct known pitches through reload',()=>{
  const n=normalizeStoredSong(JSON.parse(JSON.stringify(source())),0);expect(n.sections[0].bars[0].chordKeyUnspecified).toBe(true);expect(n.sections[0].bars[1].chordSubdivisions).toEqual([{beat:2,offset:.5,chord:'5'}]);expect(normalizeStoredSong(JSON.parse(JSON.stringify(n)),0)).toEqual(n);const invalid=source();(invalid.sections[0].bars[0]as any).chordKeyUnspecified='true';expect(normalizeStoredSong(invalid,0).sections[0].bars[0].chordKeyUnspecified).toBeUndefined();expect(isBarCompletelyEmpty({chords:[],chordKeyUnspecified:true})).toBe(false);
 });
 it('copies unknown harmony without adding a confirmed modulation or changing neighboring key context',()=>{
  const s=source(),clip=copyPreviewContent(s,[identity],'bars')!;const result=pastePreviewContent(s,[{sectionId:'d',barId:'empty'}],clip);expect(result.error).toBeUndefined();expect(result.song.sections[1].bars[0]).toMatchObject({chords:['1/3','5<'],chordKeyUnspecified:true,chordTimingUnspecified:true});expect(result.song.sections[1].bars[0].keyChangeTo).toBeUndefined();expect(result.song.sections[1].bars[1]).toEqual(s.sections[1].bars[1]);
  const chords=copyPreviewContent(s,[{sectionId:'s',barId:'tag'}],'chords')!,out=pastePreviewContent(s,[{sectionId:'d',barId:'next'}],chords);expect(out.song.sections[1].bars[1]).toMatchObject({chords:['4','6m','5','1~'],chordKeyUnspecified:true,chordSubdivisions:[{beat:2,offset:.5,chord:'5'}]});expect(applyBarKeyChange(s,identity,'A').sections[0].bars[0]).toMatchObject({chords:['1/3','5<'],chordKeyUnspecified:true});
 });
 it('keeps uncertainty separate from timing and supports explicit key confirmation with undo',()=>{
  const s=source(),session=createPreviewEditSession({song:s,target:{...target,barId:'degrees'},inputMode:'letters'}),timed=applyPreviewDraft(session,updateEditableBarFields(s,identity,{chordTimingUnspecified:undefined}));expect(timed.draftSong.sections[0].bars[0].chordKeyUnspecified).toBe(true);
  const keyed=applyPreviewDraft(session,updateEditableBarFields(applyBarKeyChange(s,identity,'A'),identity,{chordKeyUnspecified:undefined}));expect(keyed.draftSong.sections[0].bars[0].chordKeyUnspecified).toBeUndefined();expect(keyed.draftSong.sections[0].bars[0].chordTimingUnspecified).toBe(true);expect(undoPreviewDraft(keyed).draftSong).toEqual(session.draftSong);
 });
 it.each(['desktop','phone']as const)('edits original degree symbols without converting through the working key on %s',async layout=>{
  const user=userEvent.setup(),onApplyDraft=vi.fn(),session=createPreviewEditSession({song:source(),target,inputMode:'letters'});
  render(<PreviewBarEditor session={session} language="zh" deviceLayout={layout} storedKey="G" displayedKey="B" storageMode="letters" onApplyDraft={onApplyDraft} onInputModeChange={()=>{}} onNotationModeChange={()=>{}} onNotationCursorChange={()=>{}} onJianpuInputAbsoluteChange={()=>{}} onNavigate={()=>{}} onStructure={()=>{}} onUndo={()=>{}} onRedo={()=>{}} onDone={()=>{}} onCancel={()=>{}}/>);
  expect(screen.getByText(/目的調未標，保留原譜級數/)).toBeInTheDocument();
  if(layout==='desktop'){const input=screen.getByRole('textbox',{name:'和弦直接輸入'});expect(input).toHaveValue('4');fireEvent.change(input,{target:{value:'#4'}})}else{await user.click(screen.getByRole('button',{name:'拍內和弦與指定遍數和弦'}));expect(screen.getByRole('button',{name:'切換為字母和弦'})).toBeDisabled();await user.click(screen.getByRole('button',{name:/^6$/}))}
  const edited=onApplyDraft.mock.calls.at(-1)![0] as Song;expect(edited.sections[0].bars[1].chords[0]).toBe(layout==='desktop'?'#4':'6');expect(edited.sections[0].bars[1].chordKeyUnspecified).toBe(true);
 });
 it('adds a source degree subdivision and gives appropriate editing guidance',async()=>{
  const onChange=vi.fn(),user=userEvent.setup();render(<ChordSubdivisionsEditor bar={{chords:['4'],chordKeyUnspecified:true}} beats={4} language="zh" onChange={onChange}/>);expect(screen.getByText(/目的調未標；以原譜級數/)).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'新增拍內和弦'}));expect(onChange.mock.calls.at(-1)![0][0].chord).toBe('1');
 });
});
